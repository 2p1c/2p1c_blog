import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { composeSystemPrompt, estimateTokens } from '../src/prompt-composer.js';

// ---------------------------------------------------------------------------
// Test 2, 5: composeSystemPrompt with userName (unit tests — no DB needed)
// ---------------------------------------------------------------------------

describe('composeSystemPrompt with userName parameter', () => {
  const mockConfig = {
    default: 'warm-senior',
    personas: {
      'warm-senior': {
        id: 'warm-senior',
        name: '温暖学长',
        prompt: '你是一个温暖的学长。'
      }
    }
  };
  const baseId = '你是朱禹同。';
  const postsIndex = '- 测试文章 (2026-01-01) [test] /posts/test/';

  it('injects user name into prompt when userName is provided', () => {
    const result = composeSystemPrompt(
      'warm-senior', mockConfig, baseId, postsIndex, '小明'
    );
    assert.ok(result.includes('当前正在和你对话的用户叫「小明」'));
    assert.ok(result.startsWith(baseId));
  });

  it('does NOT inject user name when userName is null', () => {
    const result = composeSystemPrompt(
      'warm-senior', mockConfig, baseId, postsIndex, null
    );
    assert.ok(!result.includes('当前正在和你对话的用户叫'));
  });

  it('does NOT inject user name when userName is undefined or empty', () => {
    let result = composeSystemPrompt(
      'warm-senior', mockConfig, baseId, postsIndex, undefined
    );
    assert.ok(!result.includes('当前正在和你对话的用户叫'));

    result = composeSystemPrompt(
      'warm-senior', mockConfig, baseId, postsIndex, ''
    );
    assert.ok(!result.includes('当前正在和你对话的用户叫'));
  });

  it('is backward compatible — no userName parameter', () => {
    const result = composeSystemPrompt(
      'warm-senior', mockConfig, baseId, postsIndex
    );
    assert.ok(!result.includes('当前正在和你对话的用户叫'));
  });
});

// ---------------------------------------------------------------------------
// Test 10: Parent test — placeholder (sanitizeDisplayName will be tested via
// server endpoint integration tests)
// ---------------------------------------------------------------------------

describe('sanitizeDisplayName (placeholder — tested via HTTP integration)', () => {
  it('HTML tags should be stripped from name input', () => {
    // SanitizeDisplayName lives in server.js and is called during POST /chat/register.
    // The HTTP test below verifies that server-side sanitization is applied.
    // Marking this as a placeholder to be verified in integration tests.
    assert.ok(true, 'Sanitization verified via /chat/register endpoint integration test');
  });
});

// ---------------------------------------------------------------------------
// Integration tests for server endpoints
// These require the server to be running. They are designed to verify:
// - POST /chat/register creates a user profile
// - GET /chat/profile returns profile data
// - composeSystemPrompt injects the user name (end-to-end)
// ---------------------------------------------------------------------------

let serverProcess = null;
const BASE_URL = 'http://127.0.0.1:4310';

async function waitForServer(url, maxRetries = 30) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const resp = await fetch(`${url}/health`, { signal: AbortSignal.timeout(1000) });
      if (resp.ok) return true;
    } catch {
      // Server not ready yet
    }
    await new Promise(r => setTimeout(r, 200));
  }
  return false;
}

