import { Shield, Check, X, Clock, AlertTriangle, ShieldCheck } from 'lucide-react';
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
  submitting?: boolean;
  responseError?: boolean;
  approveLabel?: string;
  className?: string;
}

export function ApprovalCard({
  requestId,
  toolName,
  description,
  args,
  status,
  onApprove,
  onReject,
  submitting,
  responseError,
  approveLabel,
  className,
}: ApprovalCardProps) {
  const { t } = useTranslation();

  const statusConfig: Record<string, {
    icon: ReactElement;
    label: string;
    bg: string;
    border: string;
    text: string;
    iconBg: string;
  }> = {
    pending: {
      icon: <Clock className="w-4 h-4 text-[#F59E0B]" />,
      label: t('approval.status.pending', 'Pending'),
      bg: 'bg-[#F59E0B]/5',
      border: 'border-[#F59E0B]/20',
      text: 'text-[#D97706]',
      iconBg: 'bg-[#F59E0B]/10',
    },
    approved: {
      icon: <Check className="w-4 h-4 text-[#10B981]" />,
      label: t('approval.status.approved', 'Approved'),
      bg: 'bg-[#10B981]/5',
      border: 'border-[#10B981]/20',
      text: 'text-[#059669]',
      iconBg: 'bg-[#10B981]/10',
    },
    rejected: {
      icon: <X className="w-4 h-4 text-[#F43F5E]" />,
      label: t('approval.status.rejected', 'Rejected'),
      bg: 'bg-[#F43F5E]/5',
      border: 'border-[#F43F5E]/20',
      text: 'text-[#DC2626]',
      iconBg: 'bg-[#F43F5E]/10',
    },
    expired: {
      icon: <AlertTriangle className="w-4 h-4 text-[#6B7280]" />,
      label: t('approval.status.expired', 'Expired'),
      bg: 'bg-[#6B7280]/5',
      border: 'border-[#6B7280]/20',
      text: 'text-[#4B5563]',
      iconBg: 'bg-[#6B7280]/10',
    },
    superseded: {
      icon: <AlertTriangle className="w-4 h-4 text-[#6B7280]" />,
      label: t('approval.status.superseded', 'Superseded'),
      bg: 'bg-[#6B7280]/5',
      border: 'border-[#6B7280]/20',
      text: 'text-[#4B5563]',
      iconBg: 'bg-[#6B7280]/10',
    },
  };

  const config = statusConfig[status] ?? statusConfig.pending;
  const isPending = status === 'pending';

  const path = typeof args?.path === 'string' && toolName.startsWith('local_file_') ? args.path : undefined;
  const proposedEdits = path && toolName === 'local_file_patch' && Array.isArray(args?.edits)
    ? args.edits
    : path && toolName === 'local_file_edit' ? [args] : [];
  const edits = proposedEdits.filter((edit): edit is { old_string: string; new_string: string } =>
    !!edit && typeof edit === 'object' && typeof edit.old_string === 'string' && typeof edit.new_string === 'string');
  const proposedText = path && toolName === 'local_file_write' && typeof args?.content === 'string'
    ? args.content : undefined;

  return (
    <div className={cn(
      "bg-card border rounded-[20px] overflow-hidden shadow-[0_8px_30px_rgba(0,0,0,0.04)] mt-4 max-w-[520px] transition-all",
      config.border,
      isPending && "shadow-[0_8px_30px_rgba(245,158,11,0.08)]",
      className
    )}>
      {/* Header */}
      <div className="px-6 pt-6 pb-5 border-b border-border/60">
        <div className="flex items-center gap-3">
          <div className={cn("p-2 rounded-xl border", config.bg, config.iconBg, config.border)}>
            <Shield className={cn("w-5 h-5", config.text)} />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-[15px] font-bold text-foreground truncate">{toolName}</h4>
            <p className="text-[10px] text-muted-foreground font-mono mt-0.5">ID: {requestId}</p>
          </div>
          <div className={cn(
            "flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold border uppercase",
            config.bg, config.border, config.text
          )}>
            {config.icon}
            {config.label}
          </div>
        </div>
      </div>

      {/* Description */}
      <div className="px-6 py-5">
        <p className="text-[13px] text-muted-foreground leading-relaxed font-medium">{description}</p>

        {path && (
          <div className="mt-3 space-y-2">
            <p className="break-all rounded-md bg-muted px-2 py-1 font-mono text-xs">{path}</p>
            {(edits.length > 0 || proposedText !== undefined) && (
              <details>
                <summary className="cursor-pointer text-xs font-medium text-foreground">
                  {t('chat.run_approval.preview')}
                </summary>
                <div className="mt-2 max-h-48 overflow-auto rounded-md border border-border bg-muted/30 text-xs">
                  {proposedText !== undefined
                    ? <pre className="whitespace-pre-wrap break-all p-2">{proposedText}</pre>
                    : edits.map((edit, index) => (
                      <div key={index} className="border-b border-border last:border-b-0">
                        <pre className="whitespace-pre-wrap break-all bg-destructive/10 p-2 text-destructive">{edit.old_string.split('\n').map(line => `- ${line}`).join('\n')}</pre>
                        <pre className="whitespace-pre-wrap break-all bg-primary/5 p-2 text-foreground">{edit.new_string.split('\n').map(line => `+ ${line}`).join('\n')}</pre>
                      </div>
                    ))}
                </div>
              </details>
            )}
          </div>
        )}

        {/* Args */}
        {args && Object.keys(args).length > 0 && (
          <details className="mt-4 group/details">
            <summary className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors">
              {t('approval.view_args', 'View Parameters')}
            </summary>
            <pre className="mt-2 p-3 bg-muted rounded-[12px] border border-border/60 text-[11px] font-mono text-muted-foreground overflow-auto max-h-32">
              {JSON.stringify(args, null, 2)}
            </pre>
          </details>
        )}
      </div>

      {/* Actions */}
      {isPending && (
        <div className="px-6 pb-6 pt-4 border-t border-border/60">
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="w-4 h-4 text-[#F59E0B] shrink-0" />
            <span className="text-[12px] text-muted-foreground font-medium flex-1">
              {t('approval.confirm_message', 'Confirm this action?')}
            </span>
          </div>
          {responseError && <p role="alert" className="mb-3 text-xs text-destructive">{t('chat.run_approval.error')}</p>}
          <div className="flex gap-3">
            <button
              type="button"
              disabled={submitting}
              onClick={onReject}
              className="flex-1 disabled:cursor-not-allowed disabled:opacity-50 py-3 rounded-[12px] bg-muted hover:bg-border text-muted-foreground text-[12px] font-bold transition-all border border-border flex items-center justify-center gap-2"
            >
              <X className="w-3.5 h-3.5" />
              {t('approval.reject', 'Reject')}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={onApprove}
              className="flex-1 disabled:cursor-not-allowed disabled:opacity-50 py-3 rounded-[12px] bg-gradient-to-br from-[#a33800] to-[#cc4900] hover:from-[#c24200] hover:to-[#e65200] text-white text-[12px] font-bold transition-all border border-transparent flex items-center justify-center gap-2 shadow-[0_4px_14px_rgba(204,73,0,0.3)]"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              {approveLabel ?? t('approval.approve', 'Approve')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
