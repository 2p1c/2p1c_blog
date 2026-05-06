/**
 * 从 posts-index.json 生成文章 embedding 并存入 SQLite
 * 使用 Transformers.js 本地模型，零 API 调用
 * 用法: node scripts/build-index.js
 *
 * 国内服务器设置环境变量: HF_MIRROR=https://hf-mirror.com
 */
import dotenv from 'dotenv';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline, env } from '@xenova/transformers';

dotenv.config();

// 支持 HF 镜像（国内服务器设置 HF_MIRROR=https://hf-mirror.com）
if (process.env.HF_MIRROR) {
  env.remoteHost = process.env.HF_MIRROR;
  env.remotePathTemplate = '{model}/resolve/{revision}/';
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || './data/chat.db';
const POSTS_INDEX_PATH = process.env.POSTS_INDEX_PATH
  || path.resolve(__dirname, '../data/posts-index.json');

function resolvePath(p) {
  return path.isAbsolute(p) ? p : path.resolve(__dirname, '..', p);
}

async function loadModel() {
  try {
    console.log('Loading embedding model...');
    const model = await pipeline('feature-extraction', 'Xenova/bge-small-zh-v1.5', { quantized: true });
    console.log('Model ready');
    return model;
  } catch (error) {
    console.error(`Failed to load embedding model: ${error.message}`);
    console.error('Set HF_MIRROR=https://hf-mirror.com if deploying in China.');
    return null;
  }
}

async function main() {
  const dbPath = resolvePath(DB_PATH);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);

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

  if (!fs.existsSync(POSTS_INDEX_PATH)) {
    console.error(`posts-index.json not found at ${POSTS_INDEX_PATH}`);
    process.exit(1);
  }

  const posts = JSON.parse(fs.readFileSync(POSTS_INDEX_PATH, 'utf-8'));
  console.log(`Found ${posts.length} posts in index`);

  const embedder = await loadModel();
  if (!embedder) {
    console.log('Embedding model unavailable, skipping embedding generation.');
    console.log('RAG semantic search will be disabled until model is available.');
    db.close();
    process.exit(0);
  }

  const upsertStmt = db.prepare(`
    INSERT INTO post_embeddings (post_url, title, excerpt, date, tags, embedding, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(post_url) DO UPDATE SET
      title = excluded.title,
      excerpt = excluded.excerpt,
      date = excluded.date,
      tags = excluded.tags,
      embedding = excluded.embedding,
      created_at = excluded.created_at
  `);

  let newCount = 0;
  let skipCount = 0;

  for (const post of posts) {
    if (!post.link) {
      console.warn(`  ⚠ post missing link: ${post.title || 'unknown'}, skipping`);
      continue;
    }

    const existing = db.prepare('SELECT post_url FROM post_embeddings WHERE post_url = ?').get(post.link);
    if (existing) {
      skipCount++;
      console.log(`  ○ ${post.title} (cached)`);
      continue;
    }

    const text = [post.title, post.excerpt || ''].filter(Boolean).join('\n');

    const result = await embedder(text, { pooling: 'mean', normalize: true });
    const embedding = JSON.stringify(Array.from(result.data));

    upsertStmt.run(
      post.link,
      post.title,
      post.excerpt || '',
      (post.date || '').slice(0, 10),
      (post.tags || []).join(', '),
      embedding,
      Date.now()
    );
    newCount++;
    console.log(`  ✓ ${post.title}`);
  }

  console.log(`\nDone: ${newCount} new embedding(s), ${skipCount} skipped (already cached)`);
  db.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});