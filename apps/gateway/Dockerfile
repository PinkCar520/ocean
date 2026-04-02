# 第一阶段：编译构建
FROM node:22-alpine AS builder

WORKDIR /app
RUN corepack enable

# 拷贝依赖配置
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/gateway/package.json apps/gateway/
COPY packages/ packages/

# 安装全量依赖 (开启 frozen-lockfile 严谨校验)
RUN pnpm install --frozen-lockfile

# 拷贝代码
COPY . .

# 只生成 Prisma Client 并编译网关
RUN cd apps/gateway && ./node_modules/.bin/prisma generate
RUN pnpm --filter gateway build
RUN pnpm --filter @uclaw/types build
RUN pnpm --filter @uclaw/shared-types build
RUN pnpm --filter @uclaw/tools-zentao build

# 第二阶段：生产运行
FROM node:22-alpine AS runner
WORKDIR /app
RUN corepack enable

ENV NODE_ENV=production

# 拷贝全量 package 配置
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/gateway/package.json apps/gateway/
COPY apps/gateway/prisma apps/gateway/prisma
COPY apps/gateway/prisma.config.js apps/gateway/prisma.config.js
COPY packages/ packages/

# 安装生产依赖 (开启 frozen-lockfile 严谨校验)
RUN pnpm install --prod --frozen-lockfile

# 在运行时阶段生成 Prisma Client
RUN cd apps/gateway && ./node_modules/.bin/prisma generate

# 拷贝编译后的产物
COPY --from=builder /app/apps/gateway/dist ./apps/gateway/dist

# 拷贝运行时需要的非编译文件
COPY apps/gateway/mcp.config.json apps/gateway/mcp.config.json
COPY apps/gateway/skills apps/gateway/skills

EXPOSE 3000

# 启动命令：在启动 main 之前尝试同步 db
CMD ["sh", "-c", "cd apps/gateway && ./node_modules/.bin/prisma db push --schema prisma/schema.prisma && node dist/main"]