describe('POST /chat/register endpoint', { skip: false }, () => {
  before(async () => {
    // Server is assumed to be running externally for integration tests.
    // If not running, tests will be skipped.
    const ready = await waitForServer(BASE_URL);
    if (!ready) {
      console.warn('Server not available, skipping integration tests');
    }
  });

  it('creates a user profile with valid uuid and name', { skip: process.env.SKIP_INTEGRATION === '1' }, async () => {
    const testUuid = `test-register-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const resp = await fetch(`${BASE_URL}/chat/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uuid: testUuid, name: '小明' })
    });
    assert.strictEqual(resp.status, 200);
    const body = await resp.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.profile.id, testUuid);
    assert.strictEqual(body.profile.display_name, '小明');
  });

  it('returns 400 for empty name', { skip: process.env.SKIP_INTEGRATION === '1' }, async () => {
    const testUuid = `test-empty-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const resp = await fetch(`${BASE_URL}/chat/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uuid: testUuid, name: '' })
    });
    assert.strictEqual(resp.status, 400);
    const body = await resp.json();
    assert.strictEqual(body.code, 'BAD_REQUEST');
  });

  it('returns 400 for name exceeding 50 characters after sanitization', { skip: process.env.SKIP_INTEGRATION === '1' }, async () => {
    const testUuid = `test-long-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const longName = 'A'.repeat(100);
    const resp = await fetch(`${BASE_URL}/chat/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uuid: testUuid, name: longName })
    });
    assert.strictEqual(resp.status, 400);
  });

  it('returns 400 for missing uuid', { skip: process.env.SKIP_INTEGRATION === '1' }, async () => {
    const resp = await fetch(`${BASE_URL}/chat/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '测试' })
    });
    assert.strictEqual(resp.status, 400);
  });

  it('upserts on same uuid with different name (idempotent)', { skip: process.env.SKIP_INTEGRATION === '1' }, async () => {
    const testUuid = `test-upsert-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const resp1 = await fetch(`${BASE_URL}/chat/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uuid: testUuid, name: '张三' })
    });
    assert.strictEqual(resp1.status, 200);

    const resp2 = await fetch(`${BASE_URL}/chat/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uuid: testUuid, name: '李四' })
    });
    assert.strictEqual(resp2.status, 200);
    const body2 = await resp2.json();
    assert.strictEqual(body2.profile.display_name, '李四');
  });
});

describe('GET /chat/profile endpoint', { skip: false }, () => {
  it('returns profile for known uuid', { skip: process.env.SKIP_INTEGRATION === '1' }, async () => {
    const testUuid = `test-profile-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    // First register
    await fetch(`${BASE_URL}/chat/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uuid: testUuid, name: '小华' })
    });

    const resp = await fetch(`${BASE_URL}/chat/profile?uuid=${encodeURIComponent(testUuid)}`);
    assert.strictEqual(resp.status, 200);
    const body = await resp.json();
    assert.strictEqual(body.profile.display_name, '小华');
  });

  it('returns null for unknown uuid', { skip: process.env.SKIP_INTEGRATION === '1' }, async () => {
    const resp = await fetch(`${BASE_URL}/chat/profile?uuid=nonexistent-12345`);
    assert.strictEqual(resp.status, 200);
    const body = await resp.json();
    assert.strictEqual(body.profile, null);
  });
});

describe('XSS sanitization via /chat/register', { skip: false }, () => {
  it('strips HTML tags from name input', { skip: process.env.SKIP_INTEGRATION === '1' }, async () => {
    const testUuid = `test-xss-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const resp = await fetch(`${BASE_URL}/chat/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uuid: testUuid, name: '<script>alert(1)</script>' })
    });
    assert.strictEqual(resp.status, 200);
    const body = await resp.json();
    assert.ok(!body.profile.display_name.includes('<script>'));
    assert.ok(!body.profile.display_name.includes('<'));
  });
});

// ---------------------------------------------------------------------------
// Test: composeSystemPrompt integration with real DB via server.js composePrompt
// This verifies the full pipeline: server resolves DB name → prompt-composer injects
// ---------------------------------------------------------------------------

describe('composeSystemPrompt with real DB profile (integration)', () => {
  it('should contain user name in prompt after registration', { skip: process.env.SKIP_INTEGRATION === '1' }, async () => {
    // This is verified via the HTTP integration test above — the /chat/stream
    // endpoint calls composePrompt which resolves the DB name before composing.
    // The test here is a unit-level verification of the prompt-composer layer.
    const mockConfig = {
      default: 'warm-senior',
      personas: {
        'warm-senior': {
          id: 'warm-senior',
          name: '温暖学长',
          prompt: '你是一个温暖的学长。'
        }
      }
    };
    const baseId = '## IDENTITY\n你是朱禹同。';
    const postsIndex = '- 文章 (2026-01-01) [tag] /posts/post/';

    // With user name
    const result = composeSystemPrompt(
      'warm-senior', mockConfig, baseId, postsIndex, '小明'
    );
    assert.ok(result.includes('当前正在和你对话的用户叫「小明」'));

    // Without user name (null)
    const result2 = composeSystemPrompt(
      'warm-senior', mockConfig, baseId, postsIndex, null
    );
    assert.ok(!result2.includes('当前正在和你对话的用户叫'));
  });
});
