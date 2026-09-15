# Ocean Runbook —— Phase 7：故障恢复手册与演练记录

> 状态：2026-09-15 首次编写；备份/恢复流程已做真实演练（见 §5）。
> 适用对象：Gateway / Worker / PostgreSQL（docker `ocean-postgres`）/ 本地对象存储（ArtifactStore）。

## 1. 故障分类与响应顺序

| 症状 | 可能根因 | 首先检查 | 参考 |
| --- | --- | --- | --- |
| 网关启动失败 | 生产配置缺失/弱密钥 | `assertProductionConfig` 拒绝清单 | §2 |
| 网关启动失败 | DB 不可达 | `docker ps` / `pg_isready` | §3.1 |
| 网关启动失败 | 迁移未应用 | `prisma migrate status` | §3.2 |
| Run 卡 queued | Worker 未运行 / 队列积压 | Worker 日志、`GET /api/metrics` outbox 计数 | §4 |
| 工具执行后产物丢失 | ArtifactStore 目录损坏 | `artifacts/` 磁盘、`run_artifacts` 表 | §3.4 |
| 审批超时无响应 | ApprovalService 未扫描 | 审批超时任务日志 | §4.3 |
| 数据损坏/误删 | 人为或应用 Bug | 备份恢复 | §5 |

## 2. 生产配置校验（fail-fast）

启动首行执行 `assertProductionConfig()`（`src/config/env.validation.ts`）：

- `JWT_SECRET`：缺失、已知弱值（`ocean-secret-key-2024` 等）、<32 字符 → 拒绝。
- `DATABASE_URL`：缺失、非 localhost 的默认口令 DSN → 拒绝。
- AI key：`DEFAULT_AI_PROVIDER` 对应 key（如 `DASHSCOPE_API_KEY`）缺失 → 拒绝（`local` 豁免）。

处理：读取拒绝清单，补齐/更换配置后重启。**不要**为绕过校验设置弱值。

## 3. 存储故障

### 3.1 PostgreSQL 不可达

```bash
docker ps | grep ocean-postgres      # 容器是否存活
docker logs ocean-postgres --tail 50 # 崩溃原因（磁盘/OOM/配置）
docker start ocean-postgres          # 容器未运行则拉起
docker exec ocean-postgres pg_isready -U postgres
```

容器健康后，Gateway/Worker 自动重连（Prisma 连接池）。

### 3.2 迁移状态异常

```bash
cd apps/gateway
DATABASE_URL='postgresql://postgres:postgres@localhost:5432/ocean?schema=public' \
  corepack pnpm exec prisma migrate status
```

- 未应用迁移：按 `prisma/migrations/<name>/migration.sql` 顺序以 psql 应用，
  再 `prisma migrate resolve --applied <name>`。
- 已知怪癖：个别迁移在建表后出现"表短暂缺失"瞬态（P5/P6 期间两次）；
  重跑对应 migration.sql（幂等）即恢复。冒烟前先 `psql -t -c "SELECT table_name FROM information_schema.tables WHERE table_name='<表>'"` 验证。

### 3.3 对象存储（ArtifactStore）

- 根目录：`ARTIFACT_ROOT`（默认 `<cwd>/artifacts`），键 = `<runId>/<artifactId>`。
- DB `run_artifacts` 只存引用；文件丢失 = 内容不可恢复（需在上游重新生成）。
- 恢复：从备份恢复 DB 引用后，重放/重新生成缺失文件；**ArtifactStore 目录不随 pg_dump 备份**，
  生产需纳入文件系统/对象存储备份计划。

### 3.4 队列（Outbox / Worker 租约）

- Outbox 表 `outbox_events`（topic: `run.requested` / `tool.requested`）。
- Worker 租约过期后消息会被重新认领（幂等：toolCallId 兼幂等键，重复投递不二次执行）。
- 卡 queued：检查 Worker 进程是否运行；`GET /api/metrics` 看 `outbox_enqueued` 是否持续增长而 `run_terminal` 停滞。

## 4. 恢复流程

### 4.1 Gateway / Worker 重启

Gateway 与 Worker 无状态恢复点：
- Run 状态/事件在 PG（重启后读 `agent_runs` + `run_events`，SSE 可断点续读 `after=`）。
- 中断的模型调用 → `RetryableError` → 退避重投。
- 审批决策后由 RunService 重新投递 `tool.requested`（含幂等键）。

### 4.2 重复投递与幂等

- `toolCall.idempotencyKey`：同 run+key 已有 succeeded 步骤 → 缓存命中，不二次执行。
- Approval 决策续跑：读取已 approved 审批记录作为检查点，不重复请求。

### 4.3 审批超时

- 默认 30 分钟；到期自动标记 expired，Run 置 cancelled。
- 恢复：人工在新 Run 重发，或调整 `timeoutMs` 后重试。

## 5. 备份与恢复演练（已验证 2026-09-15）

### 5.1 备份

```bash
cd apps/gateway
DATABASE_URL='postgresql://postgres:postgres@localhost:5432/ocean?schema=public' \
  BACKUP_DIR=/var/backups/ocean bash scripts/backup.sh 7
```

- 自动优先 `docker exec ocean-postgres pg_dump`（规避本地/容器版本不匹配）。
- 自定义格式 `-Fc`；保留最近 N 份（默认 7）。
- 建议 cron：`0 2 * * *`。

### 5.2 恢复（演练过程，已验证）

```bash
DUMP=$(ls -t /var/backups/ocean/ocean-*.dump | head -1)
docker exec ocean-postgres psql -U postgres -c "DROP DATABASE IF EXISTS ocean_restore"
docker exec ocean-postgres psql -U postgres -c "CREATE DATABASE ocean_restore"
docker cp "$DUMP" ocean-postgres:/tmp/restore.dump
docker exec ocean-postgres pg_restore -U postgres -d ocean_restore --no-owner --no-privileges /tmp/restore.dump
# 验证
docker exec ocean-postgres psql -U postgres -d ocean_restore -t \
  -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"
```

**2026-09-15 演练结果**：临时库 `ocean_restore_test` 恢复 44 张表、4 用户、12 条迁移记录，
与主库一致；演练后清理临时库。

### 5.3 恢复后的后续步骤

1. 停 Gateway/Worker → 恢复 DB → 起 Gateway/Worker（自动重连）。
2. `prisma migrate status` 应显示全部 applied（pg_dump 含 `_prisma_migrations`）。
3. 确认 ArtifactStore 目录仍可读（不在 pg 备份内）。
4. 冒烟：登录 → 建 Run → 看 `/api/metrics` 计数增长。

## 6. 监控

- `GET /api/metrics`（Prometheus 文本）：`run_created`、`run_terminal{status}`、
  `tool_executed{tool}`、`approval_requested`、`outbox_enqueued{topic}`、`http_requests{method,status}`。
- OTel traces push 到 `OTEL_EXPORTER_OTLP_ENDPOINT`（默认 `http://jaeger:4318/v1/traces`）。
- 告警建议：`run_terminal{status="failed"}` 突增、`outbox_enqueued` 与 `run_terminal` 差值持续放大、
  `http_requests{status="5xx"}` 比例 > 1%、`/api/metrics` 不可达。
