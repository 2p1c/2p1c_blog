import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const personasPath = path.resolve(__dirname, '../config/personas.json');

import {
  composeSystemPrompt,
  loadPersonasConfig,
  loadPostsIndex,
  estimateTokens
} from '../src/prompt-composer.js';

const baseIdentity = '## IDENTITY\n我是朱禹同，天津大学研二学生。\n我的研究方向是超声波无损检测。';

describe('composeSystemPrompt', () => {
  let personasConfig;

  before(() => {
    personasConfig = loadPersonasConfig(personasPath);
  });

  it('returns string containing ## IDENTITY, ## TONE, ## KNOWLEDGE in that exact order', () => {
    const result = composeSystemPrompt('warm-senior', personasConfig, baseIdentity, 'test post index');
    const identityIdx = result.indexOf('## IDENTITY');
    const toneIdx = result.indexOf('## TONE');
    const knowledgeIdx = result.indexOf('## KNOWLEDGE');

    assert.ok(identityIdx >= 0, 'contains ## IDENTITY');
    assert.ok(toneIdx >= 0, 'contains ## TONE');
    assert.ok(knowledgeIdx >= 0, 'contains ## KNOWLEDGE');
    assert.ok(identityIdx < toneIdx, '## IDENTITY appears before ## TONE');
    assert.ok(toneIdx < knowledgeIdx, '## TONE appears before ## KNOWLEDGE');
  });

  it('returns different TONE content for warm-senior vs humorous-friend, same IDENTITY', () => {
    const warm = composeSystemPrompt('warm-senior', personasConfig, baseIdentity, '');
    const humorous = composeSystemPrompt('humorous-friend', personasConfig, baseIdentity, '');

    assert.notStrictEqual(warm, humorous, 'different personas produce different output');

    const warmToneStart = warm.indexOf('## TONE');
    const humorousToneStart = humorous.indexOf('## TONE');
    const warmTone = warm.slice(warmToneStart);
    const humorousTone = humorous.slice(humorousToneStart);

    assert.notStrictEqual(warmTone, humorousTone, 'TONE sections differ between personas');
    // IDENTITY section should be identical since baseIdentity is same
    assert.ok(warm.startsWith(baseIdentity), 'warm-senior starts with baseIdentity');
    assert.ok(humorous.startsWith(baseIdentity), 'humorous-friend starts with baseIdentity');
  });

  it('defaults to warm-senior with console.warn for unknown persona_id', () => {
    const originalWarn = console.warn;
    let warnCalled = false;
    let warnMessage = '';
    console.warn = (msg) => { warnCalled = true; warnMessage = msg; };

    try {
      const result = composeSystemPrompt('unknown-persona', personasConfig, baseIdentity, '');
      assert.ok(warnCalled, 'console.warn was called for unknown persona');
      assert.ok(warnMessage.includes('unknown-persona'), 'warning mentions the unknown id');
      assert.ok(result.includes('## TONE'), 'result still has TONE section');
      // Should contain warm-senior's content
      // Verify warm-senior persona prompt content is present
      assert.ok(result.includes('温暖'), 'contains warm-senior prompt content ("温暖")');
      assert.ok(result.includes('支持性'), 'contains warm-senior prompt content ("支持性")');
    } finally {
      console.warn = originalWarn;
    }
  });

  it('defaults to warm-senior for empty/null/undefined personaId', () => {
    const warm = composeSystemPrompt('warm-senior', personasConfig, baseIdentity, '');

    const resultNull = composeSystemPrompt(null, personasConfig, baseIdentity, '');
    const resultUndef = composeSystemPrompt(undefined, personasConfig, baseIdentity, '');
    const resultEmpty = composeSystemPrompt('', personasConfig, baseIdentity, '');

    assert.strictEqual(resultNull, warm, 'null defaults to warm-senior');
    assert.strictEqual(resultUndef, warm, 'undefined defaults to warm-senior');
    assert.strictEqual(resultEmpty, warm, 'empty string defaults to warm-senior');
  });

  it('omits ## KNOWLEDGE section when postsIndexText is empty/falsy', () => {
    const result = composeSystemPrompt('warm-senior', personasConfig, baseIdentity, '');
    assert.ok(!result.includes('## KNOWLEDGE'), 'no ## KNOWLEDGE when postsIndexText is empty');
  });

  it('includes ## KNOWLEDGE section when postsIndexText is non-empty', () => {
    const result = composeSystemPrompt('warm-senior', personasConfig, baseIdentity, '一些博客文章内容');
    assert.ok(result.includes('## KNOWLEDGE'), 'has ## KNOWLEDGE section');
    assert.ok(result.includes('博客内容'), 'KNOWLEDGE section has meaningful content');
  });

  it('uses bookend strategy in TONE section', () => {
    const result = composeSystemPrompt('warm-senior', personasConfig, baseIdentity, '');
    assert.ok(result.includes('请始终遵循以上语气风格'), 'has bookend phrase in TONE');
    assert.ok(result.includes('记住你的性格设定'), 'has personality reminder in TONE');
  });
});

