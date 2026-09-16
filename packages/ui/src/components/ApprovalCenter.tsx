'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ShieldCheck,
  ShieldAlert,
  Check,
  X,
  Plus,
  Trash2,
  Loader2,
  KeyRound,
  Layers,
} from 'lucide-react';
import { cn } from '../lib/utils';

// ── v2 审批中心：对接 RunApproval（/api/approvals/*）+ PolicyEvaluator 权限策略（/api/permissions/*） ──

interface PendingApproval {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  source: string;
  createdAt: string;
  expiresAt?: string | null;
}

interface PolicyRule {
  action: 'allow' | 'deny' | 'ask';
  pattern: string;
  skill?: string;
  comment?: string;
}

interface PolicySettings {
  mode: string;
  maxMcpOutputTokens: number;
  rules: PolicyRule[];
}

const MODES = ['default', 'acceptEdits', 'plan', 'bypassPermissions'];

const ACTION_STYLE: Record<string, string> = {
  allow: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  deny: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30',
  ask: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
};

export function ApprovalCenter() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'approvals' | 'policy'>('approvals');

  // ── 人工审批（RunApproval） ──
  const [pending, setPending] = useState<PendingApproval[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── 权限策略（PolicyEvaluator / PermissionService） ──
  const [policy, setPolicy] = useState<PolicySettings | null>(null);
  const [policyLoading, setPolicyLoading] = useState(false);
  const [policyErr, setPolicyErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const refreshApprovals = useCallback(async () => {
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
    void refreshApprovals();
    timer.current = setInterval(refreshApprovals, 3000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [refreshApprovals]);

  const decide = useCallback(
    async (id: string, decision: 'approved' | 'rejected') => {
      setBusy(id);
      setErr(null);
      try {
        const res = await fetch(`/api/approvals/${id}/decide`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ decision }),
        });
        if (!res.ok) setErr(t('approval_center.decision_failed'));
        await refreshApprovals();
      } catch {
        setErr(t('approval_center.decision_failed'));
      } finally {
        setBusy(null);
      }
    },
    [refreshApprovals, t],
  );

  const loadPolicy = useCallback(async () => {
    setPolicyLoading(true);
    setPolicyErr(null);
    try {
      const res = await fetch('/api/permissions/settings', {
        headers: { accept: 'application/json' },
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as PolicySettings;
      setPolicy({
        mode: data.mode ?? 'default',
        maxMcpOutputTokens: data.maxMcpOutputTokens ?? 25000,
        rules: Array.isArray(data.rules) ? data.rules : [],
      });
    } catch {
      setPolicyErr(t('approval_center.load_failed'));
    } finally {
      setPolicyLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (tab === 'policy') void loadPolicy();
  }, [tab, loadPolicy]);

  const savePolicy = useCallback(async () => {
    if (!policy) return;
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch('/api/permissions/settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(policy),
      });
      if (!res.ok) throw new Error(String(res.status));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setPolicyErr(t('approval_center.save_failed'));
    } finally {
      setSaving(false);
    }
  }, [policy, t]);

  const patchRule = (idx: number, patch: Partial<PolicyRule>) => {
    if (!policy) return;
    setPolicy({
      ...policy,
      rules: policy.rules.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    });
  };
  const removeRule = (idx: number) => {
    if (!policy) return;
    setPolicy({ ...policy, rules: policy.rules.filter((_, i) => i !== idx) });
  };
  const addRule = () => {
    if (!policy) return;
    setPolicy({
      ...policy,
      rules: [...policy.rules, { action: 'ask', pattern: '' }],
    });
  };

  const argsSummary = (args: Record<string, unknown> | undefined) => {
    if (!args) return '';
    const text = JSON.stringify(args);
    return text.length > 140 ? `${text.slice(0, 137)}…` : text;
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Tab 切换 */}
      <div className="flex items-center gap-1 rounded-full border border-border bg-muted/40 p-1">
        <button
          type="button"
          onClick={() => setTab('approvals')}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors',
            tab === 'approvals'
              ? 'bg-foreground text-background'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <ShieldAlert className="w-3.5 h-3.5" />
          {t('approval_center.tab_approvals')}
          {pending.length > 0 && (
            <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-black text-white">
              {pending.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setTab('policy')}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors',
            tab === 'policy'
              ? 'bg-foreground text-background'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <KeyRound className="w-3.5 h-3.5" />
          {t('approval_center.tab_policy')}
        </button>
      </div>

      {err && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
          {err}
        </div>
      )}

      {/* ── Tab 1：待审批 ── */}
      {tab === 'approvals' &&
        (pending.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <ShieldCheck className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-xs font-medium text-muted-foreground">
              {t('approval_center.empty_approvals')}
            </p>
            <p className="text-[11px] text-muted-foreground/60">
              {t('approval_center.empty_hint')}
            </p>
          </div>
        ) : (
          <div className="flex max-h-[42vh] flex-col gap-2 overflow-y-auto pr-1">
            {pending.map((a) => (
              <div
                key={a.id}
                className="rounded-xl border border-amber-500/30 bg-card p-3.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="inline-flex h-2 w-2 shrink-0 rounded-full bg-amber-400" />
                    <span className="truncate text-sm font-semibold text-foreground">
                      {a.toolName}
                    </span>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-tighter',
                      a.source === 'cli'
                        ? 'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                        : 'border-border bg-muted text-muted-foreground',
                    )}
                  >
                    {a.source === 'cli' ? 'CLI' : 'Run'}
                  </span>
                </div>
                <div className="mt-2 max-h-20 overflow-y-auto rounded bg-muted/60 px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
                  {argsSummary(a.args)}
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => decide(a.id, 'approved')}
                    disabled={busy === a.id}
                    className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                  >
                    <Check className="w-3.5 h-3.5" />
                    {t('approval_center.approve')}
                  </button>
                  <button
                    onClick={() => decide(a.id, 'rejected')}
                    disabled={busy === a.id}
                    className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-red-500 disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" />
                    {t('approval_center.reject')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}

      {/* ── Tab 2：权限策略 ── */}
      {tab === 'policy' && (
        <div className="flex flex-col gap-3">
          {policyLoading && !policy && (
            <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('approval_center.loading')}
            </div>
          )}
          {policyErr && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
              {policyErr}
            </div>
          )}
          {policy && (
            <>
              {/* 模式 */}
              <div className="rounded-xl border border-border bg-card p-3.5">
                <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  {t('approval_center.policy_mode')}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {MODES.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPolicy({ ...policy, mode: m })}
                      className={cn(
                        'rounded-full border px-3 py-1 text-[11px] font-bold transition-colors',
                        policy.mode === m
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-muted/40 text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* 规则 */}
              <div className="rounded-xl border border-border bg-card p-3.5">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    {t('approval_center.policy_rules')}
                  </p>
                  <button
                    type="button"
                    onClick={addRule}
                    className="flex items-center gap-1 rounded-full border border-border px-2 py-1 text-[10px] font-bold text-primary hover:bg-primary/5"
                  >
                    <Plus className="w-3 h-3" />
                    {t('approval_center.add_rule')}
                  </button>
                </div>
                <div className="flex max-h-[30vh] flex-col gap-1.5 overflow-y-auto pr-1">
                  {policy.rules.length === 0 && (
                    <p className="py-3 text-center text-[11px] text-muted-foreground/60">
                      {t('approval_center.no_rules')}
                    </p>
                  )}
                  {policy.rules.map((r, idx) => (
                    <div key={idx} className="flex items-center gap-1.5">
                      <select
                        value={r.action}
                        onChange={(e) =>
                          patchRule(idx, {
                            action: e.target.value as PolicyRule['action'],
                          })
                        }
                        className={cn(
                          'h-8 shrink-0 rounded-lg border px-1.5 text-[11px] font-bold outline-none',
                          ACTION_STYLE[r.action],
                        )}
                      >
                        <option value="allow">{t('approval_center.action_allow')}</option>
                        <option value="deny">{t('approval_center.action_deny')}</option>
                        <option value="ask">{t('approval_center.action_ask')}</option>
                      </select>
                      <input
                        value={r.pattern}
                        onChange={(e) => patchRule(idx, { pattern: e.target.value })}
                        placeholder="mcp__*:read, Edit(src/**)"
                        className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-muted/40 px-2 text-[11px] font-mono text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary"
                      />
                      <input
                        value={r.comment ?? ''}
                        onChange={(e) => patchRule(idx, { comment: e.target.value })}
                        placeholder={t('approval_center.comment')}
                        className="h-8 w-24 shrink-0 rounded-lg border border-border bg-muted/40 px-2 text-[11px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary"
                      />
                      <button
                        type="button"
                        onClick={() => removeRule(idx)}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={savePolicy}
                disabled={saving}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-foreground px-4 py-2 text-xs font-bold text-background transition hover:opacity-80 disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : saved ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Layers className="h-3.5 w-3.5" />
                )}
                {saved ? t('approval_center.saved') : t('approval_center.save')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
