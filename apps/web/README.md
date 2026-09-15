# Ocean Web

Ocean Web 使用 Next.js App Router。`src/app` 中的 layout 与 page 默认为 Server Components；需要浏览器状态、事件或共享交互 UI 的入口显式使用 Client Component。

```bash
pnpm --filter web dev
pnpm --filter web build
pnpm --filter web start
```

开发服务监听 `5173`。`/api/*` 与 `/public/*` 由 Next.js 重写到 `OCEAN_GATEWAY_URL`，未配置时使用 `http://localhost:3000`。

容器部署监听 Next.js 默认端口 `3000`，Compose 映射为宿主机 `8081`，并将 Gateway 地址设置为容器网络内的 `http://gateway:3000`。开发命令仍监听 `5173`。

Web 登录只使用由 Gateway 签发的 `HttpOnly`、`SameSite=Lax` 会话 Cookie，不读取或保存 localStorage Token。Next.js `proxy.ts` 对受保护路由执行 Cookie 存在性预检查，最终授权仍由 Gateway 完成。Desktop 与 CLI 继续使用 Bearer Token。
