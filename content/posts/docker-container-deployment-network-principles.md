+++
date = '2026-04-25'
draft = false
title = 'Docker 容器部署与网络通信原理'
description = '深入解析 Docker 容器部署架构，从 Dockerfile 构建、docker-compose 编排到容器网络通信原理，涵盖 bridge 网络、DNS 解析、端口映射等核心概念'
summary = '通过实际项目经验，详细讲解 Docker 容器化部署的完整流程，包括 Dockerfile 分层构建、docker-compose 多服务编排、容器间通信机制（DNS 解析、bridge 网络、host.docker.internal），以及 HTTP、WebSocket 等通信协议的适用场景'
tags = ['Docker', '容器化', '网络通信', '部署', '架构设计']
categories = ['技术', '后端开发', 'DevOps']
+++

# Docker 容器部署与网络通信原理

## 一、项目 Docker 部署架构

本项目使用 docker-compose 编排两个容器：Redis 和 inference-service（推理服务）。Redis 负责事件流存储，inference-service 从 Redis Stream 读取 detection.requested 事件进行 YOLOv12 推理，并将检测结果上报给宿主机上的 Platform 服务。

### 核心文件

- **Dockerfile**

基于 python:3.11-slim 基础镜像。安装系统图形库依赖（libgl1、libglib2.0-0 等），复制项目代码和模型权重，使用 PyTorch CPU 版安装依赖，通过 uvicorn 启动 FastAPI 服务。

- **deploy/docker-compose.yml**

编排 redis:7 和 inference-service 两个容器。配置环境变量（PLATFORM_API_BASE_URL、REDIS_URL 等）和 Volume 挂载（weights、outputs），实现数据持久化和运行时可更新的模型权重。

- **.dockerignore**

排除 .git、__pycache__、.venv 等本地开发文件，减小镜像体积。

## 二、Dockerfile 构建原理

Dockerfile 采用多阶段逻辑（非多阶段构建，而是分层构建），分为 4 层：

### 分层构建

- **Base 层**：基于 python:3.11-slim 镜像
- **系统依赖层**：安装 libgl1、libglib2.0-0 等图形库
- **代码层**：复制项目代码、模板、权重文件
- **依赖层**：先安装 PyTorch CPU 版，再安装项目依赖

### 关键设计决策

- **PyTorch CPU 版**：指定 `--index-url https://download.pytorch.org/whl/cpu`，使用 CPU 推理，镜像不含 CUDA/cuDNN，体积更小
- **`--no-cache-dir --retries 8`**：网络不稳定时自动重试，减少构建失败
- **`EXPOSE 8000`**：声明容器监听端口（文档性质，真正生效的是 docker-compose 的 ports）
- **`CMD uvicorn app:app --host 0.0.0.0 --port 8000`**：启动 FastAPI，监听所有网络接口

## 三、docker-compose 编排与端口映射

推理容器与其他服务的通信有三种不同的路径，每种路径的原理和配置方式不同：

### 路径 1：容器 → Redis（Docker DNS 解析）

配置：`REDIS_URL: "redis://redis:6379/0"`

Docker Compose 自动创建一个 bridge 网络，所有容器加入其中。Docker 内置 DNS 将服务名 redis 解析为 Redis 容器的内网 IP。容器之间直接 TCP 连接，不需要任何端口映射。

### 路径 2：外部 → 容器 HTTP API（端口映射）

配置：`ports: "8000:8000"`

将宿主机的 8000 端口映射到容器的 8000 端口。外部调用者通过 `宿主机IP:8000` 访问推理服务的 HTTP API（/health、/predict 等）。这是三种路径中唯一需要端口映射的。

### 路径 3：容器 → 宿主机 Platform（host.docker.internal）

配置：`PLATFORM_API_BASE_URL: "http://host.docker.internal:8080"`

host.docker.internal 是 Docker Desktop 提供的特殊 DNS 名称，解析为宿主机的 IP 地址。容器通过这个地址访问宿主机上运行的 Platform 服务，不需要端口映射。

**注意**：宿主机 Platform 必须监听 `0.0.0.0:8080`（不能只绑定 127.0.0.1），因为来自 Docker 虚拟网卡的请求不走 localhost。

### 端口映射规则总结

| 通信方向 | 机制 | 需要端口映射？ |
|---------|------|:------------:|
| 容器 → Redis | Docker DNS 解析 | 否 |
| 容器 → 宿主机 Platform | host.docker.internal | 否 |
| 外部 → 容器 HTTP API | ports: 8000:8000 | 是 |

可以看到，消费者模式下真正在跑的只有容器→Redis和容器→Platform两条路径，都不需要端口映射。8000:8000 仅为提供 HTTP API 给外部调用者使用。

### 端口管理最佳实践

推理服务端口（8000）和 Platform 端口（8080）的关系：

`PLATFORM_PORT` 必须等于 Platform 的 `SERVER_PORT`，因为它们指向同一个端口。推理服务只是作为消费者声明要连哪个地址，不负责决定 Platform 用什么端口。

`INFERENCE_PORT`（默认 8000）和 Platform 的端口完全独立，互不影响。

