'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ExternalLink, Hand, Radar, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';

// ── 审批权限弹窗：纯展示组件，mode 由父组件持有，选中即回调 ──
// 不自持 state、不 fetch 后端（避免打开弹窗 fetch 回写造成闪烁/丢状态）
// 人工审批由右下角 ApprovalPanel 浮层承接（/api/approvals/*）

export interface PermissionTier {
  mode: string;
  key: string;
  warn?: boolean;
  icon: React.ComponentType<{ className?: string }>;
}

export const PERMISSION_TIERS: PermissionTier[] = [
  { mode: 'default', key: 'ask', icon: Hand },
  { mode: 'acceptEdits', key: 'ondemand', icon: Radar },
  { mode: 'bypassPermissions', key: 'allow', warn: true, icon: AlertCircle },
];

export function ApprovalCenter({
  mode,
  onSelectMode,
  onClose,
}: {
  mode: string;
  onSelectMode: (mode: string) => void;
  onClose?: () => void;
}) {
  const { t } = useTranslation();
  // plan 在 UI 上归入 acceptEdits 展示
  const displayMode = mode === 'plan' ? 'acceptEdits' : mode;
  const activeTier =
    PERMISSION_TIERS.find((m) => m.mode === displayMode) ?? PERMISSION_TIERS[1];

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

      {/* 三档单选卡片 */}
      <div className="flex flex-col gap-1">
        {PERMISSION_TIERS.map((m) => {
          const active = activeTier.mode === m.mode;
          return (
            <button
              key={m.mode}
              type="button"
              onClick={() => {
                onSelectMode(m.mode);
                onClose?.();
              }}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-all hover:bg-muted/60',
              )}
            >
              <m.icon className="h-4 w-4 shrink-0 text-foreground" />
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    'block text-[13px] font-bold leading-snug',
                    m.warn ? 'text-orange-600 dark:text-orange-400' : 'text-foreground',
                  )}
                >
                  {t(`approval_center.mode_${m.key}_title`)}
                </span>
                <span
                  className={cn(
                    'mt-0 block text-[11px] leading-snug',
                    m.warn ? 'text-orange-600/70 dark:text-orange-400/70' : 'text-muted-foreground',
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
    </div>
  );
}
