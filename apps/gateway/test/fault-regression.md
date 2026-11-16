# P0 故障回归矩阵

所有路径相对于仓库根目录。模拟测试不代表真实数据库竞争已经验收。

| 场景与测试 | 故障触发点 | 预期状态 | 禁止副作用 | 恢复验证 |
| --- | --- | --- | --- | --- |
| CLI tool-journal.spec.ts | 写入 effect 后子进程 exit(77)，结果尚未保存 | durable executing，恢复判断 unknown | 同调用再次执行 | 新 Store 拒绝重放，文件仍为 once，Session 可读 |
| delegate_task Journal 边界，同上 | 以 delegate_task 身份执行的回调退出进程 | 保留父调用身份 | 重新启动未知子任务 | 新 Store 拒绝回调；尚非真实 Subagent Loop 退出测试 |
| Gateway run-ownership.spec.ts | 数据库 claim/verify 返回无匹配所有者 | 拒绝竞争者或旧所有者 | 过期事务继续提交 | 校验 LostRunOwnership；数据库模拟，尚缺双 Worker 集成 |
| Gateway tool-executor.spec.ts | 重复消息、参数变化、结果更新时数据库异常 | 缓存命中/冲突拒绝/unknown | 重复非幂等副作用 | execute 次数及持久化状态断言 |
| Gateway outbox.service.spec.ts | 只有匹配 lockedBy 的消息允许确认 | 所有者条件写 | 其他 Worker 确认 | 检查 updateMany 条件；尚缺真实租约过期集成 |
| CLI chat.security.spec.ts | Handler 返回 approved 前取消；等待中篡改参数 | 拒绝执行 | 写工具被调用 | execute 未调用 |
| CLI checkpoints.spec.ts | 另一进程持锁；回滚首文件后进程退出；提交前修改 | conflict 或 rolling_back | 覆盖竞争者内容 | 原文件不变，重新 rollback 完成 |
| CLI mcp/client.spec.ts | callTool 连接中断 | outcome unknown | 自动网络重试 | 调用次数恰为 1 |
| CLI git.workflow.spec.ts | 审阅后另一 Git 提交推进 HEAD | HEAD changed | 过期提交、索引改变 | HEAD 等于并发提交，索引为空，文件保留 |

未完成：真实双 Worker 数据库竞争、真实租约过期、真实 Subagent Loop 强退、Git 子进程执行中强退。
