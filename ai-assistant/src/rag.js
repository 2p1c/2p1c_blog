/**
 * RAG (Retrieval-Augmented Generation) 模块
 * 使用 Transformers.js 本地 embedding 模型实现语义搜索
 *
 * 模型在后台异步加载，不阻塞请求。
 * 国内服务器设置环境变量: HF_MIRROR=https://hf-mirror.com
 */

import { pipeline, env } from '@xenova/transformers';

// 支持 HF 镜像（国内服务器设置 HF_MIRROR=https://hf-mirror.com）
if (process.env.HF_MIRROR) {
  env.remoteHost = process.env.HF_MIRROR;
  env.remotePathTemplate = '{model}/resolve/{revision}/';
}

const MIN_RELEVANCE_SCORE = 0.25;

let embeddingPipeline = null;
let modelLoadFailed = false;
let modelLoadPromise = null;

/**
 * 预加载 embedding 模型（后台执行，不阻塞）
 * 调用后模型在后台下载，就绪前 RAG 静默跳过
 */
export function preloadModel() {
  if (embeddingPipeline || modelLoadFailed || modelLoadPromise) return;

  console.log('[RAG] Preloading embedding model in background...');
  modelLoadPromise = pipeline('feature-extraction', 'Xenova/bge-small-zh-v1.5', {
    quantized: true,
    progress_callback: (progress) => {
      if (progress.status === 'download') {
        const pct = progress.progress ? ` (${Math.round(progress.progress)}%)` : '';
        console.log(`[RAG] Downloading model${pct}`);
      }
    }
  }).then(model => {
    embeddingPipeline = model;
    modelLoadPromise = null;
    console.log('[RAG] Embedding model ready');
    return model;
  }).catch(error => {
    modelLoadFailed = true;
    modelLoadPromise = null;
    embeddingPipeline = null;
    console.error(`[RAG] Failed to load embedding model: ${error.message}`);
    console.error('[RAG] RAG disabled. Set HF_MIRROR=https://hf-mirror.com if in China.');
    return null;
  });
}

/**
 * 生成文本 embedding。模型未就绪时返回 null（不阻塞等待）
 */
export async function generateEmbedding(text) {
  // 如果模型已在加载中，等待最多 3 秒
  if (modelLoadPromise && !modelLoadFailed) {
    try {
      await Promise.race([
        modelLoadPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
      ]);
    } catch {
      // 超时或失败，返回 null
    }
  }

  if (!embeddingPipeline) return null;

  try {
    const result = await embeddingPipeline(text, { pooling: 'mean', normalize: true });
    return Array.from(result.data);
  } catch (error) {
    console.error(`[RAG] generateEmbedding failed: ${error.message}`);
    return null;
  }
}

export function cosineSimilarity(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot; // normalize=true 时结果已在 [-1, 1]
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
    const articleUrl = p.url.replace(/^https?:\/\/localhost:\d+/, baseUrl);
    return `- [${p.title}${dateStr}]${tagStr}：[${articleUrl}]\n  ${p.excerpt}`;
  });

  return `\n## KNOWLEDGE — 博客相关内容\n以下是与当前问题最相关的博客文章，请基于这些真实文章回答：\n\n${lines.join('\n')}\n\n请基于以上文章信息回答用户的问题。如果这些文章无法回答用户的问题，诚实告知而不是编造。回复时将文章链接以 Markdown 链接格式写出，例如：[文章标题](https://example.com/posts/...)。`;
}
