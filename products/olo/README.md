# OLO

OLO 是持续的个人智能层，理解 Context、预判需求，并在授权范围内协调设备与服务。OLO One 是它在现实世界中的主要 Physical Presence。

**Human Pull → World Push · One AI · Many Bodies · Reduce Cognitive Load**

从 [文档索引](docs/README.md)开始，产品基线为 [Product PRD v1.2](docs/product/OLO_Product_PRD_v1.2.md)。[v1.1](docs/product/OLO_Product_PRD_v1.1.md)与 [v1.0](docs/product/OLO_Product_PRD_v1.0.md)作为历史版本保留。

[场景规格](docs/scenarios/OLO-Scenario-Specification.md)解释人的状态变化；[Context Model v0.2](docs/context/OLO-Context-Model-v0.2.md)、[SR-003](docs/scenarios/SR-003-Leaving-Cybercab.md)、[Runtime](docs/runtime/OLO-Agent-Runtime.md)与 [Ambient Display](docs/interaction/OLO-Ambient-Display.md)均有未定事项。

当前仓库含 iOS / watchOS 原型；文档中的未来体验不表示代码已实现。工程工作从 [ENGINEERING](docs/ENGINEERING.md)和相应子 PRD 开始。

## System implementation

OLO 正按 [Target Architecture v0.1](docs/architecture/OLO-Target-Architecture-v0.1.md)
渐进改造为 Apple device plane + Python control plane。现有 `OLO/` 与
`OLOWatch/` 在共享契约和后端稳定前保持原位；新增模块位于 `services/`、
`packages/` 与 `evals/`。

验证不依赖第三方包的数据集结构：

```sh
python3 evals/run.py evals/datasets/v0.1.jsonl --minimum 50
```

安装开发依赖后运行后端测试和 API：

```sh
python3 -m venv .venv
.venv/bin/pip install -e '.[dev]'
.venv/bin/pytest
```

Control Plane 默认要求 `OLO_DATABASE_URL` 并使用 PostgreSQL；API 启动时会按
校验和顺序应用尚未执行的 SQL migration。内存 repository 仅供测试显式设置
`OLO_REPOSITORY=memory`。可以直接启动本地 PostgreSQL 与 API：

```sh
docker compose up --build
```

iOS 合同由共享 JSON Schema 生成并在测试中检查是否过期。共享契约（`openapi.yaml`、
`schemas/domain.schema.json`、`generate_swift.py`）已上提到 monorepo 根部的
`packages/contracts/`（Ocean 与 OLO 共用的单一权威源），在 monorepo 根目录运行：

```sh
python3 packages/contracts/generate_swift.py
python3 packages/contracts/generate_swift.py --check
```

在 OLO scheme 中设置 `OLO_CONTROL_PLANE_URL`（模拟器通常为
`http://127.0.0.1:8000`）即可启用同步。Observation、Intent、permission decision、
Action 状态使用持久化 outbox 按序上传，服务端在 verified 后形成可由 iOS 解码的
Action Receipt。Reminder 与 Wake 的 Apple 动作也会写入设备本地 Receipt ledger，
Actions 页面显示验证证据、待同步数量、同步错误和手动重试入口；未设置地址或网络
失败时，本地执行、权限检查、取消与读回验证仍然独立工作。

行业趋同判断与动态证据见 [AI Device & Industry Convergence](docs/research/OLO-AI-Device-Industry-Convergence.md)。OLO 认可 Persistent Personal Agent、Ambient Intelligence 与 One AI · Many Bodies 正在成为下一代个人计算范式。
