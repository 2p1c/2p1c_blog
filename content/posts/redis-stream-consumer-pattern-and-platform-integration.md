+++
date = '2026-04-11'
draft = false
title = '事件驱动架构实战：用 Redis Stream 打造可扩展的检测服务'
description = '深入解析 Redis Stream 消费者组模式，结合实际项目讲解如何设计与外部平台交互的事件驱动服务，包含完整的架构图、代码模板和调试技巧'
summary = '通过 detection-server 项目的重构实践，详细讲解 Redis Stream 消费者组模式的原理，探讨如何优雅地集成外部 HTTP API，以及事件驱动架构中的关键设计模式和错误处理策略'
tags = ['Redis', '事件驱动', '架构设计', 'Python', '后端']
categories = ['技术', '后端开发']
+++

# 事件驱动架构实战：用 Redis Stream 打造可扩展的检测服务

最近在重构 detection-server 项目时，将原来的轮询模式重构为了**事件驱动的消费者模式**。这个改动让我对 Redis Stream、消费者组设计、HTTP API 客户端模式有了更深入的理解。趁热打铁，把学习过程整理成文。

## 背景：从轮询到事件驱动

原来的检测服务采用的是**轮询模式**：定时向平台 API 请求待处理任务。这种方式的缺点显而易见：

- **浪费资源**：无论有没有新任务，都需要定期发起请求
- **延迟高**：新任务必须等到下一次轮询才能被处理
- **扩展性差**：增加消费者需要修改轮询逻辑

重构后的架构变成了**事件驱动模式**：

```
Platform (Task Engine)
        │
        │ XADD (发布事件)
        ▼
┌───────────────────┐
│   Redis Stream    │
│  inspection.raw   │
└────────┬──────────┘
         │ XREADGROUP (消费)
         ▼
┌───────────────────┐
│ InspectionConsumer │◄──── HTTP API (获取材质详情)
│  (检测服务)        │
└────────┬──────────┘
         │ XADD (发布结果)
         ▼
┌───────────────────┐
│   Redis Stream    │
│ inspection.results│
└───────────────────┘
```

这样一来，Platform 有新任务时主动推送到 Redis Stream，检测服务即时消费处理，延迟从「轮询周期」变成了「网络延迟」。

## Redis Stream 消费者组详解

### 什么是 Redis Stream？

Redis Stream 是 Redis 5.0 引入的数据结构，提供了消息队列功能：

| 命令 | 作用 |
|------|------|
| `XADD` | 添加消息到流 |
| `XREAD/XREADGROUP` | 读取消息 |
| `XACK` | 确认消息已处理 |
| `XPENDING` | 查看待处理消息 |

与 Redis List 相比，Stream 支持**消费者组**，实现多个消费者分担任务。

### 消费者组的核心概念

消费者组是 Redis Stream 最强大的特性：

```
Stream: inspection.raw
Group: inspection_consumer_group
┌─────────────────────────────────────────────────────────┐
│ 消息ID 1744412000000-0  ──▶ [Consumer A] ──▶ 已ACK     │
│ 消息ID 1744412000000-1  ──▶ [Consumer B] ──▶ 处理中    │
│ 消息ID 1744412000000-2  ──▶ [Consumer C] ──▶ 待处理    │
└─────────────────────────────────────────────────────────┘
```

关键特性：
- **消息分发**：同一条消息只会被组内一个消费者处理
- **消息确认**：处理完成后必须 `XACK`，否则保持 PENDING 状态
- **故障恢复**：消费者崩溃后，其 PENDING 消息可被其他消费者重新认领
- **负载均衡**：多个消费者自动分担消息处理

### 实现原理

消费者组的创建和消费过程：

```python
# 1. 创建消费者组（如果不存在）
self.redis_client.xgroup_create(
    name=self.settings.source_stream,      # stream 名称
    groupname=self.settings.consumer_group, # 消费者组名
    id="$",                                # "$" 表示从最新消息开始
    mkstream=True,                         # 流不存在时自动创建
)

# 2. 消费消息（阻塞式）
messages = self.redis_client.xreadgroup(
    groupname=self.settings.consumer_group,   # 消费者组
    consumername=self.settings.consumer_name,  # 消费者唯一名称
    streams={self.settings.source_stream: ">"},  # ">" 只读新消息
    count=self.settings.read_count,            # 每次读取的消息数
    block=self.settings.block_ms,               # 阻塞超时（毫秒）
)
```

参数 `"0"` vs `">"`：
- `">"`：只读取新消息，不读取历史 PENDING
- `"0"`：读取所有消息（包括历史 PENDING）

### 完整消息处理流程

