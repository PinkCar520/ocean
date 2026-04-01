import { AlertCircle, CheckCircle2, User, Clock } from 'lucide-react';

export interface BugCardProps {
  bugId: string;
  title: string;
  status: 'active' | 'resolved' | 'closed';
  assignee: string;
  severity: 'high' | 'medium' | 'low';
  createdAt?: string;
  description?: string;
}

export function BugCard({ bugId, title, status, assignee, severity, createdAt, description }: BugCardProps) {
  const severityColors = {
    high: 'text-red-600 bg-red-50 border-red-100',
    medium: 'text-yellow-600 bg-yellow-50 border-yellow-100',
    low: 'text-green-600 bg-green-50 border-green-100',
  };

  const statusLabel = {
    active: 'Active',
    resolved: 'Resolved',
    closed: 'Closed',
  };

  return (
    <div className="w-full rounded-2xl border border-border bg-card p-4 shadow-sm transition-all hover:shadow-md">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center space-x-2">
          {status === 'active' ? (
            <AlertCircle className="w-5 h-5 text-red-500" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          )}
          <span className="text-xs font-mono text-muted-foreground">#{bugId}</span>
        </div>
        <span className={`px-2 py-1 rounded-full text-[10px] font-semibold border ${severityColors[severity]}`}>
          {severity.toUpperCase()}
        </span>
      </div>
      
      <h3 className="text-sm font-semibold text-foreground mb-4 line-clamp-2">
        {title}
      </h3>

      {description && (
        <p className="mb-4 text-xs leading-5 text-muted-foreground line-clamp-3">
          {description}
        </p>
      )}
      
      <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border pt-3">
        <div className="flex flex-col gap-2">
          <div className="flex items-center space-x-1 whitespace-nowrap">
            <User className="w-3 h-3" />
            <span>{assignee}</span>
          </div>
          {createdAt && (
            <div className="flex items-center space-x-1 whitespace-nowrap">
              <Clock className="w-3 h-3" />
              <span>{createdAt}</span>
            </div>
          )}
        </div>
        <span className="rounded-full border border-border bg-accent px-3 py-1.5 font-medium text-foreground">
          {statusLabel[status]}
        </span>
      </div>
    </div>
  );
}
