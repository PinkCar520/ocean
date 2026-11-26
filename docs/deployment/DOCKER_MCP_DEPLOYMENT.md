# Ocean MCP Docker 部署指南

## 部署架构

Compose 启动 Gateway、Worker、Web、PostgreSQL、Redis 和 FastAPI。Gateway 使用远程 Jenkins、GitLab 和禅道实例提供集成能力。

## 部署步骤

### 1. 环境变量配置

编辑 `.env` 文件，添加以下配置：

```bash
# ============ MCP Servers ============

# Jenkins CI/CD
JENKINS_BASE_URL=https://jenkins.example.com
JENKINS_TOKEN=your_jenkins_token_here

# GitLab Repository
GITLAB_BASE_URL=https://gitlab.example.com
GITLAB_TOKEN=your_gitlab_token_here

# ZenTao (已有)
ZENTAO_BASE_URL=https://zentao.example.com
ZENTAO_API_TOKEN=your_zentao_token_here
```

### 2. 首次部署

```bash
# 1. 拉取最新代码
git pull origin main

# 2. 构建所有服务（包含新增的 MCP Servers）
docker compose build --no-cache

# 3. 初始化新数据库或应用待执行的迁移
docker compose up -d --wait postgres
docker compose run --rm --no-deps gateway ./node_modules/.bin/prisma migrate deploy

# 4. 启动所有服务
docker compose up -d

# 5. 查看服务状态
docker compose ps
```

### 3. 验证部署

```bash
# 检查 Gateway 日志
docker compose logs -f gateway

# 验证 MCP Servers 连接
curl http://localhost:3000/api/mcp-servers
```

---

## 服务端口映射

| 服务 | 容器端口 | 宿主机端口 | 说明 |
|------|---------|-----------|------|
| Gateway | 3000 | 3000 | API 网关 |
| Web | 3000 | 8081 | 前端面板 |
| PostgreSQL | 5432 | 5432 | 数据库 |
| Redis | 6379 | 6379 | 缓存/会话 |

---

## 远程集成配置

在对应远程实例中创建集成凭据，填入 `.env`，并确认 Gateway 容器可以访问配置的地址。

## 更新部署

### 日常更新（代码变更）

```bash
# 1. 拉取最新代码
git pull origin main

# 2. 仅重新构建 Gateway（包含 MCP Servers）
docker compose build gateway

# 3. 更新 Gateway 和 Worker
docker compose up -d gateway worker

# 4. 查看日志确认启动成功
docker compose logs -f gateway
```

### 更新 MCP Servers

```bash
# 1. 重新构建 Gateway
docker compose build gateway

# 2. 更新 Gateway 和 Worker
docker compose up -d gateway worker
```

### 数据库迁移

本地容器启动时不会自动修改数据库。首次建库或发布包含新迁移的版本时，先执行：

```bash
docker compose up -d --wait postgres
docker compose run --rm --no-deps gateway ./node_modules/.bin/prisma migrate deploy
```

已有数据库若由 `db push` 初始化且缺少迁移记录，先在备份副本核对迁移基线。

## 生产部署

GitHub Actions 只允许 `main` 部署到 `production` 环境。`develop` 继续构建与检查。生产发布使用当前提交的 Compose 文件、本次构建的镜像 digest，以及服务器 `~/ocean` 中的配置与数据卷。在 GitHub 仓库的 `production` Environment 中，也将允许部署的分支设为 `main`。

首次使用此配置前，在部署目录准备以下文件：

| 文件 | 配置内容 |
| --- | --- |
| `.env` | 保留 `DATABASE_URL`、`POSTGRES_PASSWORD`、PostgreSQL 用户与库名、端口绑定和 `FASTAPI_URL`。Compose 单独把数据库连接交给 Gateway、Worker 和迁移任务，把 PostgreSQL 密码交给 PostgreSQL。 |
| `secrets/gateway.env` | 必填 `JWT_SECRET`。按需复制 Gateway 所用的模型、登录、追踪和集成配置。 |
| `secrets/worker.env` | 按需复制 Worker 所用的模型、工具集成、Hooks 和处理参数。只有实际使用的模型与集成凭据需在两个文件中都配置。 |

