import { Bug, User, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/utils';

type BugCardProps = {
  bugId: string;
  title: string;
  status: 'active' | 'resolved' | 'closed';
  assignee: string;
  severity: 'high' | 'medium' | 'low';
  createdAt?: string;
  description?: string;
};

export function BugCard({
  bugId,
  title,
  status,
  assignee,
  severity,
  description,
}: BugCardProps) {
  const { t } = useTranslation();
  
  const severityColors = {
    high: 'text-rose-600 border-rose-200 bg-rose-50',
    medium: 'text-amber-600 border-amber-200 bg-amber-50',
    low: 'text-emerald-600 border-emerald-200 bg-emerald-50',
  };

  const statusIcons = {
    active: <Clock className="w-3.5 h-3.5 text-rose-500" />,
    resolved: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />,
    closed: <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />,
  };

  return (
    <div className="group relative bg-white border border-slate-200 rounded-2xl p-5 transition-all hover:border-blue-300 overflow-hidden">
      
      {/* 顶部 ID 与 状态 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="bg-blue-50 p-1.5 rounded-lg border border-blue-100">
            <Bug className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">{bugId}</span>
        </div>
        <div className={cn(
          "flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold border uppercase tracking-tight",
          severityColors[severity]
        )}>
          <AlertTriangle className="w-3 h-3" />
          {t(`bug.severity.${severity}`)}
        </div>
      </div>

      {/* 标题 */}
      <h3 className="text-[14px] font-bold text-slate-800 mb-3 leading-snug group-hover:text-blue-600 transition-colors line-clamp-2">
        {title}
      </h3>

      {/* 描述摘要 */}
      {description && (
        <p className="text-[12px] text-slate-500 line-clamp-2 mb-4 leading-relaxed font-medium bg-slate-50 p-2.5 rounded-xl border border-slate-100/50">
          {description}
        </p>
      )}

      {/* 底部元数据 */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200">
            <User className="w-3.5 h-3.5 text-slate-500" />
          </div>
          <span className="text-[11px] font-bold text-slate-600">{assignee}</span>
        </div>
        <div className="flex items-center gap-2">
          {statusIcons[status]}
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-tighter">{t(`bug.status.${status}`)}</span>
        </div>
      </div>
    </div>
  );
}
