/**
 * RAG (Retrieval-Augmented Generation) 模块
 * 使用 Transformers.js 本地 embedding 模型实现语义搜索
 */

import { pipeline } from '@xenova/transformers';

const MIN_RELEVANCE_SCORE = 0.25;

// 全局模型单例（进程生命周期内只加载一次）
let embeddingPipeline = null;

export async function loadEmbeddingModel() {
  if (embeddingPipeline) return embeddingPipeline;

  console.log('[RAG] Loading embedding model bge-small-zh-v1.5...');
  // bge-small-zh-v1.5: 24MB, 512 维, 中文优化
  embeddingPipeline = await pipeline('feature-extraction', 'Xenova/bge-small-zh-v1.5', {
    quantized: true,
    progress_callback: (progress) => {
      if (progress.status === 'download') {
        const pct = progress.progress ? ` (${Math.round(progress.progress)}%)` : '';
        console.log(`[RAG] Downloading model${pct}`);
      }
    }
  });
  console.log('[RAG] Embedding model ready');
  return embeddingPipeline;
}

export async function generateEmbedding(text) {
  if (!embeddingPipeline) {
    await loadEmbeddingModel();
  }

  const result = await embeddingPipeline(text, { pooling: 'mean', normalize: true });
  return Array.from(result.data);
}

export function cosineSimilarity(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot; // normalize=true 时结果已在 [-1, 1]，向量同向时 dot=cosine
}

export function migrateEmbeddingsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS post_embeddings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_url TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      excerpt TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '',
      embedding TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_post_embeddings_url ON post_embeddings(post_url);
  `);
}

export function searchRelevantPosts(db, queryEmbedding, topK = 3) {
  const rows = db.prepare(
    'SELECT post_url, title, excerpt, date, tags, embedding FROM post_embeddings'
  ).all();

  if (rows.length === 0) return [];

  return rows
    .map(row => ({
      url: row.post_url,
      title: row.title,
      excerpt: row.excerpt,
      date: row.date,
      tags: row.tags,
      score: cosineSimilarity(queryEmbedding, JSON.parse(row.embedding))
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .filter(r => r.score > MIN_RELEVANCE_SCORE);
}

export function formatRagKnowledge(posts, baseUrl = '') {
  if (!posts || posts.length === 0) return '';

  const lines = posts.map(p => {
    const dateStr = p.date ? ` (${p.date.slice(0, 10)})` : '';
    const tagStr = p.tags ? ` [${p.tags}]` : '';
    // 替换 localhost 为实际域名
    const articleUrl = p.url.replace(/^https?:\/\/localhost:\d+/, baseUrl);
    return `- [${p.title}${dateStr}]${tagStr}：[${articleUrl}]\n  ${p.excerpt}`;
  });

  return `\n## KNOWLEDGE — 博客相关内容\n以下是与当前问题最相关的博客文章，请基于这些真实文章回答：\n\n${lines.join('\n')}\n\n请基于以上文章信息回答用户的问题。如果这些文章无法回答用户的问题，诚实告知而不是编造。回复时将文章链接以 Markdown 链接格式写出，例如：[文章标题](https://example.com/posts/...)。`;
}