```
┌─────────────┐
│  收到消息   │  XREADGROUP 返回 [(stream_name, [(msg_id, fields)])]
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  解析事件   │  JSON → Pydantic 模型自动校验
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  事件类型   │  event.eventType == "detection.requested" ?
│  过滤判断   │
└──────┬──────┘
       │ 是
       ▼
┌─────────────┐
│ 获取材质详情│  platform_client.get_material_detail()
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ 下载图片   │  HTTP GET image_url
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ 执行推理   │  YOLO + OCR 检测
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ 发布结果   │  XADD inspection.results
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ 确认消息   │  XACK 确保不重复消费
└─────────────┘
```

## 外部平台集成：HTTP API 客户端设计

### Token 缓存 + 自动刷新

与外部平台交互时，认证是第一个要解决的问题：

```python
class PlatformClient:
    def _ensure_token(self) -> None:
        """Fetch and cache a Bearer token via login."""
        if self._token:
            return  # 已有 Token，直接使用
        # 登录获取新 Token
        response = self._session.post(login_url, json={...})
        self._token = response.json().get("token")
```

设计优点：
- **延迟初始化**：Token 仅在首次请求时才获取
- **缓存复用**：一次登录，多次使用，避免频繁认证
- **透明刷新**：Token 过期时可自动重新登录

### HTTP Session 复用

```python
self._session = requests.Session()  # 复用连接池
response = self._session.get(url)   # 自动携带 Cookie 和连接
```

优点：TCP 连接复用，减少握手延迟；自动管理 Cookie。

### Material 查询接口示例

```python
def get_material_detail(self, material_id: int) -> dict:
    self._ensure_token()
    url = f"{self.base_url}{PLATFORM_MATERIAL_DETAIL_PATH}/{material_id}"
    response = self._session.get(url, timeout=15)
    response.raise_for_status()
    return response.json()
```

## 关键设计模式

### 1. 依赖注入模式

```python
class InspectionConsumer:
    def __init__(
        self,
        *,
        settings: InspectionConsumerSettings,
        get_predictor: Callable[[], PredictorProtocol | None],  # 注入获取器
        redis_client: RedisClientProtocol | None = None,
    ) -> None:
        self.get_predictor = get_predictor  # 延迟获取
```

为什么用 `Callable[[], PredictorProtocol | None]` 而不是直接传 `PredictorProtocol`？

因为 predictor 在应用启动时可能还未加载完成，需要通过回调延迟获取。

### 2. Protocol 协议模式

```python
class PredictorProtocol(Protocol):
    def predict_bytes(self, *, content: bytes, filename: str) -> Any: ...

class RedisClientProtocol(Protocol):
    def xgroup_create(self, *, name: str, groupname: str, id: str, mkstream: bool) -> Any: ...
    def xreadgroup(self, *, ...) -> list[tuple[str, list[tuple[str, dict[str, str]]]]]: ...
```

优点：
- **类型提示**：IDE 支持参数补全
- **解耦**：不依赖具体实现
- **可测试**：可以注入 Mock 对象

### 3. 配置外部化模式

```python
@dataclass
class InspectionConsumerSettings:
    enabled: bool
    redis_url: str
    source_stream: str

    @classmethod
    def from_env(cls) -> "InspectionConsumerSettings":
        return cls(
            enabled=_env_bool("INSPECTION_CONSUMER_ENABLED", default=True),
            redis_url=os.getenv("REDIS_URL", "redis://localhost:6379/0"),
        )
```

优点：配置与代码分离；不同环境使用不同配置。

## 错误处理策略

### 分层错误处理

```python
def _run_loop(self) -> None:
    while not self._stop_event.is_set():
        try:
            messages = self.redis_client.xreadgroup(...)  # 网络/Redis 错误
        except Exception as exc:
            self._redis_ok = False
            LOGGER.exception("failed to read stream message: %s", exc)
            time.sleep(self.retry_sleep_seconds)
            continue
```

### 结果级联错误

```python
def _handle_detection_requested(self, event: InspectionEvent, entry_id: str) -> None:
    try:
        # 正常流程
        material_detail = self.platform_client.get_material_detail(material_id)
        content = self._download_image(image_url)
        output = predictor.predict_bytes(...)
        self._publish_result(status="succeeded", ...)
    except Exception as exc:
        # 任何步骤失败，都发布失败结果
        self._publish_result(status="failed", error_code="detection_failed", ...)
    finally:
        # 无论成功失败，都 ACK 消息
        self._ack_entry(entry_id)
```

这样设计的好处：
- 避免消息丢失（PENDING 状态永远不被处理）
- 上游系统能看到失败结果（可监控告警）
- 消费者不会卡死（持续处理新消息）

## 线程安全与生命周期

### 后台线程启动

