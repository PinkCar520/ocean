# 阶段 1：Prune (提取网关及其关联代码)
FROM node:26.13.1-alpine AS pruner
WORKDIR /app
ENV NPM_CONFIG_REGISTRY=https://registry.npmmirror.com
# 安装 turbo cli
RUN npm install -g turbo@2.9.16
COPY . .
# 剥离出仅 gateway 及其 workspace 依赖所需的文件
RUN turbo prune gateway --docker

# 阶段 2：Builder (利用缓存装包和编译)
FROM node:26.13.1-alpine AS builder
WORKDIR /app
ENV COREPACK_NPM_REGISTRY=https://registry.npmmirror.com
ENV NPM_CONFIG_REGISTRY=https://registry.npmmirror.com
ENV PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false
ENV PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma
RUN npm install --global corepack@0.34.5 && corepack enable
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# 首先只拷贝 package.json 和 lockfile 进行依赖安装，完美利用 Docker 缓存层
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml

# 安装依赖
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --ignore-scripts --store-dir=/pnpm/store

# 拷贝源代码
COPY --from=pruner /app/out/full/ .
# turbo prune 不包含根 tsconfig.json，需手动补充（子包的 tsconfig 会 extends 它）
COPY --from=pruner /app/tsconfig.json ./tsconfig.json

# Prisma 生成（需要源文件中的 schema）
RUN cd apps/gateway && ./node_modules/.bin/prisma generate

# 使用 Turbo 进行构建（只会精准构建 gateway 及其涉及的依赖包）
RUN npx turbo run build --filter=gateway --concurrency=1

# 导出独立生产目录；pnpm 11 的非 injected workspace 使用 legacy deploy。
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm --filter gateway deploy --prod --legacy --ignore-scripts --store-dir=/pnpm/store /production/apps/gateway
# deploy 重建依赖布局后，在最终目录生成 Prisma Client。
RUN cd /production/apps/gateway && ./node_modules/.bin/prisma generate

# 阶段 3：Runner（无需重新下载或安装依赖）
FROM node:26.13.1-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /production/ ./
EXPOSE 3000
CMD ["sh", "-c", "cd apps/gateway && ./node_modules/.bin/prisma db push --accept-data-loss --schema prisma/schema.prisma && node dist/apps/gateway/src/main"]
