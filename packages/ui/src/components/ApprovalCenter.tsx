'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Check,
  ChevronDown,
  Loader2,
  ShieldCheck,
  Plus,
  Trash2,
  Layers,
  ExternalLink,
} from 'lucide-react';
import { cn } from '../lib/utils';

// ── 审批权限弹窗（还原 Codex/豆包：标题 + 三档单选 + 底部确认按钮） ──
// 权限策略对接 /api/permissions/settings（PolicyEvaluator / PermissionService）；
// 人工审批由右下角 ApprovalPanel 浮层承接（RunApproval /api/approvals/*）。

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

// 三档权限模式 → 后端 PermissionSettings.mode
const TIERS: Array<{ mode: string; key: string; warn?: boolean }> = [
  { mode: 'default', key: 'ask' },
  { mode: 'acceptEdits', key: 'ondemand' },
  { mode: 'bypassPermissions', key: 'allow', warn: true },
];

const ACTION_STYLE: Record<string, string> = {
  allow: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  deny: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30',
  ask: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
};

export function ApprovalCenter({ onClose }: { onClose?: () => void }) {
  const { t } = useTranslation();

  const [policy, setPolicy] = useState<PolicySettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
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
      setError(t('approval_center.load_failed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async () => {
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
      setTimeout(() => onClose?.(), 400);
    } catch {
      setError(t('approval_center.save_failed'));
      setSaving(false);
    }
  }, [policy, t, onClose]);

  // 当前选中档（plan 归入按需确认展示）
  const activeTier =
    TIERS.find(
      (m) => policy?.mode === m.mode || (m.mode === 'acceptEdits' && policy?.mode === 'plan'),
    ) ?? TIERS[1];

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

  return (
    <div className="flex flex-col gap-4">
      {/* 标题 + 了解更多 */}
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[15px] font-bold leading-snug text-foreground">
          {t('approval_center.mode_title')}
        </h3>
        <a
          href="https://docs.anthropic.com/en/docs/claude-code/settings"
          target="_blank"
          rel="noreferrer"
          className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-primary hover:underline"
        >
          {t('approval_center.know_more')}
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {loading && !policy ? (
        <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('approval_center.loading')}
        </div>
      ) : (
        policy && (
          <>
            {/* 三档单选卡片 */}
            <div className="flex flex-col gap-2">
              {TIERS.map((m) => {
                const active = activeTier.mode === m.mode;
                return (
                  <button
                    key={m.mode}
                    type="button"
                    onClick={() => setPolicy({ ...policy, mode: m.mode })}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl p-3.5 text-left transition-all',
                      active
                        ? 'bg-primary/5 ring-1 ring-primary/25 shadow-sm'
                        : 'bg-muted/40 hover:bg-muted/60',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          'block text-[13px] font-bold',
                          m.warn
                            ? 'text-orange-600 dark:text-orange-400'
                            : 'text-foreground',
                        )}
                      >
                        {t(`approval_center.mode_${m.key}_title`)}
                      </span>
                      <span
                        className={cn(
                          'mt-0.5 block text-[11px] leading-relaxed',
                          m.warn
                            ? 'text-orange-600/70 dark:text-orange-400/70'
                            : 'text-muted-foreground',
                        )}
                      >
                        {t(`approval_center.mode_${m.key}_desc`)}
                      </span>
                    </span>
                    <span
                      className={cn(
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                        active ? 'border-primary bg-primary' : 'border-border bg-card',
                      )}
                    >
                      {active && <Check className="h-3 w-3 text-white" strokeWidth={3.5} />}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* 高级规则（默认折叠） */}
            <div className="rounded-xl border border-border bg-card">
              <button
                type="button"
                onClick={() => setAdvancedOpen(!advancedOpen)}
                className="flex w-full items-center justify-between px-3.5 py-2.5"
              >
                <span className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
                  <Layers className="h-3.5 w-3.5" />
                  {t('approval_center.advanced_rules')}
                  {policy.rules.length > 0 && (
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-black text-muted-foreground">
                      {policy.rules.length}
                    </span>
                  )}
                </span>
                <ChevronDown
                  className={cn(
                    'h-3.5 w-3.5 text-muted-foreground transition-transform',
                    advancedOpen && 'rotate-180',
                  )}
                />
              </button>
              {advancedOpen && (
                <div className="border-t border-border p-3.5">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      {t('approval_center.policy_rules')}
                    </p>
                    <button
                      type="button"
                      onClick={addRule}
                      className="flex items-center gap-1 rounded-full border border-border px-2 py-1 text-[10px] font-bold text-primary hover:bg-primary/5"
                    >
                      <Plus className="h-3 w-3" />
                      {t('approval_center.add_rule')}
                    </button>
                  </div>
                  <div className="flex max-h-[28vh] flex-col gap-1.5 overflow-y-auto pr-1">
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
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 底部确认按钮：显示当前选中档名称 */}
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className={cn(
                'flex w-full items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold transition disabled:opacity-50',
                activeTier.warn
                  ? 'bg-orange-600 text-white hover:bg-orange-500'
                  : 'bg-foreground text-background hover:opacity-85',
              )}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : saved ? (
                <Check className="h-4 w-4" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
              {saved
                ? t('approval_center.saved')
                : t(`approval_center.mode_${activeTier.key}_title`)}
            </button>
          </>
        )
      )}
    </div>
  );
}