推荐方案：使用 .env 文件统一管理端口

```bash
# .env
INFERENCE_PORT=8000
PLATFORM_HOST=host.docker.internal
PLATFORM_PORT=8080
REDIS_PORT=6379
```

.env 不进 Git，只提交 .env.example，每个部署环境各自维护，端口冲突时各自修改。

### 服务架构图示

```bash
┌───────────────────────────────────────┐
│  docker-compose.yml                   │
│                                       │
│  ┌──────────────┐  ┌───────────────┐  │
│  │   redis:7    │  │ inference-    │  │
│  │              │  │ service       │  │
│  │  port 6379   │◄─┤              │  │
│  │              │  │  port 8000    │  │
│  │  Stream存储  │  │  FastAPI/     │  │
│  │              │  │  YOLOv12      │  │
│  │              │  │  Worker       │  │
│  └──────────────┘  └───────────────┘  │
└───────────────────────────────────────┘
```

Redis 通过 Docker 内部 DNS 解析访问。inference-service 通过服务名 `redis:6379` 直接访问 Redis。推理结果通过 `host.docker.internal:8080` 上报给宿主机上的 Platform。

## 四、DNS 与网络通信

### DNS（Domain Name System）的概念与作用

DNS 的核心作用是把人类可读的名字（域名/hostname）转换成机器可读的 IP 地址。可以理解为互联网的电话簿——记不住电话号码（IP），但记得住名字（域名）。

- 浏览器访问 `google.com` → DNS 查询 → 142.250.80.46
- 容器访问 `redis:6379` → Docker DNS 查询 → 172.18.0.2

### Bridge 网络通信

docker-compose 自动为所有服务创建一个 bridge 网络。在这个网络中，Docker 内置 DNS 解析器让容器之间可以通过服务名相互访问，不需要知道对方的 IP 地址。类比：就像局域网里两台电脑，知道对方的主机名就能直接通信。

### host.docker.internal 详解

这是 Docker Desktop 额外提供的一个特殊 DNS 名称，解析到**宿主机**的 IP 地址（而非其他容器的 IP）。Bridge DNS 是 Docker 内部的局域网，而 host.docker.internal 是 Docker 给你开的回宿主机的门。

### 0.0.0.0 的含义

0.0.0.0 表示绑定所有网络接口。一台机器通常有多个网络接口：127.0.0.1（loopback，只有本机能访问）、192.168.1.x（局域网，其他机器能访问）等。

- **127.0.0.1**：只有本机自己能访问
- **0.0.0.0**：本机和外部都能访问（所有网络接口）

在 Docker 场景下，容器必须监听 0.0.0.0，因为端口映射的流量来自外部网卡，不是 127.0.0.1。

## 五、通信协议概述

端口 + IP 只解决"数据送到哪台机器的哪个进程"的问题。数据送过去之后用什么方式沟通，是两边的程序说了算。

### HTTP

请求-响应模式，客户端发起请求，服务器返回响应。短连接（默认），单向（服务器不能主动推送）。适用于 REST API、网页加载等场景。

### WebSocket

通过 HTTP Upgrade 机制（101 Switching Protocols）建立长连接。一旦建立，双方随时可以互发数据，延迟低，连接持久。

- HTTP 是先请求再响应（半双工），WebSocket 是**全双工**：一条连接上两条数据流可以同时走
- 帧头部仅 2-14 字节（HTTP 头部 400-800 字节）
- 有 Ping/Pong 心跳机制维持连接
- 适用于聊天、实时行情、协同编辑等场景

### 全双工 vs 半双工

全双工 = 双方可以同时发数据，互不干扰。

打个比方：
- **半双工（对讲机）**：同一时刻只有一个人能说
- **全双工（电话）**：两边随时能说也能听

HTTP 是半双工的（单 TCP 连接下，发请求时不能同时收响应），WebSocket 是全双工的。

## 六、常用工具与概念

### curl

curl 是一个命令行 HTTP 客户端工具，在终端里直接发 HTTP 请求，相当于不用浏览器、不用 Postman。

```bash
curl http://localhost:8000/health
curl -X POST http://localhost:8000/predict \
  -H "Content-Type: application/json" \
  -d '{"image": "base64..."}'
```

部署时经常用 curl 验证服务是否启动成功：`curl -f http://localhost:8000/health`

### 流量的概念

流量指通过网络传输的数据。就像水流一样，数据从 A 机器流向 B 机器，这些数据就称为流量。常见说法有 HTTP 流量（请求/响应数据）、数据库流量（查询/结果数据）、网络流量过高（单位时间内传输的数据量太大）。

### 端口与服务的关系

端口 + IP 只解决"数据送到哪台机器的哪个进程"的问题。数据送过去之后用什么方式沟通，是两边的程序说了算。HTTP 只是最常见的一种，不是唯一的。

- HTTP 服务（8000 端口）→ curl、浏览器、Python requests 库
- Redis 服务（6379 端口）→ redis-cli、redis-py（RESP 协议）
- MySQL 服务（3306 端口）→ mysql 命令行、pymysql
- WebSocket → 长连接，通过 HTTP 101 升级建立，适用于聊天、实时推送
