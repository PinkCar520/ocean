import chalk from 'chalk';

/**
 * Gateway 外部审批 handler（对齐 Codex/Claude：CLI 负责执行，审批弹在对话窗口）。
 *
 * CLI 本地执行触发 requiresApproval 工具时：
 * 1. POST /api/approvals 在 Gateway 创建外部审批（RunApproval，runId 为空）
 * 2. 终端提示用户在对话窗口（Web 面板）批准/拒绝
 * 3. 轮询 GET /api/approvals/:id 直到 approved / rejected / expired
 *
 * 审批通道不可用（Gateway 离线/无权限）时安全优先：直接拒绝，不静默执行。
 */
export function createGatewayApprovalHandler(options: {
  gatewayUrl: string;
  apiKey: string;
  sessionId: string;
  /** 对话窗口提示文案（默认指 Web 审批面板） */
  hint?: string;
}): (
  toolName: string,
  args: any,
) => Promise<'approved' | 'rejected' | 'expired'> {
  const base = options.gatewayUrl.replace(/\/$/, '');
  const authHeaders = {
    'content-type': 'application/json',
    'x-api-key': options.apiKey,
    Authorization: `Bearer ${options.apiKey}`,
  };
  const hintText = options.hint ?? '请在对话窗口（Web 审批面板）批准或拒绝';

  // 同工具并发去重：模型在一次响应中并行发起多个同工具调用时，合并为同一张审批单
  // （避免 CLI 同时轮询多张 pending、Web 面板出现重复卡片）。
  const inflight = new Map<string, Promise<'approved' | 'rejected' | 'expired'>>();

  return async (toolName: string, args: any) => {
    const existing = inflight.get(toolName);
    if (existing) return existing;

    const run = (async (): Promise<'approved' | 'rejected' | 'expired'> => {
      let approvalId: string;
    try {
      const res = await fetch(`${base}/api/approvals`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          toolName,
          args: args ?? {},
          sessionId: options.sessionId,
        }),
      });
      if (!res.ok) {
        console.log(
          chalk.red(`\n✗ [审批] 工具 ${toolName} 需要批准，但审批通道不可用（HTTP ${res.status}）。已拒绝执行。`),
        );
        return 'rejected';
      }
      const created = (await res.json()) as { id: string };
      approvalId = created.id;
    } catch {
      console.log(
        chalk.red(`\n✗ [审批] 工具 ${toolName} 需要批准，但无法连接 Gateway。已拒绝执行。`),
      );
      return 'rejected';
    }

    console.log(
      chalk.yellow(`\n⚠️ [审批] 工具 ${toolName} 需要批准。${hintText}。`),
    );
    console.log(chalk.gray('  等待中…（Ctrl+C 取消）'));

    // 轮询审批结果（最长 24h，与 Gateway 端 expiresAt 一致）
    const deadline = Date.now() + 24 * 60 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const res = await fetch(`${base}/api/approvals/${approvalId}`, {
          headers: authHeaders,
        });
        if (!res.ok) continue;
        const st = (await res.json()) as { status: string };
        if (st.status === 'approved') {
          console.log(chalk.green(`✓ [审批] ${toolName} 已批准，继续执行。`));
          return 'approved';
        }
        if (st.status === 'rejected') {
          console.log(chalk.red(`✗ [审批] ${toolName} 已拒绝。`));
          return 'rejected';
        }
        if (st.status === 'expired') {
          console.log(chalk.red(`✗ [审批] ${toolName} 审批超时。`));
          return 'expired';
        }
      } catch {
        /* Gateway 瞬时不可用，继续轮询 */
      }
    }
      console.log(chalk.red(`✗ [审批] ${toolName} 等待审批超时。`));
      return 'expired';
    })();

    inflight.set(toolName, run);
    run.finally(() => inflight.delete(toolName));
    return run;
  };
}
