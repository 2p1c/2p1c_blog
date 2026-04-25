import fs from 'node:fs';

const TOKEN_BUDGET = 2500;

/**
 * 估算文本的 token 数量。
 * 保守估计：混合中英文内容按 3 字符/token 计算。
 */
export function estimateTokens(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return 0;
  }
  return Math.ceil(text.length / 3);
}

/**
 * 加载 personas 配置文件。
 * 验证每个 persona 的必需字段（id, name, prompt）。
 * 文件缺失或格式错误时返回内置的 warm-senior 回退。
 */
export function loadPersonasConfig(configPath) {
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw);
    const personas = config.personas || {};
    const defaultPersona = config.default || 'warm-senior';

    // 验证每个 persona 的必需字段
    for (const [id, p] of Object.entries(personas)) {
      if (!p.id || !p.name || !p.prompt) {
        console.warn(`Persona "${id}" is missing required fields, skipping`);
        delete personas[id];
      }
    }

    if (Object.keys(personas).length === 0) {
      throw new Error('No valid personas in config');
    }

    console.log(`Loaded ${Object.keys(personas).length} persona(s), default: ${defaultPersona}`);
    return { personas, defaultPersona };
  } catch (error) {
    console.warn('Failed to load personas.json, using built-in warm-senior only:', error.message);
    return {
      personas: {
        'warm-senior': {
          id: 'warm-senior',
          name: '温暖学长',
          prompt: '你的语气应该是温暖、支持性的，像一位耐心的学长。'
        }
      },
      defaultPersona: 'warm-senior'
    };
  }
}

/**
 * 加载 posts-index.json 并格式化为简洁文本块。
 * 每篇文章包含：标题、日期(YYYY-MM-DD)、标签、链接。
 * 文件缺失或格式无效时返回空字符串（优雅降级）。
 */
export function loadPostsIndex(indexPath) {
  try {
    const raw = fs.readFileSync(indexPath, 'utf-8');
    const posts = JSON.parse(raw);

    if (!Array.isArray(posts) || posts.length === 0) {
      console.warn('posts-index.json is empty or invalid, content awareness disabled');
      return '';
    }

    const lines = posts.map(p => {
      const tags = (p.tags || []).join(', ');
      const date = (p.date || '').slice(0, 10); // YYYY-MM-DD
      return `- ${p.title} (${date}) [${tags}] ${p.link}`;
    });
    const block = lines.join('\n');

    console.log(`Loaded ${posts.length} posts into index (${lines.length} lines)`);
    return block;
  } catch (error) {
    console.warn('posts-index.json not found or unreadable, content awareness disabled');
    return '';
  }
}

/**
 * 动态组合系统提示词。
 * 结构：## IDENTITY → ## TONE → ## KNOWLEDGE（分层顺序）
 * TONE 使用 bookend 策略：开头和结尾都有性格提醒。
 * KNOWLEDGE 仅在 postsIndexText 非空时添加。
 * personaId 未知时回退到默认 persona（默认 warm-senior）。
 * 预估 token 数超过预算 80% 时记录警告。
 */
export function composeSystemPrompt(personaId, personasConfig, baseIdentity, postsIndexText) {
  // 解析 personaId：未知或空值时回退到默认
  const resolvedPersonaId = personaId && personasConfig.personas[personaId]
    ? personaId
    : (personasConfig.personas[personasConfig.defaultPersona]
      ? personasConfig.defaultPersona
      : 'warm-senior');

  if (personaId && !personasConfig.personas[personaId]) {
    console.warn(`Unknown persona_id "${personaId}", defaulting to "${resolvedPersonaId}"`);
  }

  const persona = personasConfig.personas[resolvedPersonaId];

  // ## TONE 段：性格提示 + bookend 策略
  const toneSection = `\n## TONE — 语气和风格\n${persona.prompt}\n\n请始终遵循以上语气风格。记住你的性格设定，在每一次回复中都要自然地体现出来。`;

  // ## KNOWLEDGE 段：仅在 postsIndexText 非空时添加
  let knowledgeSection = '';
  if (postsIndexText) {
    knowledgeSection = `\n## KNOWLEDGE — 博客内容\n以下是博客中已发布文章的信息，你可以根据这些信息回答用户关于博客内容的问题，推荐相关文章，或讨论文章主题：\n\n${postsIndexText}\n\n当用户询问博客相关内容时，请基于以上真实文章信息回答。如果没有匹配的文章，诚实告知而不是编造不存在的内容。`;
  }

  const composed = `${baseIdentity}${toneSection}${knowledgeSection}`;

  // Token 预算监控
  const estimatedTokens = estimateTokens(composed);
  if (estimatedTokens > TOKEN_BUDGET * 0.8) {
    console.warn(`[TOKEN-BUDGET] System prompt estimated at ${estimatedTokens} tokens (${Math.round(estimatedTokens / TOKEN_BUDGET * 100)}% of ${TOKEN_BUDGET} target). persona_id="${resolvedPersonaId}", posts_index=${postsIndexText ? 'loaded' : 'empty'}`);
  }

  return composed;
}
