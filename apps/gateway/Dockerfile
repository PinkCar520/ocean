# 第一阶段：编译构建
FROM node:22-alpine AS builder

WORKDIR /app
RUN corepack enable
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# 1. 拷贝根配置
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./

# 2. 仅拷贝所有 package.json 来安装依赖 (利用缓存)
COPY apps/gateway/package.json apps/gateway/
COPY packages/channel-im/package.json packages/channel-im/
COPY packages/mcp-zentao/package.json packages/mcp-zentao/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/tools-zentao/package.json packages/tools-zentao/

# 安装全量依赖 (使用缓存挂载加速)
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# 3. 拷贝源码并生成 Prisma Client
COPY apps/gateway/prisma apps/gateway/prisma
COPY apps/gateway/prisma.config.js apps/gateway/prisma.config.js
RUN cd apps/gateway && ./node_modules/.bin/prisma generate

# 拷贝其余所有源码
COPY . .

# 编译各个模块
RUN pnpm --filter @uclaw/types build
RUN pnpm --filter @uclaw/shared-types build
RUN pnpm --filter @uclaw/tools-zentao build
RUN pnpm --filter @uclaw/mcp-zentao build
RUN pnpm --filter gateway build

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
COPY --from=builder /app/packages ./packages

# 安装生产依赖 (开启 frozen-lockfile 严谨校验)
RUN pnpm install --prod --frozen-lockfile

# 在运行时阶段生成 Prisma Client
RUN cd apps/gateway && ./node_modules/.bin/prisma generate

# 拷贝编译后的产物
COPY --from=builder /app/apps/gateway/dist ./apps/gateway/dist

# 拷贝运行时需要的非编译文件
COPY apps/gateway/mcp.config.json apps/gateway/mcp.config.json
COPY skills skills

EXPOSE 3000

# 启动命令：在启动 main 之前尝试同步 db
CMD ["sh", "-c", "cd apps/gateway && ./node_modules/.bin/prisma db push --schema prisma/schema.prisma && node dist/main"]
