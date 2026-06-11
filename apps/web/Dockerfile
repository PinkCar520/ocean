# 阶段 1：Prune (提取 Web 及其关联代码)
FROM node:22-alpine AS pruner
WORKDIR /app
# 安装 turbo cli
RUN npm install -g turbo
COPY . .
# 剥离出仅 web 及其 workspace 依赖所需的文件
RUN turbo prune web --docker

# 阶段 2：Builder (利用缓存装包和编译)
FROM node:22-alpine AS builder
WORKDIR /app
ENV COREPACK_NPM_REGISTRY=https://registry.npmmirror.com
RUN corepack enable
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# 首先只拷贝 package.json 和 lockfile 进行依赖安装，完美利用 Docker 缓存层
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml

# 安装依赖 (配置 ignore-scripts 跳过不必要的编译，如桌面端的 electron 依赖)
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm config set ignore-scripts true && pnpm install --no-frozen-lockfile

# 拷贝源代码
COPY --from=pruner /app/out/full/ .
# turbo prune 不包含根 tsconfig.json，需手动补充（子包的 tsconfig 会 extends 它）
COPY --from=pruner /app/tsconfig.json ./tsconfig.json

# 使用 Turbo 进行构建（只会精准构建 web 及其涉及的依赖包，自动保证拓扑顺序）
RUN npx turbo run build --filter=web

# 阶段 3：Runner (生产运行环境)
FROM nginx:stable-alpine AS runner

# 拷贝 Nginx 配置
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

# 从构建阶段拷贝产物 (Vite 默认输出到 dist)
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
