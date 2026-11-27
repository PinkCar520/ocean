# Shared UI browser verification

`pnpm audit:ui:browser` launches isolated fixture entries under the actual Web application and the Desktop renderer's Vite pipeline, then exercises the real shared primitives in Chromium and Electron. The temporary entry files are created only for tests and removed afterward. Existing files are never overwritten.

Checks cover native focus, keyboard selection, disabled state, input values, modal stacking, icon sizing and screenshots. Screenshots are diagnostic evidence, not approved pixel baselines. The Electron fixture runs inside a real BrowserWindow but does not exercise production IPC, auth, workspace host, or the complete application shell. The Next fixture uses the production project's config and layout but does not exercise authenticated application routes.

CI installs locked dependencies and Playwright Chromium, launches Electron under Xvfb, and uploads screenshots/traces. Local execution requires the installed Electron binary, Playwright Chromium and a graphical display (or Xvfb on Linux). No product fixture route is shipped.
