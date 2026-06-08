import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { cn } from '../lib/utils';
import type { UIStatsCardProps, UIStatsMetric } from '../types/ui-protocol';

export type { UIStatsCardProps, UIStatsMetric };

export interface StatsCardProps {
  title: UIStatsCardProps['title'];
  metrics: UIStatsCardProps['metrics'];
}

const TrendIcons = {
  up: <ArrowUp className="w-3 h-3 text-emerald-500" />,
  down: <ArrowDown className="w-3 h-3 text-rose-500" />,
  neutral: <Minus className="w-3 h-3 text-slate-400" />,
};

export function StatsCard({ title, metrics }: StatsCardProps) {
  const cols = metrics.length <= 2 ? 'grid-cols-2' : metrics.length === 3 ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4';

  return (
    <div className="my-3 bg-white border border-slate-200 rounded-2xl p-5 overflow-hidden">
      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">{title}</h4>
      <div className={cn("grid gap-4", cols)}>
        {metrics.map((metric: UIStatsMetric, _i: number) => (
          <div key={metric.label} className="flex flex-col items-center text-center p-3 rounded-xl bg-slate-50 border border-slate-100">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">{metric.label}</span>
            <span className="text-2xl font-extrabold text-slate-800">{metric.value}</span>
            {metric.trend && (
              <div className="flex items-center gap-1 mt-1">
                {TrendIcons[metric.trend]}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
