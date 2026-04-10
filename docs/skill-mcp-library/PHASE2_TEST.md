# Phase 2 测试指南 — MCP Server 管理

## 前置条件

确保 PostgreSQL 容器正在运行，且 Phase 1 的数据已就绪：
```bash
docker compose up -d postgres
```

## 步骤 1：注入 MCP Server 种子数据

```bash
cd apps/gateway
npx ts-node --transpile-only src/mcp-server/seed-mcp-servers.ts
```

预期输出：
```
🌱 Seeding MCP Servers from mcp.config.json...
  ✅ Created ZenTao Bug Management
  ✅ Created Local FileSystem & CLI
  ✅ Created Jenkins CI/CD
  ✅ Created GitLab Repository
🎉 MCP Server seed completed!
```

## 步骤 2：启动 Gateway 服务

```bash
cd apps/gateway
pnpm start:dev
```

Gateway 启动后会看到日志：
```
[Nest] Starting MCP Server health check scheduler (every 5 min)...
[Nest] Health check complete: X/4 servers online
```

## 步骤 3：启动 Web 前端

```bash
cd apps/web
pnpm dev
```

## 步骤 4：Web 端测试

### 4.1 访问 MCP Server 管理页面

浏览器打开 `http://localhost:8081`，点击左侧边栏的 **"MCP Servers"**（拼图图标）。

### 4.2 验证功能

| 测试项 | 操作 | 预期结果 |
|---|---|---|
| 列表展示 | 打开页面 | 看到 4 个 MCP Server 卡片（ZenTao, Local FS, Jenkins, GitLab） |
| 状态指示 | 查看每个卡片 | 显示 Online/Offline/Degraded/Unknown 状态徽章 |
| 启用/禁用 | 点击开关切换 | 卡片透明度变化，开关动画流畅 |
| 编辑 | 点击铅笔图标 | 弹出编辑表单，字段已填充 |
| 新增 | 点击 "Add Server" | 弹出空表单 |
| 删除 | 点击垃圾桶图标 | 确认后卡片消失 |
| 健康检查 | 点击 "Check All" | 刷新按钮旋转，随后状态更新 |
| 同步配置 | 点击 "Sync from Config" | 从 mcp.config.json 同步，无重复创建 |
| 加载骨架屏 | 刷新页面 | 灰色骨架屏动画 |

### 4.3 API 直接测试

```bash
# 获取 MCP Server 列表
curl http://localhost:3000/api/mcp-servers | jq

# 获取单个详情
curl http://localhost:3000/api/mcp-servers/$(curl -s http://localhost:3000/api/mcp-servers | jq -r '.data[0].id') | jq

# 健康检查（单个）
curl http://localhost:3000/api/mcp-servers/$(curl -s http://localhost:3000/api/mcp-servers | jq -r '.data[0].id')/health | jq

# 批量健康检查
curl -X POST http://localhost:3000/api/mcp-servers/health/all | jq

# 从配置同步
curl -X POST http://localhost:3000/api/mcp-servers/sync | jq

# 创建 MCP Server
curl -X POST http://localhost:3000/api/mcp-servers \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Server","description":"A test MCP server","category":"pm","transport":"stdio","command":"node","args":["test.js"],"env":{},"enabled":true}' | jq

# 更新
curl -X PUT http://localhost:3000/api/mcp-servers/<ID> \
  -H "Content-Type: application/json" \
  -d '{"enabled":false}' | jq

# 删除
curl -X DELETE http://localhost:3000/api/mcp-servers/<ID> | jq
```

## 步骤 5：验证定时健康检查

等待 5 分钟后查看 Gateway 日志，应看到类似：
```
[Nest] Running MCP Server health check...
[Nest] Health check complete: 1/4 servers online
```

或者手动触发批量检查验证：
```bash
curl -X POST http://localhost:3000/api/mcp-servers/health/all | jq
```

## 构建验证

```bash
# Gateway 构建
pnpm --filter gateway build

# Web 构建
pnpm --filter web build
```

两个构建都应该无错误完成。
