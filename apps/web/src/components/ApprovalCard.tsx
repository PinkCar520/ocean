import { Shield, Check, X, Clock, AlertTriangle } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/utils';
import type { UIApprovalCardProps } from '../types/ui-protocol';

export type { UIApprovalCardProps };

export interface ApprovalCardProps {
  requestId: UIApprovalCardProps['requestId'];
  toolName: UIApprovalCardProps['toolName'];
  description: UIApprovalCardProps['description'];
  args?: UIApprovalCardProps['args'];
  status: UIApprovalCardProps['status'];
  onApprove?: () => void;
  onReject?: () => void;
}

export function ApprovalCard({
  requestId,
  toolName,
  description,
  args,
  status,
  onApprove,
  onReject,
}: ApprovalCardProps) {
  const { t } = useTranslation();

  const statusConfig: Record<string, {
    icon: ReactElement;
    label: string;
    bg: string;
    border: string;
    text: string;
  }> = {
    pending: {
      icon: <Clock className="w-4 h-4 text-amber-500" />,
      label: t('approval.status.pending', '待审批'),
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      text: 'text-amber-700',
    },
    approved: {
      icon: <Check className="w-4 h-4 text-emerald-500" />,
      label: t('approval.status.approved', '已同意'),
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      text: 'text-emerald-700',
    },
    rejected: {
      icon: <X className="w-4 h-4 text-rose-500" />,
      label: t('approval.status.rejected', '已拒绝'),
      bg: 'bg-rose-50',
      border: 'border-rose-200',
      text: 'text-rose-700',
    },
  };

  const config = statusConfig[status];
  const isPending = status === 'pending';

  return (
    <div className={cn(
      "my-3 bg-white border rounded-2xl p-5 transition-all overflow-hidden",
      config.border,
      isPending && "shadow-md shadow-amber-500/5"
    )}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className={cn("p-2 rounded-xl", config.bg, config.border, "border")}>
          <Shield className={cn("w-5 h-5", config.text)} />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-bold text-slate-800 truncate">{toolName}</h4>
          <p className="text-[11px] text-slate-400 font-mono">ID: {requestId}</p>
        </div>
        <div className={cn(
          "flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold border uppercase",
          config.bg, config.border, config.text
        )}>
          {config.icon}
          {config.label}
        </div>
      </div>

      {/* Description */}
      <p className="text-[13px] text-slate-600 leading-relaxed mb-4 font-medium">
        {description}
      </p>

      {/* Args Preview */}
      {args && Object.keys(args).length > 0 && (
        <details className="mb-4 group/details">
          <summary className="text-[11px] font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-600 transition-colors">
            {t('approval.view_args', '查看参数')}
          </summary>
          <pre className="mt-2 p-3 bg-slate-50 rounded-xl border border-slate-100 text-[11px] font-mono text-slate-600 overflow-auto max-h-32">
            {JSON.stringify(args, null, 2)}
          </pre>
        </details>
      )}

      {/* Actions */}
      {isPending && (
        <div className="flex items-center gap-2 pt-4 border-t border-slate-100">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
          <span className="text-[11px] text-slate-500 font-medium flex-1">
            {t('approval.confirm_message', '确认执行此操作？')}
          </span>
          <button
            onClick={onReject}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-bold transition-all border border-slate-200 flex items-center gap-1.5"
          >
            <X className="w-3 h-3" />
            {t('approval.reject', '拒绝')}
          </button>
          <button
            onClick={onApprove}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition-all border border-emerald-500 flex items-center gap-1.5"
          >
            <Check className="w-3 h-3" />
            {t('approval.approve', '同意')}
          </button>
        </div>
      )}
    </div>
  );
}
