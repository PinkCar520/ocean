import React, { useState } from 'react';
import { ChevronRight, Terminal, Check, Loader2, Wrench } from 'lucide-react';
import { cn } from '../../lib/utils';
import { getFriendlyToolName } from '../../lib/chat-utils';

interface ToolAccordionProps {
  part: any;
  t: any;
  getLocalizedName: any;
  isStreaming?: boolean;
  onOpenSidebar?: (content: string, fileName: string) => void;
}

export function ToolAccordion({
  part,
  t,
  getLocalizedName,
  isStreaming,
  onOpenSidebar
}: ToolAccordionProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const rawToolName = part.toolName || part.type?.replace('tool-', '') || 'unknown';
  const toolDisplayName = getFriendlyToolName(part, t, getLocalizedName);
  const isCompleted = !!(part.output || part.result);
  const isSkillActivation = rawToolName === 'activate_skill';
  const result = part.result || part.output;
  const args = part.args || part.toolInvocation?.args;

  // Auto-expand while streaming if it's not completed
  const showExpanded = isExpanded || (!isCompleted && isStreaming);

  const handleDetailsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSkillActivation && isCompleted && result?.skill_content && onOpenSidebar) {
      const fileName = `${args?.skill_name || 'Skill'}.md`;
      onOpenSidebar(result.skill_content, fileName);
    }
  };

  return (
    <div className="my-3 flex flex-col items-start w-full">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground/80 hover:text-foreground transition-colors group select-none"
      >
        <span>{toolDisplayName}</span>
        <ChevronRight 
          className={cn(
            "w-3.5 h-3.5 transition-transform duration-200 text-muted-foreground/50 group-hover:text-foreground",
            showExpanded && "rotate-90"
          )} 
        />
      </button>

      {showExpanded && (
        <div className="mt-2 ml-1 pl-3 border-l-2 border-border/50 flex flex-col gap-2 relative overflow-hidden">
          <div 
            onClick={handleDetailsClick}
            className={cn(
              "flex items-center gap-2 py-1 px-2 -ml-2 rounded-lg transition-colors w-fit",
              (isSkillActivation && isCompleted && result?.skill_content) && "cursor-pointer hover:bg-muted/50 group/detail"
            )}
          >
            <div className="w-5 h-5 flex items-center justify-center shrink-0 bg-muted rounded-md border border-border/50 text-muted-foreground">
              {isSkillActivation ? <Terminal className="w-3 h-3" /> : <Wrench className="w-3 h-3" />}
            </div>
            <span className="text-[13px] text-foreground/90 font-medium">{toolDisplayName}</span>
            {isSkillActivation && isCompleted && result?.skill_content && (
              <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-[1px] rounded uppercase font-bold tracking-tight opacity-0 group-hover/detail:opacity-100 transition-opacity ml-1">
                View
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 py-0.5 px-2 -ml-2">
            <div className="w-5 h-5 flex items-center justify-center shrink-0">
              {isCompleted ? (
                <Check className="w-3.5 h-3.5 text-primary" strokeWidth={3} />
              ) : (
                <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" strokeWidth={2.5} />
              )}
            </div>
            <span className={cn(
              "text-[13px]",
              isCompleted ? "text-primary/90 font-medium" : "text-primary font-medium"
            )}>
              {isCompleted ? "Done" : "Running..."}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
