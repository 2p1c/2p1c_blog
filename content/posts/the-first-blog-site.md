+++
date = '2026-01-09T10:55:15+08:00'
draft = false
title = 'The First Blog Site'
tags = ['tecs']
description = 'The detail procedure of creating the first blog site.'
+++

# Hugo 博客从租服务器到正式上线：完整实战总结

> 本文总结了一次**从零开始**将本地 Hugo 博客（使用 `vintage-web-hugo-theme` 主题）部署到 **阿里云 Linux 服务器** 并成功上线的完整流程，同时在最后给出「最强大脑式」的抽象总结，帮助你形成可迁移的通用模型。

---

## 一、总体目标

- 将**本地已构建完成的 Hugo 博客**部署到公网可访问的服务器
- 使用 **阿里云 ECS + Linux + Nginx**
- 使用**自己的域名或 IP 访问**
- 网站样式、JS、CSS 全部正常加载

---

## 二、阶段一：服务器租用与初始化

### 1. 选择云服务器

- 云厂商：**阿里云 ECS**
- 操作系统：**Ubuntu / CentOS（推荐 Ubuntu 20.04+）**
- 实例规格：

  - 1 核 CPU / 1~2GB 内存即可

- 网络：

  - 分配公网 IPv4 地址

👉 关键点：

- 你是**第一次使用 Linux**，完全没问题，本流程就是为此设计的

---

### 2. 设置登录方式（非常关键）

你遇到的第一个坑：**设置密码按钮点了没反应**

正确认知：

- 阿里云 ECS 的登录密码并不是实时生效
- 正确流程：

  1. 控制台 → 实例 → 更多 → 重置实例密码
  2. **必须重启实例**

验证方式：

```bash
ssh root@你的服务器IP
```

看到：

```text
root@xxx:~#
```

说明你已经成功进入服务器

---

## 三、阶段二：基础运行环境搭建

### 3. 安装并验证 Nginx

```bash
sudo apt update
sudo apt install nginx -y
```

启动并检查状态：

```bash
systemctl status nginx
```

浏览器访问：

```
http://服务器IP
```

看到：

```
Welcome to nginx!
```

✅ 说明三件事：

1. 服务器网络正常
2. Web 服务已运行
3. 80 端口未被防火墙拦截

---

### 4. 安装 Hugo（服务器端）

常见误区：

> 「我本地装了 Hugo，服务器是不是不用装？」

❌ 错

👉 **服务器如果要自己 build，也必须装 Hugo**

Ubuntu 示例：

```bash
sudo apt install hugo -y
hugo version
```

---

## 四、阶段三：部署 Hugo 博客

你使用的主题仓库：

```
https://github.com/raisingpixels/vintage-web-hugo-theme.git
```

该主题推荐的方式是：

### ✅ 正确部署方式：本地 build → 上传静态文件

```bash
hugo
```

生成：

```
public/
```

---

### 5. 上传 public 目录到服务器

```bash
scp -r public/* root@服务器IP:/var/www/html/
```

⚠️ 你中途遇到的问题：

```
Permission denied
```

根因总结：

- 服务器用户名不对（应使用 root）
- 或密码 / SSH 登录方式错误

最终成功后：

- 网站可访问
- **但没有样式 ❌**

---

## 五、阶段四：样式丢失问题的本质分析

### 6. 问题现象

- 页面有内容
- CSS / JS 全部没加载
- 浏览器 Network 显示 404

---

### 7. 根因：`baseURL` 错误

Hugo 中：

```toml
baseURL = "http://localhost:1313/"
```

❌ 部署到服务器后仍然是 localhost

👉 结果：

- HTML 访问的是：

```
http://localhost/css/style.css
```

浏览器当然加载不到

---

### 8. 正确做法

```toml
baseURL = "http://你的IP/"  # 或域名
```

然后：

```bash
hugo
scp -r public/* root@服务器IP:/var/www/html/
```

✅ 样式恢复，网站完整显示

---

## 六、阶段五：控制台报错的解释（你看到的红字）

### 9. 报错 1：favicon.ico 404

```text
GET /favicon.ico 404
```

原因：

- 浏览器自动请求
- 你的网站没提供 favicon

解决方式（任选）：

- 在 `static/` 中放一个 `favicon.ico`
- 或忽略（**完全不影响功能**）

---

### 10. 报错 2：Supabase / content.js / session

```text
Failed to get session: null
POST supabase.co/auth/v1/token 400
```

本质判断：

👉 **不是你的网站错误**

来源可能是：

- 浏览器插件
- 主题中遗留的 JS
- 历史测试代码

为什么是 400？

- 请求里带了空 refresh_token
- Supabase 返回 Bad Request

解决策略：

- 如果你没用 Supabase：

  - 删除相关 JS
  - 或忽略

---

### 11. 统一理解 400 错误

```text
Failed to load resource: the server responded with a status of 400
```

**400 = 请求格式错误**

不是服务器宕机
不是网络错误

👉 是「客户端发了不合理的请求」

---

## 七、最终状态确认清单

✅ 页面可访问
✅ 样式正常
✅ JS 正常（除无关插件）
✅ Hugo 本地 / 服务器流程清晰

你已经完成：

> **一次完整的工程级部署闭环**

---

## 八、「最强大脑式」抽象总结（核心模型）

### 🧠 一句话模型

> **Hugo = 内容生成器，Nginx = 静态文件服务器**

---

### 🧩 三层结构抽象

```
[ 浏览器 ]
     ↓ HTTP
[ Nginx ]  ——  只负责“给文件”
     ↓
[ /var/www/html ] —— public 里的静态文件
```

---

### 🧠 Hugo 的真正角色

- Hugo **不会运行在服务器上给用户看**
- 它只做一件事：

```
Markdown → HTML + CSS + JS
```

---

### 🔑 所有问题的母题

| 问题     | 本质        |
| -------- | ----------- |
| 样式丢失 | URL 错误    |
| 404      | 文件不存在  |
| 400      | 请求不合法  |
| 登录失败 | 权限 / 认证 |

---