```python
def start(self) -> None:
    self._ensure_consumer_group()
    self._thread = threading.Thread(
        target=self._run_loop, name="inspection-consumer", daemon=True
    )
    self._thread.start()
```

- `daemon=True`：主进程退出时自动终止，不阻塞
- `name="inspection-consumer"`：方便调试时识别线程

### 优雅关闭

```python
def stop(self) -> None:
    self._stop_event.set()      # 通知循环退出
    if self._thread is not None:
        self._thread.join(timeout=5)  # 等待最多 5 秒
    self.redis_client.close()   # 关闭 Redis 连接
```

## 可复用代码模板

### Redis Stream 消费者模板

```python
import os
import platform
import threading
from dataclasses import dataclass
import redis

@dataclass
class MyConsumerSettings:
    redis_url: str
    source_stream: str
    consumer_group: str

    @classmethod
    def from_env(cls) -> "MyConsumerSettings":
        return cls(
            redis_url=os.getenv("REDIS_URL", "redis://localhost:6379/0"),
            source_stream=os.getenv("MY_STREAM", "my.stream"),
            consumer_group=os.getenv("MY_GROUP", "my_group"),
        )

class MyConsumer:
    def __init__(self, settings: MyConsumerSettings):
        self.settings = settings
        self.redis = redis.Redis.from_url(settings.redis_url, decode_responses=True)
        self._thread = None
        self._stop_event = threading.Event()

    def start(self) -> None:
        self._ensure_group()
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()

    def _ensure_group(self) -> None:
        try:
            self.redis.xgroup_create(
                name=self.settings.source_stream,
                groupname=self.settings.consumer_group,
                id="$", mkstream=True
            )
        except Exception as exc:
            if "BUSYGROUP" not in str(exc):
                raise

    def _run_loop(self) -> None:
        while not self._stop_event.is_set():
            messages = self.redis.xreadgroup(
                groupname=self.settings.consumer_group,
                consumername=f"{platform.node()}-{os.getpid()}",
                streams={self.settings.source_stream: ">"},
                count=1, block=5000,
            )
            if not messages:
                continue
            for _, entries in messages:
                for entry_id, fields in entries:
                    self._process(entry_id, fields)

    def _process(self, entry_id: str, fields: dict) -> None:
        try:
            # 业务逻辑
            pass
        finally:
            self.redis.xack(
                self.settings.source_stream,
                self.settings.consumer_group, entry_id
            )

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=5)
```

### HTTP API 客户端模板

```python
import requests

class MyAPIClient:
    def __init__(self, base_url: str, login_path: str, resource_path: str):
        self.base_url = base_url.rstrip("/")
        self.login_path = login_path
        self.resource_path = resource_path
        self._token = None
        self._session = requests.Session()

    def _ensure_token(self) -> None:
        if self._token:
            return
        response = self._session.post(
            f"{self.base_url}{self.login_path}",
            json={"username": "admin", "password": "admin"},
            timeout=15,
        )
        response.raise_for_status()
        self._token = response.json().get("token")

    def get_resource(self, resource_id: int) -> dict:
        self._ensure_token()
        response = self._session.get(
            f"{self.base_url}{self.resource_path}/{resource_id}",
            timeout=15,
        )
        response.raise_for_status()
        return response.json()
```

## 调试技巧

### Redis Stream 调试命令

```bash
# 查看流内容
XREAD COUNT 10 STREAMS inspection.raw ">"

# 查看消费者组
XINFO GROUPS inspection.raw

# 查看消费者
XINFO CONSUMERS inspection.raw inspection_consumer_group

# 查看待处理消息
XPENDING inspection.raw inspection_consumer_group

# 手动确认
XACK inspection.raw inspection_consumer_group <message_id>

# 清空流（慎用）
DEL inspection.raw inspection.results
```

### 健康检查

```python
def get_health_status(self) -> dict[str, Any]:
    worker_running = self._thread is not None and self._thread.is_alive()
    return {
        "status": "ok" if worker_running and self._redis_ok else "degraded",
        "worker_enabled": True,
        "worker_running": worker_running,
        "redis_connected": self._redis_ok,
    }
```

## 总结

这次重构实践，让我对事件驱动架构有了更深的理解：

1. **Redis Stream + 消费者组**：实现了可靠的消息队列，支持故障恢复和负载均衡
2. **HTTP API + Token 认证**：优雅地集成了外部平台
3. **依赖注入 + Protocol**：实现了灵活的解耦设计
4. **配置外部化**：支持不同环境的差异化配置
5. **优雅关闭**：确保资源正确释放

这套架构可以复用到很多场景：
- 消息队列消费者
- 外部 API 集成
- 后台任务处理系统

希望这篇笔记对同样在探索事件驱动架构的同学有所帮助。
