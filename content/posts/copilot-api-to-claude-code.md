+++
date = '2026-01-30T20:10:08+08:00'
draft = true
title = 'Copilot Api to Claude Code'

tags = ['tecs']
description = '使用 copilot-api 转发为 claude api 从而使用 Claude code 编程'

+++

# copilot-api 转发为claude api从而使用Claude code

由于我们可以申请学生权益，每月的模型额度还是很高的，通过此方法可以免费体验Claude code编程。

安装` copilot-api`

```shell
npm install -g copilot-api
```

安装`claude code`

```shell
npm install -g @anthropic-ai/claude-code
```

新建一个终端，启动代理服务。

```shell
copilot-api start
```

系统提示授权，点击链接进行授权，输入终端中出现的8位验证码。

点击Usage Viewer链接可以监控剩余额度。

![](./../../static/images/image-20260130202439074.png)

不要关闭上一个终端，新建另一个终端，创建Claude code配置文件。` ~/.claude/settings.json`并添加

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:4141",
    "ANTHROPIC_AUTH_TOKEN": "dummy",
    "ANTHROPIC_MODEL": "claude-sonnet-4",
    "ANTHROPIC_SMALL_FAST_MODEL": "claude-3.7-sonnet",
    "DISABLE_NON_ESSENTIAL_MODEL_CALLS": "1",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1"
  }
}
```

**配置说明**：

- `ANTHROPIC_BASE_URL`: 指向本地代理服务地址；
- `ANTHROPIC_AUTH_TOKEN`: 填写任意值即可（代理会处理真实认证）；
- `ANTHROPIC_MODEL`: 主要模型，推荐 `claude-opus-4` 或 `claude-sonnet-4`；
- `ANTHROPIC_SMALL_FAST_MODEL`: 快速模型，用于轻量级任务；
- 后两个参数用于优化性能。

配置完成后，在终端执行`claude`即可开始使用，`/model`可以查看当前使用的模型。
