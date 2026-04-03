# 第一阶段：编译构建
FROM node:22-alpine AS builder

WORKDIR /app
RUN corepack enable
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# 拷贝根配置
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/
COPY packages/channel-im/package.json packages/channel-im/
COPY packages/mcp-zentao/package.json packages/mcp-zentao/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/tools-zentao/package.json packages/tools-zentao/

# 安装全量依赖 (使用构建缓存加速)
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# 拷贝代码
COPY . .

# 编译前端
RUN pnpm --filter @uclaw/types build
RUN pnpm --filter web build

# 第二阶段：生产运行
FROM nginx:stable-alpine AS runner

# 拷贝 Nginx 配置
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

# 从构建阶段拷贝产物 (Vite 默认输出到 dist)
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
