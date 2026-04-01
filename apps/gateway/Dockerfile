# 第一阶段：编译构建
FROM node:20-alpine AS builder

WORKDIR /app
# 启用 pnpm
RUN corepack enable

# 利用 Monorepo 特性，先拷贝锁文件和基础配置
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/gateway/package.json apps/gateway/
COPY packages/shared-types/package.json packages/shared-types/

# 安装所有依赖
RUN pnpm install --frozen-lockfile

# 拷贝全量代码并只编译网关
COPY . .
RUN pnpm --filter gateway build
RUN pnpm --filter @uclaw/types build

# 第二阶段：瘦身运行
FROM node:20-alpine AS runner
WORKDIR /app
RUN corepack enable

ENV NODE_ENV=production

# 仅安装生产依赖
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/gateway/package.json apps/gateway/
RUN pnpm install --prod --frozen-lockfile

# 拷贝编译后的 js 产物
COPY --from=builder /app/apps/gateway/dist ./apps/gateway/dist
COPY --from=builder /app/packages/shared-types/dist ./packages/shared-types/dist

EXPOSE 3000

CMD ["node", "apps/gateway/dist/main"]
