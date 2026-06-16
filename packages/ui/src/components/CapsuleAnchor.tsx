import React from 'react';
import { cn } from '../lib/utils';
import type { UIComponentType } from '../types/ui-protocol';
import {
  Bug, ListChecks, GitBranch, ListTodo, ShieldCheck,
  ClipboardList, CalendarDays, GitCompare, Printer, BarChart3, Code, Pill
} from 'lucide-react';

// Capsule 标签映射：uiType → 显示文案 + Lucide 图标组件
const CAPSULE_META: Record<string, { label: string; icon: React.ElementType }> = {
  bug_card:        { label: '缺陷详情',   icon: Bug },
  bug_list:        { label: '缺陷列表',   icon: ListChecks },
  pipeline_card:   { label: '流水线状态', icon: GitBranch },
  task_plan:       { label: '任务计划',   icon: ListTodo },
  approval_card:   { label: '审批请求',   icon: ShieldCheck },
  zentao_task_card:{ label: '禅道任务',   icon: ClipboardList },
  leave_request_form: { label: '请假申请', icon: CalendarDays },
  diff_viewer:     { label: '代码差异',   icon: GitCompare },
  print_console:   { label: '打印控制台', icon: Printer },
  stats_card:      { label: '统计数据',   icon: BarChart3 },
  code_block:      { label: '代码片段',   icon: Code },
};

interface CapsuleAnchorProps {
  uiType: UIComponentType | string;
  isActive: boolean;
  onClick: () => void;
  /** Optional override for the display label */
  label?: string;
  /** Full-width card mode to match Thinking Process style */
  asCard?: boolean;
}

export const CapsuleAnchor: React.FC<CapsuleAnchorProps> = ({
  uiType,
  isActive,
  onClick,
  label: labelOverride,
  asCard = true,
}) => {
  const meta = CAPSULE_META[uiType] ?? { label: '交互结果', icon: Pill };
  const label = labelOverride ?? meta.label;
  const IconComponent = meta.icon;

  if (asCard) {
    return (
      <button
        onClick={onClick}
        className={cn(
          'w-full flex items-center gap-3 px-5 py-3.5 rounded-[20px] text-[13px] font-semibold',
          'transition-all duration-200 cursor-pointer select-none',
          'border bg-card',
          isActive
            ? 'border-primary/30 shadow-[0_0_8px_rgba(236,91,20,0.1)] text-primary'
            : 'border-border/60 text-muted-foreground hover:bg-primary/[0.03] hover:border-primary/20 hover:text-primary'
        )}
      >
        <IconComponent className="w-4 h-4 shrink-0" />
        <span className="tracking-tight">{label}</span>
        {isActive && (
          <span className="ml-auto text-[10px] font-medium text-primary">
            已展开
          </span>
        )}
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold',
        'transition-all duration-200 cursor-pointer select-none',
        'border shadow-sm',
        isActive
          ? 'bg-primary/10 border-primary/30 text-primary shadow-[0_0_8px_rgba(236,91,20,0.15)]'
          : 'bg-muted/80 border-border/60 text-muted-foreground hover:bg-primary/5 hover:border-primary/20 hover:text-primary'
      )}
      title={`点击查看${label}`}
    >
      <IconComponent className="w-3.5 h-3.5" />
      <span className="tracking-tight">{label}</span>
    </button>
  );
};
