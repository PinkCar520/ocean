import React, { forwardRef, useEffect, useImperativeHandle, useState, useRef } from 'react';
import { cn } from '../../../lib/utils';

export interface MentionItem {
  id: string;
  label: string;
  desc?: string;
  type: string;
  icon: any;
}

interface MentionListProps {
  items: MentionItem[];
  command: (item: MentionItem) => void;
}

export const MentionList = forwardRef((props: MentionListProps, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelectedIndex(0);
  }, [props.items]);

  useEffect(() => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll<HTMLButtonElement>('[data-mention-item]');
    if (items[selectedIndex]) {
      items[selectedIndex].scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

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
    <div className="w-auto min-w-[300px] bg-card/95 backdrop-blur-xl border border-border shadow-[0_10px_40px_-10px_rgba(0,0,0,0.18)] rounded-xl overflow-hidden z-50 font-sans">
      <div className="px-3 py-2 border-b border-border/60 bg-muted/60 flex items-center justify-between">
        <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Add Context</span>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground/80">
          <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border font-mono text-[9px] text-muted-foreground">↑↓</kbd>
          <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border font-mono text-[9px] text-muted-foreground">↵</kbd>
        </div>
      </div>
      <div ref={listRef} className="p-1.5 max-h-64 overflow-y-auto no-scrollbar">
        {props.items.length > 0 ? props.items.map((opt, idx) => {
          const isActive = idx === selectedIndex;
          return (
            <button
              key={opt.id}
              data-mention-item
              onClick={() => selectItem(idx)}
              onMouseEnter={() => setSelectedIndex(idx)}
              className={cn(
                "flex items-center gap-3 w-full px-3 py-2.5 text-left rounded-lg transition-all duration-100 mb-0.5",
                isActive ? "bg-primary/8 ring-1 ring-primary/20" : ""
              )}
            >
              <div className="w-5 h-5 flex items-center justify-center shrink-0 transition-all">
                {opt.icon && <opt.icon className={cn("w-4 h-4", isActive ? "text-primary" : "text-muted-foreground")} />}
              </div>
              <span className="flex-1 truncate">
                <span className={cn("text-[13px] font-bold", isActive ? "text-primary" : "text-foreground")}>{opt.label}</span>
                <span className={cn("ml-2 text-[12px] font-normal", isActive ? "text-primary/60" : "text-muted-foreground/80")}>{opt.desc}</span>
              </span>
              {isActive && <span className="text-[10px] text-primary/50 font-medium shrink-0">↵</span>}
            </button>
          );
        }) : (
          <div className="px-3 py-4 text-center text-[13px] text-muted-foreground/80">No matches found</div>
        )}
      </div>
    </div>
  );
});

MentionList.displayName = 'MentionList';