两个服务文件都采用 `KEY=value` 格式，填写实际值。Node.js 加载时不会展开变量引用。无额外配置时可以保留一个空的 Worker 文件。宿主机上的 `secrets/` 目录应只允许部署账户进入，例如 `chmod 0700 secrets`。两个文件需要容器内 UID 1000 可读。可在该私有目录内设置 `chmod 0444 secrets/gateway.env secrets/worker.env`，或设置相应的属主和读取权限。更新服务文件后，使用生产 Compose 的 `up -d --force-recreate gateway worker` 让新容器重新读取。

Gateway 和 Web 以非 root 用户运行。新上传卷使用镜像目录的属主。升级旧卷前，确认其中的目录和文件可由 UID 1000 读写。宿主管理的 skills 目录以只读方式挂载，需让容器内 UID 1000 可读取。通过应用上传的临时技能文件使用镜像内独立的可写目录。

手动部署时，在该部署目录设置 `DOCKERHUB_USERNAME`、`OCEAN_GATEWAY_DIGEST` 和 `OCEAN_WEB_DIGEST`（完整的 `sha256:…` 值），再执行：

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d --wait --wait-timeout 300
```

生产 `migrate` 服务运行 `prisma migrate deploy`，成功后启动新版 Gateway 和 Worker。迁移失败时，用 `docker compose -f docker-compose.prod.yml logs migrate` 查看原因。首次接管以前由 `db push` 初始化且缺少迁移记录的数据库时，先备份，在副本核对实际结构与迁移历史，再建立迁移基线。新空库可直接执行发布流程。

使用语义技能匹配或嵌入生成时，将 `FASTAPI_URL` 设为 Gateway 容器可达的独立 FastAPI 地址。生产 Gateway 和 Web 分别默认绑定 `127.0.0.1:3000` 和 `127.0.0.1:8081`。宿主机反向代理可直接连接这两个地址。若入口在其他主机上，按需设置 `OCEAN_GATEWAY_BIND_IP` 或 `OCEAN_WEB_BIND_IP` 为相应宿主机地址。PostgreSQL、Redis 通过 Compose 网络访问。

升级现有部署前，检查旧 Gateway 容器的 `/app/apps/gateway/public/uploads`。若有文件，先用 `docker compose exec -T gateway tar -C /app/apps/gateway/public/uploads -cf - . > gateway-uploads.tar` 导出，再部署并将备份合并到新 Gateway 的同一目录。该目录现在由命名卷持久化。

生产环境可通过 `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` 或 `OTEL_EXPORTER_OTLP_ENDPOINT` 配置外部 OTLP HTTP trace 接收地址（包含 `/v1/traces`）；未配置时不启动追踪导出。Redis 延续 RDB 快照策略，突然重启可能丢失最近一次快照之后的更新。

## MCP Server 配置管理

### 启用/禁用 MCP Server

编辑 `apps/gateway/mcp.config.json`：

```json
{
  "mcpServers": [
    {
      "id": "jenkins",
      "enabled": true,  // 改为 false 禁用
      "approved": true  // 改为 false 需要审批
    }
  ]
}
```

重新加载配置（无需重启容器）：

```bash
# 方式 1：通过 REST API
curl -X POST http://localhost:3000/api/mcp/config/reload

# 方式 2：重启 Gateway
docker compose restart gateway
```

### 查看 MCP Server 状态

```bash
# 查看所有 MCP Servers
curl http://localhost:3000/api/mcp-servers

# 查看健康检查
curl http://localhost:3000/api/mcp-servers/health/all
```

---

## 故障排查

### Gateway 启动失败

```bash
# 查看详细日志
docker compose logs gateway

