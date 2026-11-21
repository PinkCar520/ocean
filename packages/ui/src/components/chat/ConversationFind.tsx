import { useEffect, useRef, useState, type RefObject } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const matchesHighlight = 'ocean-conversation-matches';
const activeHighlight = 'ocean-conversation-match';

function findMatches(container: HTMLElement, query: string): Range[] {
  if (!query) return [];
  const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu');
  const ranges: Range[] = [];
  for (const body of container.querySelectorAll('[data-conversation-text]')) {
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    const blocks = new Map<Element, Text[]>();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || parent.closest('button, [hidden], [aria-hidden="true"]') || !parent.getClientRects().length) continue;
      if (parent.closest('[data-conversation-ignore]')) continue;
      const block = parent.closest('pre, p, li, td, th, h1, h2, h3, h4, h5, h6') ?? body;
      const nodes = blocks.get(block) ?? [];
      nodes.push(node as Text);
      blocks.set(block, nodes);
    }
    for (const nodes of blocks.values()) {
      const text = nodes.map(node => node.data).join('');
      for (const match of text.matchAll(pattern)) {
        const start = match.index;
        const end = start + match[0].length;
        const range = document.createRange();
        let offset = 0;
        for (const node of nodes) {
          const next = offset + node.length;
          if (start >= offset && start < next) range.setStart(node, start - offset);
          if (end > offset && end <= next) {
            range.setEnd(node, end - offset);
            break;
          }
          offset = next;
        }
        ranges.push(range);
      }
    }
  }
  return ranges.sort((left, right) => left.compareBoundaryPoints(Range.START_TO_START, right));
}

export function ConversationFind({
  scrollRef,
  open,
  focusRequest,
  belowHeader,
  close,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  open: boolean;
  focusRequest: number;
  belowHeader: boolean;
  close: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [composition, setComposition] = useState(false);
  const [position, setPosition] = useState({ index: 0, count: 0 });
  const inputRef = useRef<HTMLInputElement>(null);
  const rangesRef = useRef<Range[]>([]);
  const indexRef = useRef(0);

  function show(index: number, scroll: boolean) {
    const ranges = rangesRef.current;
    indexRef.current = index;
    setPosition({ index, count: ranges.length });
    const match = ranges[index];
    if (typeof Highlight !== 'undefined') {
      CSS.highlights.set(activeHighlight, new Highlight(...(match ? [match] : [])));
    }
    const container = scrollRef.current;
    const rect = match?.getBoundingClientRect();
    if (scroll && container && rect) {
      const viewport = container.getBoundingClientRect();
      container.scrollTo({ top: container.scrollTop + rect.top - viewport.top - viewport.height / 3, behavior: 'instant' });
    }
  }

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [open, focusRequest]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!open || !container || composition) return;
    let frame = 0;
    const refresh = (initial: boolean) => {
      const matches = findMatches(container, query.trim());
      rangesRef.current = matches;
      if (typeof Highlight !== 'undefined') {
        CSS.highlights.set(matchesHighlight, new Highlight(...matches));
      }
      show(initial ? 0 : Math.max(0, Math.min(indexRef.current, matches.length - 1)), initial);
    };
    refresh(true);
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => refresh(false));
    });
    observer.observe(container, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden', 'open'] });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      CSS.highlights?.delete(matchesHighlight);
      CSS.highlights?.delete(activeHighlight);
    };
  }, [open, query, composition, scrollRef]);

  if (!open) return null;

  function move(delta: number) {
    const count = rangesRef.current.length;
    if (count) show((indexRef.current + delta + count) % count, true);
    inputRef.current?.focus({ preventScroll: true });
  }

  const label = t('chat.find.label', 'Find in conversation');
  const previous = t('chat.find.previous', 'Previous match');
  const next = t('chat.find.next', 'Next match');
  const dismiss = t('chat.find.close', 'Close find');
  const buttonClass = 'grid size-8 shrink-0 place-items-center rounded-md hover:bg-muted disabled:opacity-40';
  return (
    <div role="search" aria-label={label} className={`titlebar-no-drag pointer-events-auto absolute right-4 ${belowHeader ? 'top-3' : 'top-16'} z-30 flex max-w-[calc(100%-2rem)] items-center gap-1 rounded-xl border border-border bg-background p-1.5 text-foreground shadow-lg`}>
      <input
        ref={inputRef}
        type="text"
        aria-label={label}
        placeholder={label}
        value={query}
        onChange={event => setQuery(event.target.value)}
        onCompositionStart={() => setComposition(true)}
        onCompositionEnd={() => setComposition(false)}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Enter') {
            event.preventDefault();
            move(event.shiftKey ? -1 : 1);
          }
        }}
        className="h-8 w-44 min-w-0 rounded-md bg-muted px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
      />
      <span aria-live="polite" className="min-w-10 px-1 text-center text-xs tabular-nums text-muted-foreground">
        {position.count ? position.index + 1 : 0}/{position.count}
      </span>
      <button type="button" title={previous} aria-label={previous} disabled={!position.count} className={buttonClass} onClick={() => move(-1)}><ChevronUp size={16} /></button>
      <button type="button" title={next} aria-label={next} disabled={!position.count} className={buttonClass} onClick={() => move(1)}><ChevronDown size={16} /></button>
      <button type="button" title={dismiss} aria-label={dismiss} className={buttonClass} onClick={close}><X size={16} /></button>
    </div>
  );
}
