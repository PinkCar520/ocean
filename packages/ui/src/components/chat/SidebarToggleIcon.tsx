export function SidebarToggleIcon({ side, expanded }: { side: 'left' | 'right'; expanded: boolean }) {
  const left = side === 'left';

  return (
    <svg aria-hidden="true" className="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      {expanded && <rect x={left ? 3 : 15} y="4" width="6" height="16" rx="1" fill="currentColor" fillOpacity="0.38" stroke="none" />}
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d={left ? 'M9 4v16' : 'M15 4v16'} />
    </svg>
  );
}