# 常见问题：
# 1. 数据库未就绪 → 检查 postgres 状态
# 2. 端口冲突 → 修改 docker-compose.yml 端口映射
# 3. 环境变量缺失 → 检查 .env 文件
```

### MCP Server 连接失败

```bash
# 检查 MCP Server 日志
docker compose logs gateway | grep -i "mcp"

# 检查环境变量
docker compose exec gateway env | grep -E "JENKINS|GITLAB|ZENTAO"

# 手动测试连接
docker compose exec gateway node /app/agents/mcp/mcp-jenkins/dist/server.js
```

### 远程集成无法访问

检查 Gateway 所在网络能否解析并访问远程地址，再检查凭据权限和 Gateway 日志。

## 性能优化

### 资源限制（docker-compose.yml）

```yaml
services:
  gateway:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          memory: 512M

  jenkins:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          memory: 1G

  gitlab:
    deploy:
      resources:
        limits:
          cpus: '4'
          memory: 4G
        reservations:
          memory: 2G
```

### 日志管理

```yaml
logging:
  driver: "json-file"
  options:
    max-size: "100m"
    max-file: "3"
```

### 数据备份

```bash
# 备份 PostgreSQL
docker compose exec postgres pg_dump -U postgres ocean > backup_$(date +%Y%m%d).sql

```

---

## 开发环境

### 本地开发（不启动 Docker）

```bash
# 1. 启动外部依赖（PostgreSQL, Redis）
docker compose up -d postgres redis

# 2. 本地启动 Gateway
cd apps/gateway
pnpm dev

# 3. 本地启动 Web
cd apps/web
pnpm dev
```

## 安全建议

### 生产环境配置

1. **修改默认密码**
   - PostgreSQL: `POSTGRES_PASSWORD`

2. **启用 HTTPS**
   ```yaml
   # 使用 Nginx 反向代理
   nginx:
     image: nginx:alpine
     ports:
       - "443:443"
     volumes:
       - ./nginx.conf:/etc/nginx/nginx.conf
       - ./ssl:/etc/nginx/ssl
   ```

3. **限制端口暴露**
   ```yaml
   # 仅暴露 Gateway 和 Web
   ports:
     - "127.0.0.1:3000:3000"
     - "127.0.0.1:8081:3000"
   
   # 内部服务可省略宿主机端口映射
   ```

4. **使用 Docker Secrets**
   ```yaml
   secrets:
     jenkins_token:
       file: ./secrets/jenkins_token.txt
     gitlab_token:
       file: ./secrets/gitlab_token.txt
   ```

---

## 监控与告警

### 健康检查

```bash
# 检查所有服务
curl -fsS http://localhost:3000/api/metrics

# 检查 MCP Servers
curl http://localhost:3000/api/mcp-servers/health/all

```

### 日志聚合

```bash
# 查看所有服务日志
docker compose logs -f

# 仅查看 Gateway 日志
docker compose logs -f gateway

# 搜索错误日志
docker compose logs gateway | grep -i error
```

---

## 总结

### 一键部署命令

```bash
# 完整部署
git pull && docker compose build && docker compose up -d

# 验证部署
docker compose ps && curl http://localhost:3000/api/mcp-servers
```

### 常用命令速查

| 命令 | 说明 |
|------|------|
| `docker compose up -d` | 启动所有服务 |
| `docker compose down` | 停止所有服务 |
| `docker compose ps` | 查看服务状态 |
| `docker compose logs -f gateway` | 查看 Gateway 日志 |
| `docker compose restart gateway` | 重启 Gateway |
| `docker compose build gateway` | 重新构建 Gateway |
| `docker compose exec gateway sh` | 进入 Gateway 容器 |

---

*Ocean - 银行内网人工智能工作流中枢*  
*Docker 部署指南 v2.0 - 2026-04-13*
