'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Check,
  Loader2,
  ExternalLink,
  Hand,
  Radar,
  AlertCircle,
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
const TIERS: Array<{
  mode: string;
  key: string;
  warn?: boolean;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { mode: 'default', key: 'ask', icon: Hand },
  { mode: 'acceptEdits', key: 'ondemand', icon: Radar },
  { mode: 'bypassPermissions', key: 'allow', warn: true, icon: AlertCircle },
];

const ACTION_STYLE: Record<string, string> = {
  allow: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  deny: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30',
  ask: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
};

export function ApprovalCenter({
  onClose,
  onModeChange,
}: {
  onClose?: () => void;
  onModeChange?: (mode: string) => void;
}) {
  const { t } = useTranslation();

  const [policy, setPolicy] = useState<PolicySettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
      const loadedMode = data.mode ?? 'acceptEdits';
      setPolicy({
        mode: loadedMode,
        maxMcpOutputTokens: data.maxMcpOutputTokens ?? 25000,
        rules: Array.isArray(data.rules) ? data.rules : [],
      });
      // 打开弹窗即以后端为准同步按钮（写入 localStorage），消除双源不一致
      onModeChange?.(loadedMode);
    } catch {
      setError(t('approval_center.load_failed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  // 选中即保存（豆包交互：点卡片即生效，无确认按钮）
  const selectMode = useCallback(
    async (mode: string) => {
      if (!policy) return;
      const next = { ...policy, mode };
      setPolicy(next);
      setSaving(true);
      try {
        const res = await fetch('/api/permissions/settings', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(next),
        });
        if (!res.ok) throw new Error(String(res.status));
        onModeChange?.(next.mode);
        onClose?.();
      } catch {
        setError(t('approval_center.save_failed'));
      } finally {
        setSaving(false);
      }
    },
    [policy, t, onClose],
  );

  // 当前选中档（plan 归入按需确认展示）
  const activeTier =
    TIERS.find(
      (m) => policy?.mode === m.mode || (m.mode === 'acceptEdits' && policy?.mode === 'plan'),
    ) ?? TIERS[1];

  return (
    <div className="flex flex-col gap-3">
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
            <div className="flex flex-col gap-1">
              {TIERS.map((m) => {
                const active = activeTier.mode === m.mode;
                return (
                  <button
                    key={m.mode}
                    type="button"
                    onClick={() => selectMode(m.mode)}
                    disabled={saving}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-all hover:bg-muted/60',
                    )}
                  >
                    <m.icon className="h-4 w-4 shrink-0 text-foreground" />
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          'block text-[13px] font-bold leading-snug',
                          m.warn
                            ? 'text-orange-600 dark:text-orange-400'
                            : 'text-foreground',
                        )}
                      >
                        {t(`approval_center.mode_${m.key}_title`)}
                      </span>
                      <span
                        className={cn(
                          'mt-0 block text-[11px] leading-snug',
                          m.warn
                            ? 'text-orange-600/70 dark:text-orange-400/70'
                            : 'text-muted-foreground',
                        )}
                      >
                        {t(`approval_center.mode_${m.key}_desc`)}
                      </span>
                    </span>
                    {active && (
                      <Check
                        className={cn(
                          'h-4 w-4 shrink-0',
                          m.warn ? 'text-orange-500' : 'text-primary',
                        )}
                        strokeWidth={3}
                      />
                    )}
                  </button>
                );
              })}
            </div>

          </>
        )
      )}
    </div>
  );
}
