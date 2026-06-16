import { useState } from 'react';
import { Check, Loader2, Brain, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../lib/utils';
import type { ThinkingStep } from '../lib/chat-utils';

export interface ThinkingListProps {
  steps: ThinkingStep[];
}

export function ThinkingList({ steps }: ThinkingListProps) {
  const [collapsed, setCollapsed] = useState(false);
  // Filter out pending steps; they are not shown in the timeline
  const activeSteps = steps.filter(s => s.status !== 'pending');

  if (activeSteps.length === 0) return null;

  const isStreaming = activeSteps.some(s => s.status === 'active');

  return (
    <div className="my-2 p-5 bg-card rounded-[20px] border border-border">
      {/* Header */}
      <div className="flex items-center justify-between cursor-pointer select-none" onClick={() => !isStreaming && setCollapsed(c => !c)}>
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-primary" />
          <span className="text-[11px] font-bold text-primary uppercase tracking-[0.15em]">
            Thinking Process
          </span>
        </div>
        {!isStreaming && (
          <button
            onClick={(e) => { e.stopPropagation(); setCollapsed(c => !c); }}
            className="p-0.5 hover:bg-muted rounded"
            aria-label={collapsed ? 'Expand thinking process' : 'Collapse thinking process'}
          >
            {collapsed ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />}
          </button>
        )}
      </div>

      {/* Steps with timeline line */}
      {!collapsed && (
        <div className="relative ml-1.5 mt-3">
          {/* Vertical connecting line (visible only if >1 step) */}
          {activeSteps.length > 1 && (
            <div
              className="absolute left-[9px] top-2.5 bottom-2.5 w-px"
              style={{
                background: 'linear-gradient(to bottom, #EC5B14 0%, #EC5B14 60%, transparent 100%)',
              }}
            />
          )}

          <div className="space-y-3">
            {activeSteps.map((step, i) => (
              <div key={i} className="flex items-center gap-3 relative">
                {/* Icon */}
                <div className={cn(
                  "w-5 h-5 shrink-0 flex items-center justify-center rounded-full bg-background z-10",
                  step.status === 'done' && "border border-primary/30",
                )}>
                  {step.status === 'done' && (
                    <Check className="w-3 h-3 text-primary" strokeWidth={3} />
                  )}
                  {step.status === 'active' && (
                    <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" strokeWidth={2.5} />
                  )}
                </div>
                {/* Label */}
                <span className={cn(
                  "text-[13.5px]",
                  step.status === 'done' ? "text-[#5C5650]" : "text-[#A33800] font-medium"
                )}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
