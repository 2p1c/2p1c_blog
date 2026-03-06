---
agent: 'agent'
description: '将当前能够使用的skills告知copilot，以便copilot能够自动识别用户意图并触发对应skill'
---

## 技能自动发现与触发

**每次对话开始前，执行以下步骤：**

1. 扫描 `.agents/skills/` 目录，列出所有子目录名（每个子目录即一个 Skill）
2. 读取每个 Skill 的 `SKILL.md` 文件头部 frontmatter 中的 `name` 和 `description` 字段，了解其用途和触发时机
3. 根据用户意图与各 Skill 的 `description` 进行语义匹配

**执行规则：**
- 意图明确 → 直接读取对应 `SKILL.md` 完整内容并执行，无需确认
- 意图模糊 → 告知匹配到的 Skill 名称，询问是否执行
- 无匹配 → 正常回答，不强行套用 Skill