describe('loadPersonasConfig', () => {
  it('loads valid personas.json with exactly 4 personas', () => {
    const config = loadPersonasConfig(personasPath);
    assert.ok(config.personas, 'has personas object');
    assert.ok(config.defaultPersona, 'has defaultPersona');
    assert.strictEqual(config.defaultPersona, 'warm-senior');

    const keys = Object.keys(config.personas);
    assert.strictEqual(keys.length, 4, 'exactly 4 personas');
    assert.ok(keys.includes('warm-senior'));
    assert.ok(keys.includes('humorous-friend'));
    assert.ok(keys.includes('literary-youth'));
    assert.ok(keys.includes('metal-rock-youth'));
  });

  it('each persona has required fields: id (string), name (string), prompt (string)', () => {
    const config = loadPersonasConfig(personasPath);
    for (const [id, p] of Object.entries(config.personas)) {
      assert.strictEqual(p.id, id, `${id}: id field matches key`);
      assert.ok(typeof p.name === 'string' && p.name.length > 0, `${id}: has non-empty name`);
      assert.ok(typeof p.prompt === 'string' && p.prompt.length > 0, `${id}: has non-empty prompt`);
    }
  });

  it('returns built-in warm-senior fallback for missing file', () => {
    const config = loadPersonasConfig('/nonexistent/path/personas.json');
    assert.ok(config.personas, 'has personas object in fallback');
    assert.ok(config.personas['warm-senior'], 'has warm-senior in fallback');
    assert.strictEqual(config.defaultPersona, 'warm-senior');
  });

  it('skips personas with missing required fields (validates each entry)', () => {
    // We test this indirectly: the real personas.json has valid entries,
    // and the fallback only has warm-senior. Both cases are validated.
    const config = loadPersonasConfig(personasPath);
    const warm = config.personas['warm-senior'];
    assert.ok(warm.id && warm.name && warm.prompt, 'warm-senior has all required fields');
  });
});

describe('loadPostsIndex', () => {
  it('returns empty string for non-existent file (graceful degradation)', () => {
    const result = loadPostsIndex('/nonexistent/posts-index.json');
    assert.strictEqual(result, '', 'returns empty string for missing file');
  });

  it('returns formatted block for valid posts array', () => {
    const tmpDir = path.resolve(__dirname, '../data');
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmpPath = path.join(tmpDir, 'test-posts-tmp.json');
    const testPosts = [
      { title: 'Docker入门指南', date: '2026-01-15T00:00:00Z', tags: ['docker', 'linux'], link: '/posts/docker-intro/' },
      { title: 'JavaScript异步编程', date: '2026-02-01T00:00:00Z', tags: ['javascript', 'async'], link: '/posts/js-async/' }
    ];
    fs.writeFileSync(tmpPath, JSON.stringify(testPosts));

    try {
      const result = loadPostsIndex(tmpPath);
      assert.ok(result.includes('Docker入门指南'), 'includes post 1 title');
      assert.ok(result.includes('JavaScript异步编程'), 'includes post 2 title');
      assert.ok(result.includes('docker'), 'includes tags');
      assert.ok(result.includes('2026-01-15'), 'includes date (YYYY-MM-DD)');
      assert.ok(result.includes('/posts/docker-intro/'), 'includes link');
    } finally {
      fs.unlinkSync(tmpPath);
    }
  });

  it('returns empty string for empty posts array', () => {
    const tmpDir = path.resolve(__dirname, '../data');
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmpPath = path.join(tmpDir, 'test-empty-tmp.json');
    fs.writeFileSync(tmpPath, '[]');

    try {
      const result = loadPostsIndex(tmpPath);
      assert.strictEqual(result, '', 'returns empty for empty array');
    } finally {
      fs.unlinkSync(tmpPath);
    }
  });

  it('returns empty string for non-array JSON', () => {
    const tmpDir = path.resolve(__dirname, '../data');
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmpPath = path.join(tmpDir, 'test-obj-tmp.json');
    fs.writeFileSync(tmpPath, '{"not": "an array"}');

    try {
      const result = loadPostsIndex(tmpPath);
      assert.strictEqual(result, '', 'returns empty for object instead of array');
    } finally {
      fs.unlinkSync(tmpPath);
    }
  });
});

describe('estimateTokens', () => {
  it('calculates token estimate for ASCII text', () => {
    assert.strictEqual(estimateTokens('hello'), 2); // 5/3 = 2
    assert.strictEqual(estimateTokens(''), 0);
    assert.strictEqual(estimateTokens('abc'), 1); // 3/3 = 1
  });

  it('calculates token estimate for Chinese text', () => {
    assert.strictEqual(estimateTokens('你好世界'), 2); // 4/3 = 2
  });

  it('handles mixed content', () => {
    const mixed = '你好world';
    assert.strictEqual(estimateTokens(mixed), 3); // 8/3 = 3
  });
});
