'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface PendingApproval {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  source: string;
  createdAt: string;
  expiresAt?: string | null;
}

/**
 * 对话窗口审批面板（对齐 Codex/Claude：CLI 负责执行，审批弹在对话窗口）。
 *
 * 轮询 /api/approvals/pending（cookie 认证），有 CLI 本地执行触发的待审批时
 * 右下角弹出审批卡片，批准/拒绝走 /api/approvals/:id/decide。
 */
export function ApprovalPanel() {
  const [pending, setPending] = useState<PendingApproval[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/approvals/pending', {
        headers: { accept: 'application/json' },
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data = (await res.json()) as PendingApproval[];
      setPending(Array.isArray(data) ? data : []);
    } catch {
      /* 网关瞬时不可用，下一轮再试 */
    }
  }, []);

  useEffect(() => {
    void refresh();
    timer.current = setInterval(refresh, 3000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [refresh]);

  const decide = useCallback(
    async (id: string, decision: 'approved' | 'rejected') => {
      setBusy(id);
      setError(null);
      try {
        const res = await fetch(`/api/approvals/${id}/decide`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ decision }),
        });
        if (!res.ok) {
          setError(`决策失败（HTTP ${res.status}）`);
        }
        await refresh();
      } catch (e) {
        setError(`决策失败：${e instanceof Error ? e.message : '网络错误'}`);
      } finally {
        setBusy(null);
      }
    },
    [refresh],
  );

  if (pending.length === 0) return null;

  const summary = (args: Record<string, unknown> | undefined) => {
    if (!args) return '';
    const text = JSON.stringify(args);
    return text.length > 120 ? `${text.slice(0, 117)}…` : text;
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex w-80 flex-col gap-3">
      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-950/90 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}
      {pending.map((a) => (
        <div
          key={a.id}
          className="rounded-xl border border-amber-500/40 bg-[#1a1508]/95 p-4 shadow-2xl shadow-black/50 backdrop-blur"
        >
          <div className="flex items-center gap-2">
            <span className="inline-flex h-2 w-2 rounded-full bg-amber-400" />
            <span className="text-sm font-semibold text-amber-200">
              待批准：{a.toolName}
            </span>
          </div>
          <div className="mt-2 max-h-24 overflow-y-auto rounded bg-black/40 px-2 py-1 font-mono text-xs text-gray-300">
            {summary(a.args)}
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => decide(a.id, 'approved')}
              disabled={busy === a.id}
              className="flex-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
            >
              批准
            </button>
            <button
              onClick={() => decide(a.id, 'rejected')}
              disabled={busy === a.id}
              className="flex-1 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-50"
            >
              拒绝
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
