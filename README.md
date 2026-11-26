# Ocean

Ocean 是一个持续演进中的智能体平台，目标是用统一的运行时与治理能力支持 **Code、Work、Life** 等场景。当前仓库的重点是可交互的开发者智能体及其运行基础设施：提供终端、Web 和桌面入口，并通过 Gateway 管理模型、工具、任务运行和审批。

> **项目状态**：架构与功能仍在迭代中。Code、Work、Life 是产品方向，不代表三类场景的功能都已完整交付；部署、配置和具体能力请以当前代码及本文档为准。

## 当前能力

- **CLI 智能体**：交互式终端和单次提问模式；支持本地文件与 Git 操作、Skill、MCP 工具、任务计划和检查点。
- **运行治理**：工具权限策略、审批流程、可恢复的任务运行，以及 Gateway 执行链路中的审计和幂等处理。
- **统一服务端**：NestJS Gateway 提供 API、模型与工具运行能力；独立 Worker 负责后台任务处理。
- **多端界面**：Next.js Web 与 Electron Desktop 客户端，复用共享 UI 和接口契约。
- **可选外部集成**：通过 MCP 对接 ZenTao、Jenkins、GitLab 等系统；这些目标系统不是 Ocean 核心运行的必需依赖。
- **计算任务服务**：FastAPI 服务承载音频转写、Embedding 等 Python 计算任务，不作为另一套产品 API。

## 架构与目录

仓库采用 pnpm workspace + Turborepo 管理 TypeScript 应用和共享包。Gateway 与 Worker 以 PostgreSQL 作为持久化存储，Redis 提供队列及短期协调能力；MCP Server 和 Python 计算服务按需参与。

```text
apps/
  cli/                 终端智能体
  gateway/             NestJS API、运行时与后台 Worker
  web/                 Next.js Web 客户端
  desktop/             Electron 桌面客户端
  fastapi-backend/     Python 计算服务
packages/
  contracts/           跨端接口与数据契约
  shared/              共享核心逻辑
  ui/                  Web/Desktop 共享 UI
  tools/               工具集成包
agents/
  mcp/                 MCP Server 集成
  skills/              Skill 定义
  prompts/             智能体提示词
docker-compose.yml     本地核心服务编排
```

更多架构背景见 [v2 架构文档](./docs/architecture/v2/README.md)；它描述演进基线，其中部分目标仍在迁移中。

## 本地运行

### 环境要求

- Node.js `>=20`
- pnpm `11.7.0`（仓库通过 `packageManager` 固定版本）
- Docker Compose（运行完整本地服务栈时需要）

### Docker Compose 启动

1. 安装依赖并创建本地配置：

   ```bash
   pnpm install
   cp .env.example .env
   ```

2. 编辑 `.env`：
   - 为所选模型提供商配置 API Key 和模型名称。
   - 设置强随机 `POSTGRES_PASSWORD` 和 `JWT_SECRET`。
   - 确保 `DATABASE_URL` 中的密码与 `POSTGRES_PASSWORD` 一致；如密码含特殊字符，需进行 URL 编码。
   - 若需连接已有的 ZenTao、Jenkins 或 GitLab，填写对应地址和凭证；未配置时相关集成会禁用或使用 mock。

3. 构建镜像。首次建库或有待应用的迁移时，先执行数据库迁移，再启动核心服务：

   ```bash
   docker compose build
   docker compose up -d --wait postgres
   docker compose run --rm --no-deps gateway ./node_modules/.bin/prisma migrate deploy
   docker compose up -d
   ```

   核心服务包括 Gateway、Worker、Web、PostgreSQL、Redis、Jaeger 和 FastAPI 计算服务。启动后可访问：

   | 服务 | 地址 |
   | --- | --- |
   | Web | <http://localhost:8081> |
   | Gateway | <http://localhost:3000> |
   | Jaeger | <http://localhost:16686> |

### 单独启动开发客户端

安装依赖并配置 `.env` 后，可按需在不同终端启动应用：

```bash
pnpm gateway                       # Gateway 开发模式
pnpm web                            # Web 开发服务器（localhost:5173）
pnpm desktop                        # Electron 开发模式
pnpm --filter @ocean/cli dev        # CLI 开发模式
```

本地直接运行 Gateway 时，请确认 `.env` 中的数据库、Redis 和模型服务地址可从宿主机访问。

## 常用命令

```bash
pnpm build                          # 构建 workspace
pnpm check                          # lint、typecheck、build 和 test
pnpm --filter @ocean/cli test       # CLI 测试
pnpm --filter gateway test          # Gateway 测试
pnpm --filter gateway test:e2e      # Gateway E2E 测试
```

## 相关文档

- [架构升级与迁移计划](./docs/architecture/v2/README.md)
- [Docker MCP 部署说明](./docs/deployment/DOCKER_MCP_DEPLOYMENT.md)
- [CLI 实现](./apps/cli)
- [Gateway 实现](./apps/gateway)
- [能力迁移文档](./migration/capabilities)
