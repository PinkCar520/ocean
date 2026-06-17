import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { cn } from '../../../lib/utils';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '../../ui/tooltip';

export interface SlashItem {
  id: string;
  label: string;
  desc?: string;
  action: string;
  type: string;
  icon: any;
}

interface SlashListProps {
  items: SlashItem[];
  command: (item: SlashItem) => void;
}

export const SlashList = forwardRef((props: SlashListProps, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [props.items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === 'ArrowUp') {
        setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length);
        return true;
      }
      if (event.key === 'ArrowDown') {
        setSelectedIndex((selectedIndex + 1) % props.items.length);
        return true;
      }
      if (event.key === 'Enter') {
        selectItem(selectedIndex);
        return true;
      }
      return false;
    },
  }));

  const selectItem = (index: number) => {
    const item = props.items[index];
    if (item) {
      props.command(item);
    }
  };

  return (
    <TooltipProvider>
      <div className="w-56 bg-card/95 backdrop-blur-xl border border-border shadow-[0_10px_40px_-10px_rgba(0,0,0,0.18)] rounded-xl z-50 font-sans">
        <div className="px-3 py-2 border-b border-border/60 bg-muted/60 flex items-center justify-between rounded-t-xl">
          <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Commands</span>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground/80">
            <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border font-mono text-[9px] text-muted-foreground">↑↓</kbd>
            <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border font-mono text-[9px] text-muted-foreground">↵</kbd>
          </div>
        </div>
        <div className="p-1.5 max-h-64 overflow-y-auto">
          {props.items.length > 0 ? props.items.map((opt, idx) => {
            const isActive = idx === selectedIndex;
            const showSeparator = idx > 0 && props.items[idx - 1].type !== opt.type;
            return (
              <React.Fragment key={opt.id}>
                {showSeparator && <div className="h-px bg-border/80 my-1 mx-2" />}
                <Tooltip open={isActive && !!opt.desc}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => selectItem(idx)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={cn(
                        "flex items-center gap-3 w-full px-3 py-2.5 text-left rounded-lg transition-all duration-100 mb-0.5 relative group",
                        isActive ? "bg-primary/8 ring-1 ring-primary/20" : "hover:bg-muted"
                      )}
                    >
                      <div className="w-5 h-5 flex items-center justify-center shrink-0 transition-all">
                        {opt.icon && <opt.icon className={cn("w-4 h-4", isActive ? "text-primary" : "text-muted-foreground")} />}
                      </div>
                      <span className="flex-1 truncate">
                        <span className={cn("text-[13px] font-bold", isActive ? "text-primary" : "text-foreground")}>{opt.label}</span>
                      </span>
                      {isActive && <span className="text-[10px] text-primary/50 font-medium shrink-0 ml-2">↵</span>}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent
                    side="right"
                    sideOffset={12}
                    align="start"
                    className="w-[340px] bg-[#2D2D2D] text-[#E8E4E2] p-4 rounded-xl shadow-[0_20px_40px_-10px_rgba(0,0,0,0.4)] z-[60] text-[13px] leading-relaxed cursor-default whitespace-normal border border-white/10 pointer-events-none"
                  >
                    {opt.desc}
                  </TooltipContent>
                </Tooltip>
              </React.Fragment>
            );
          }) : (
            <div className="px-3 py-4 text-center text-[13px] text-muted-foreground/80">No commands found</div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
});

SlashList.displayName = 'SlashList';
