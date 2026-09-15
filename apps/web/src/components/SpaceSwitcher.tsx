'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@ocean/ui/lib/utils';

export interface SpaceOption {
  id: string;
  name: string;
  type: string;
  icon?: string | null;
  role?: string;
}

/**
 * SpaceSwitcher —— Phase 6：全局 Space 切换 + 当前身份提示。
 * 展示当前 Space 徽标；点击展开菜单在 Code / Work / Life 之间切换。
 * 生命周期：activeSpaceId 持久化于 localStorage；切换回调由父级处理数据刷新。
 */
export function SpaceSwitcher({
  spaces,
  activeSpaceId,
  onChange,
}: {
  spaces: SpaceOption[];
  activeSpaceId: string;
  onChange: (spaceId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const active = spaces.find((s) => s.id === activeSpaceId) ?? {
    id: activeSpaceId,
    name: activeSpaceId,
    type: 'work',
    icon: null,
  };

  const typeLabel: Record<string, string> = {
    work: 'Work',
    life: 'Life',
    code: 'Code',
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5',
          'text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground transition-colors',
        )}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span
          className={cn(
            'inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white',
            active.type === 'life' ? 'bg-emerald-500' : active.type === 'code' ? 'bg-sky-500' : 'bg-indigo-500',
          )}
        >
          {active.type === 'life' ? 'L' : active.type === 'code' ? 'C' : 'W'}
        </span>
        <span>{active.name}</span>
        <span className="text-xs text-muted-foreground">{typeLabel[active.type] ?? active.type}</span>
        <svg className="h-3 w-3 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-border bg-popover p-1 shadow-md">
          <p className="px-2 pb-1 pt-1.5 text-xs font-medium text-muted-foreground">切换空间</p>
          {spaces.map((space) => (
            <button
              key={space.id}
              type="button"
              onClick={() => {
                onChange(space.id);
                setOpen(false);
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                space.id === activeSpaceId
                  ? 'bg-accent text-accent-foreground'
                  : 'text-foreground hover:bg-accent/60',
              )}
            >
              <span
                className={cn(
                  'inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white',
                  space.type === 'life' ? 'bg-emerald-500' : space.type === 'code' ? 'bg-sky-500' : 'bg-indigo-500',
                )}
              >
                {space.type === 'life' ? 'L' : space.type === 'code' ? 'C' : 'W'}
              </span>
              <span className="flex-1 truncate">{space.name}</span>
              {space.role && <span className="text-xs text-muted-foreground">{space.role}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
