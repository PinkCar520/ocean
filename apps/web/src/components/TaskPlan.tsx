import { ClipboardList, Info, Check, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { useTranslation } from 'react-i18next';
import type { UITaskPlanProps, UITaskStep } from '../types/ui-protocol';

export type { UITaskPlanProps };

export interface TaskPlanProps {
  title: UITaskPlanProps['title'];
  steps: UITaskPlanProps['steps'];
  onConfirm?: () => void;
  onCancel?: () => void;
}

export function TaskPlan({ title, steps, onConfirm, onCancel }: TaskPlanProps) {
  const { t } = useTranslation();

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 mt-4 max-w-2xl overflow-hidden group">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2.5 rounded-2xl bg-blue-50 border border-blue-100">
          <ClipboardList className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h4 className="text-[11px] font-bold text-blue-500 uppercase tracking-[0.2em] mb-0.5">
            {t('task_plan.proposed_strategy', 'Proposed Strategy')}
          </h4>
          <h3 className="text-sm font-bold text-slate-900 tracking-tight">{title}</h3>
        </div>
      </div>

      {/* Steps List */}
      <div className="space-y-4 mb-8">
        {steps.map((step: UITaskStep, i: number) => (
          <div key={i} className="flex gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100 hover:border-blue-200 transition-all hover:bg-blue-50/50">
            <div className="w-6 h-6 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
               <span className="text-[10px] font-bold text-blue-600">{i + 1}</span>
            </div>
            <div className="space-y-1.5 flex-1">
               <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                    {step.tool}
                  </span>
               </div>
               <p className="text-xs font-bold text-slate-800">{step.label}</p>
               <p className="text-[11px] text-slate-500 leading-relaxed italic">{step.description}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Interactive Footer */}
      <div className="flex items-center justify-between pt-6 border-t border-slate-100">
        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
           <Info className="w-3.5 h-3.5" />
           {t('task_plan.awaiting_authorization', 'Awaiting Authorization')}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="px-5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-bold transition-all border border-slate-200 flex items-center gap-2"
          >
            <X className="w-3.5 h-3.5" />
            {t('task_plan.reject', 'Reject')}
          </button>
          <button
            onClick={onConfirm}
            className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold transition-all border border-blue-500 flex items-center gap-2"
          >
            <Check className="w-3.5 h-3.5" />
            {t('task_plan.confirm', 'Confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
