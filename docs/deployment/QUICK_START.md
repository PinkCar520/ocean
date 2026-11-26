# Ocean MCP Docker 部署 - 快速开始

## 🚀 一键部署

### 首次部署

```bash
./scripts/deploy.sh
```

### 日常更新

```bash
./scripts/update.sh
```

就这么简单！✨

---

## 📋 部署清单

### 前置要求

- [x] Docker 20.10+
- [x] Docker Compose V2+
- [ ] 至少 8GB 内存
- [ ] 至少 20GB 磁盘空间

### 服务清单

| 服务 | 端口 | 状态 | 说明 |
|------|------|------|------|
| **Gateway** | 3000 | ✅ 自动配置 | API 网关（含 MCP Servers） |
| **Web** | 8081 | ✅ 自动配置 | 前端面板 |
| **PostgreSQL** | 5432 | ✅ 自动配置 | 数据库 |
| **Redis** | 6379 | ✅ 自动配置 | 缓存/会话 |

---

## 🔧 首次配置

### 1. 编辑 .env 文件

```bash
cp .env.example .env
# 编辑 .env 文件，填入以下内容
```

设置 `DATABASE_URL`、`POSTGRES_PASSWORD` 和 `JWT_SECRET`。如需启用集成，在 `.env` 中填写 Gateway 可访问的远程服务地址和对应凭据。

```dotenv
ZENTAO_BASE_URL=https://zentao.example.com
ZENTAO_API_TOKEN=your_token
JENKINS_BASE_URL=https://jenkins.example.com
JENKINS_TOKEN=your_token
GITLAB_BASE_URL=https://gitlab.example.com
GITLAB_TOKEN=your_token
```

### 2. 执行部署

首次建库或有待应用的迁移时，先构建 Gateway 镜像、启动 PostgreSQL，并执行迁移。已有数据库若缺少迁移记录，先核对迁移基线。

```bash
docker compose build gateway
docker compose up -d --wait postgres
docker compose run --rm --no-deps gateway ./node_modules/.bin/prisma migrate deploy
```

```bash
./scripts/deploy.sh
```

等待 2-3 分钟，所有服务将自动启动。

## 📊 验证部署

### 检查服务状态

```bash
docker compose ps
```

核心服务应显示 `Up`。

### 验证 MCP Servers

```bash
# 查看所有 MCP Servers
curl http://localhost:3000/api/mcp-servers

# 查看健康检查
curl http://localhost:3000/api/mcp-servers/health/all

# 查看 Resources
curl http://localhost:3000/api/mcp/resources

# 查看 Prompts
curl http://localhost:3000/api/mcp/prompts
```

### 访问 Web 面板

打开浏览器访问: http://localhost:8081

---

## 🔄 日常运维

### 更新代码

```bash
./scripts/update.sh
```

这将：
1. 拉取最新代码
2. 重新构建 Gateway
3. 重启 Gateway（不影响其他服务）
4. 验证部署状态

### 查看日志

```bash
# Gateway 日志
docker compose logs -f gateway

# 所有服务日志
docker compose logs -f
```

### 重启服务

```bash
# 重启单个服务
docker compose restart gateway

# 重启所有服务
docker compose restart
```

### 停止服务

```bash
# 停止所有服务
docker compose down

# 停止并删除数据卷（危险操作！）
docker compose down -v
```

---

## 🛠️ 故障排查

### Gateway 启动失败

```bash
# 查看详细日志
docker compose logs gateway

# 检查数据库连接
docker compose exec gateway ping postgres

# 手动执行数据库迁移
docker compose run --rm --no-deps gateway ./node_modules/.bin/prisma migrate deploy
```

### MCP Server 未连接

```bash
# 检查环境变量
docker compose exec gateway env | grep -E "JENKINS|GITLAB|ZENTAO"

# 检查 mcp.config.json
docker compose exec gateway cat /app/mcp.config.json

# 手动重载配置
curl -X POST http://localhost:3000/api/mcp/config/reload
```

### 端口冲突

```bash
# 查看端口占用
lsof -i :3000
lsof -i :8081

# 修改 docker-compose.yml 中的端口映射
# 例如: - "3001:3000" 改为 3001 端口
```

---

## 📚 更多文档

- [完整部署文档](./DOCKER_MCP_DEPLOYMENT.md) - 详细配置、优化、安全建议
- [升级报告](../architecture/MCP_UPGRADE_REPORT.md) - MCP 能力升级详情
- [能力对比](../architecture/MCP_CAPABILITY_COMPARISON.md) - 与 Claude MCP 对比

---

## 🎯 快速参考

### 常用命令

```bash
# 部署
./scripts/deploy.sh

# 更新
./scripts/update.sh

# 查看状态
docker compose ps

# 查看日志
docker compose logs -f gateway

# 重启 Gateway
docker compose restart gateway

# 进入容器
docker compose exec gateway sh

# 数据库迁移
docker compose run --rm --no-deps gateway ./node_modules/.bin/prisma migrate deploy
```

### 访问地址

| 服务 | URL |
|------|-----|
| Web 面板 | http://localhost:8081 |
| API 网关 | http://localhost:3000 |

---

## 💡 提示

1. **首次部署较慢**：需要拉取镜像和构建，后续更新会快很多
2. **定期备份**：重要数据请定期备份 PostgreSQL 和 GitLab
3. **生产环境**：请修改所有默认密码，并启用 HTTPS

---

*Ocean - 银行内网人工智能工作流中枢*  
*Docker 快速开始指南 v1.0 - 2026-04-13*
