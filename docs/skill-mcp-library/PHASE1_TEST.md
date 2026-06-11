# Phase 1 测试指南

## 前置条件

确保 PostgreSQL 容器正在运行：
```bash
docker compose up -d postgres
```

## 步骤 1：数据库迁移

```bash
cd apps/gateway
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ocean?schema=public" npx prisma db push
```

## 步骤 2：注入内置技能数据

```bash
cd apps/gateway
npx ts-node --transpile-only src/skill-registry/seed-skills.ts
```

预期输出：
```
🌱 Seeding built-in skills...
  ✅ Created fix-bug
  ✅ Created write-prd
  ✅ Created jenkins
  ✅ Created gitlab
🎉 Seed completed!
```

## 步骤 3：启动 Gateway 服务

```bash
cd apps/gateway
pnpm start:dev
```

Gateway 将运行在 `http://localhost:3000`

## 步骤 4：启动 Web 前端

```bash
cd apps/web
pnpm dev
```

Web 前端将运行在 `http://localhost:8081`（或终端显示的端口）

## 步骤 5：Web 端测试

### 5.1 访问技能库页面

浏览器打开 `http://localhost:8081`，点击左侧边栏的 **"Library"**（或对应路由）。

### 5.2 验证功能

| 测试项 | 操作 | 预期结果 |
|---|---|---|
| 数据加载 | 打开页面 | 看到 4 张技能卡片（Fix Bug, Write PRD, Jenkins, GitLab） |
| 统计标签 | 查看页面上方 | 显示 "124 Skills"（实际数量）和 "12 New This Week" |
| 分类筛选 | 点击 "PM" 筛选按钮 | 只显示 Fix Bug 和 Write PRD |
| 分类筛选 | 点击 "CI/CD" 筛选按钮 | 只显示 Jenkins CI/CD |
| 分类筛选 | 点击 "VC" 筛选按钮 | 只显示 GitLab Integration |
| 加载骨架屏 | 快速切换筛选 | 看到灰色骨架屏动画 |
| 来源标签 | 查看卡片底部 | 显示 "Internal" |
| Featured 横幅 | 在 "All" 筛选下 | 页面底部显示深色推荐横幅 |

### 5.3 API 直接测试

```bash
# 获取全部技能
curl http://localhost:3000/api/skills | jq

# 按分类筛选
curl "http://localhost:3000/api/skills?category=pm" | jq

# 获取统计
curl http://localhost:3000/api/skills/stats | jq

# 获取单个技能详情
curl http://localhost:3000/api/skills/$(curl -s http://localhost:3000/api/skills | jq -r '.data[0].id') | jq
```

## 构建验证

```bash
# Gateway 构建
pnpm --filter gateway build

# Web 构建
pnpm --filter web build
```

两个构建都应该无错误完成。
