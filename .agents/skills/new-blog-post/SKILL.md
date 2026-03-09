---
name: new-blog-post
description: 为当前 Hugo 博客创建一篇新博文。只要用户提到“创建新博文”“新建文章”“写一篇博客草稿”“创建 post”“hugo new”“补 front matter”“帮我生成 title、description、tags、categories、summary”等意图，就应使用这个技能。这个技能会根据用户描述推断标题、摘要、标签和分类；如果信息不足，会先用极少量问题确认，再创建文章文件并写入合适的 front matter。
---

# New Blog Post

这个技能用于当前仓库的 Hugo 博客发文流程。

## 目标

当用户要创建一篇新博文时，执行以下工作：

1. 理解用户要写什么主题
2. 推断合适的 title、description、tags、categories、summary
3. 如果关键信息不足，先简短追问
4. 在 content/posts/ 下创建文章
5. 写入完整 front matter，并保留 draft = true 作为默认值

## 仓库约定

当前博客的文章默认放在 content/posts/。

当前 archetype 至少包含这些字段：

1. date
2. draft
3. title
4. description
5. tags
6. categories
7. summary

当前 taxonomy 配置是：

1. categories
2. tags
3. series

除非用户明确要求，否则不要自动写 series。

## 触发条件

出现下列意图时直接使用本技能：

1. 创建一篇新博文
2. 新建一篇文章
3. 帮我写一个 Hugo post 草稿
4. 用 hugo new 建一篇文章
5. 帮我补 description、tags、categories
6. 根据题目帮我生成 front matter

## 执行流程

### 第一步：提取用户输入

优先从用户当前消息中提取：

1. 主题
2. 标题
3. 文章要点
4. 目标读者
5. 语言风格

如果用户已经明确给出标题或主题，不要重复追问。

### 第二步：推断 front matter

根据用户描述生成：

1. title：简洁、可读，适合作为博客标题
2. description：1 句话摘要，说明文章讲什么
3. tags：2 到 5 个细粒度标签
4. categories：1 到 2 个较大的分类

推断原则：

1. tags 偏具体，例如 hugo、vps、linux、prompt-engineering
2. categories 偏大类，例如 tech、tutorial、notes、life
3. description 不能空泛，要能概括文章内容
4. title 不要只是 slug，要适合页面展示

### 第三步：判断是否需要追问

如果下面信息不明确，先问用户，不要盲目创建：

1. 连文章主题都不清楚
2. 用户只说“帮我建一篇文章”，没有任何方向
3. 现有信息不足以合理推断 title 和 description

提问要求：

1. 一次最多问 2 到 3 个必要问题
2. 问题必须短
3. 能推断的就不要问

### 第四步：生成 slug 和文件路径

默认将文章创建到：

1. content/posts/<slug>.md

slug 规则：

1. 使用英文小写和连字符
2. 优先根据英文标题生成
3. 如果用户标题是中文，生成一个简短、可读的英文 slug
4. 避免使用空格和特殊字符

### 第五步：创建文章

优先采用下面的方式：

1. 如果适合使用 Hugo 创建骨架，则使用 hugo new posts/<slug>.md
2. 然后补全或覆盖 front matter

如果命令方式不方便，也可以直接创建 content/posts/<slug>.md。

默认 front matter 结构：

```toml
+++
date = '2026-03-09T12:00:00+08:00'
draft = true
title = '文章标题'
description = '一句话描述文章内容。'
tags = ['tag-1', 'tag-2']
categories = ['tech']
+++

```

正文部分：

1. 如果用户要求只创建文章文件，正文留空即可
2. 如果用户要求顺手写一个草稿，再补正文

## 分类与标签建议

如果用户没有指定，可按内容推断：

### 常见 categories

1. tech：技术、工具、开发、部署
2. tutorial：教程、步骤说明、实践记录
3. notes：学习笔记、总结
4. life：生活记录、感想
5. writing：写作、内容创作、博客建设

### 常见 tags 示例

1. hugo
2. vps
3. linux
4. github-actions
5. prompt-engineering
6. ai
7. blog
8. css
9. javascript
10. deployment

不要机械套模板，要根据实际主题判断。

## 输出要求

完成后向用户简洁汇报：

1. 创建了哪篇文章
2. 文件路径是什么
3. 采用了哪些 title、description、tags、categories
4. 如果有你做出的推断，也要说明

## 示例

### 示例 1

用户说：

“帮我创建一篇关于用 Hugo 和 GitHub Actions 自动部署博客的文章。”

你应该：

1. 推断 title 类似 `Deploying a Hugo Blog with GitHub Actions`
2. 推断 description
3. 推断 tags 类似 `['hugo', 'github-actions', 'deployment']`
4. 推断 categories 类似 `['tech', 'tutorial']`
5. 创建文件到 content/posts/deploying-hugo-blog-with-github-actions.md

### 示例 2

用户说：

“新建一篇博客，主题是我对提示词工程的理解。”

你应该：

1. 可以先推断 title
2. 如果标题不够确定，可以追问用户要中文标题还是英文标题
3. 然后创建文件并写入 front matter

## 注意事项

1. 不要把 title 留成 slug 形式
2. 不要生成过长的 description
3. 不要塞太多 tags，通常 2 到 5 个足够
4. 不要在信息明显不足时强行猜测复杂内容
5. 用户只要创建文件时，不要擅自写很长正文