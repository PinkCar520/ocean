import { Play, CheckCircle2, CircleDot, XCircle, Clock, ExternalLink, Terminal } from 'lucide-react';
import { cn } from '../lib/utils';
import { useTranslation } from 'react-i18next';
import type { UIPipelineCardProps, UIStep } from '../types/ui-protocol';

export type { UIPipelineCardProps };

export interface PipelineCardProps extends UIPipelineCardProps {
  onViewLogs?: (pipelineId: string) => void;
  onRetry?: (pipelineId: string) => void;
}

interface StatusStyle {
  text: string;
  bg: string;
  border: string;
  icon: React.ComponentType<{ className?: string }>;
}

export function PipelineCard({
  id,
  name,
  branch,
  status,
  steps,
  startTime,
  onViewLogs,
  onRetry,
}: PipelineCardProps) {
  const { t } = useTranslation();

  const statusStyles: Record<string, StatusStyle> = {
    success: { text: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100', icon: CheckCircle2 },
    running: { text: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100', icon: CircleDot },
    failed: { text: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-100', icon: XCircle },
    paused: { text: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-100', icon: Clock },
  };

  const currentStatus = statusStyles[status];

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 mt-3 max-w-2xl overflow-hidden group">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className={cn("p-2 rounded-2xl", currentStatus.bg)}>
            <currentStatus.icon className={cn("w-5 h-5", currentStatus.text)} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-slate-900">{name}</h4>
              <span className="text-[10px] font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">#{id}</span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium flex items-center gap-1 mt-0.5">
              <Terminal className="w-3 h-3" />
              {branch} • {startTime}
            </p>
          </div>
        </div>
        {onViewLogs && (
          <button
            onClick={() => onViewLogs(id)}
            className="p-2 hover:bg-slate-50 rounded-xl transition-colors text-slate-400 hover:text-blue-500"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Steps Flow */}
      <div className="space-y-4 relative">
        <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-slate-100" />

        {steps.map((step: UIStep, i: number) => (
          <div key={i} className="flex items-center justify-between relative pl-8">
            <div className={cn(
              "absolute left-0 w-6 h-6 rounded-full border-2 bg-white flex items-center justify-center z-10",
              step.status === 'success' ? "border-emerald-500" :
              step.status === 'running' ? "border-blue-500 animate-pulse" :
              step.status === 'failed' ? "border-rose-500" : "border-slate-200"
            )}>
              {step.status === 'success' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
              {step.status === 'running' && <CircleDot className="w-3.5 h-3.5 text-blue-500" />}
              {step.status === 'failed' && <XCircle className="w-3.5 h-3.5 text-rose-500" />}
              {step.status === 'waiting' && <div className="w-1.5 h-1.5 rounded-full bg-slate-200" />}
            </div>

            <div className="flex-1">
              <span className={cn(
                "text-[13px] font-bold",
                step.status === 'running' ? "text-blue-600" : "text-slate-700"
              )}>
                {step.name}
              </span>
            </div>

            {step.duration && (
              <span className="text-[11px] font-mono text-slate-400 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-100">
                {step.duration}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Footer Actions */}
      <div className="mt-8 pt-6 border-t border-slate-100 flex gap-3">
        <button
          onClick={() => onViewLogs?.(id)}
          disabled={!onViewLogs}
          className={cn(
            "flex-1 py-2 rounded-xl border text-[11px] font-bold transition-all uppercase tracking-widest",
            onViewLogs
              ? "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
              : "bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed"
          )}
        >
          {t('pipeline.view_logs', 'View Logs')}
        </button>
        {status === 'failed' && (
          <button
            onClick={() => onRetry?.(id)}
            disabled={!onRetry}
            className={cn(
              "flex-1 py-2 rounded-xl text-white text-[11px] font-bold transition-all uppercase tracking-widest",
              onRetry
                ? "bg-blue-600 hover:bg-blue-700"
                : "bg-slate-300 cursor-not-allowed"
            )}
          >
            {t('pipeline.retry_build', 'Retry Build')}
          </button>
        )}
      </div>
    </div>
  );
}
