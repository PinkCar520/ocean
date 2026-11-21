import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';

interface ThumbnailMessage {
  role: string;
  content?: unknown;
  parts?: readonly { type: string; text?: string }[];
}

interface Turn {
  index: number;
  prompt: string;
  reply: string;
}

interface Props {
  scrollRef: RefObject<HTMLDivElement | null>;
  messages: readonly ThumbnailMessage[];
  reducedMotion: boolean;
  label: string;
  emptyPrompt: string;
}

function messageExcerpt(message: ThumbnailMessage, limit: number) {
  const text = message.parts
    ?.filter(part => part.type === 'text')
    .map(part => part.text)
    .join(' ') || (typeof message.content === 'string' ? message.content : '');
  const excerpt = text.replace(/\s+/g, ' ').trim();
  return excerpt.length > limit ? excerpt.slice(0, limit) + '…' : excerpt;
}

export function ConversationThumbnails({ scrollRef, messages, reducedMotion, label, emptyPrompt }: Props) {
  const turns = useMemo(() => {
    const result: Turn[] = [];
    for (const [index, message] of messages.entries()) {
      if (message.role === 'user') {
        result.push({ index, prompt: messageExcerpt(message, 180), reply: '' });
      } else if (message.role === 'assistant') {
        const turn = result.at(-1);
        if (!turn || turn.reply.length >= 360) continue;
        const reply = messageExcerpt(message, 360);
        if (reply) turn.reply = [turn.reply, reply].filter(Boolean).join(' ').slice(0, 360);
      }
    }
    return result;
  }, [messages]);

  const [layout, setLayout] = useState({ height: 0, visible: false, active: -1 });
  const [preview, setPreview] = useState<{ index: number; center: number } | null>(null);
  const railRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const anchors = Array.from(scroller.querySelectorAll<HTMLElement>('[data-conversation-turn]'));
    const measure = () => {
      const height = scroller.clientHeight;
      const visible = scroller.clientWidth >= 960 && scroller.scrollHeight > height + 1;
      let active = -1;
      if (visible && scroller.scrollHeight - height - scroller.scrollTop <= 1) {
        active = Number(anchors.at(-1)?.dataset.conversationTurn ?? -1);
      } else if (visible && anchors.length) {
        const readingLine = scroller.getBoundingClientRect().top + 32;
        let low = 0;
        let high = anchors.length;
        while (low < high) {
          const middle = Math.floor((low + high) / 2);
          if (anchors[middle].getBoundingClientRect().top <= readingLine) low = middle + 1;
          else high = middle;
        }
        active = Number(anchors[Math.max(0, low - 1)].dataset.conversationTurn);
      }
      setLayout(previous => previous.height === height && previous.visible === visible && previous.active === active
        ? previous : { height, visible, active });
      if (!visible) setPreview(null);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    const content = scroller.querySelector('[data-conversation-content]');
    if (content) observer.observe(content);
    scroller.addEventListener('scroll', measure, { passive: true });
    return () => {
      observer.disconnect();
      scroller.removeEventListener('scroll', measure);
    };
  }, [scrollRef, turns]);

  const jump = (index: number) => {
    const scroller = scrollRef.current;
    const anchor = scroller?.querySelector<HTMLElement>(`[data-conversation-turn="${index}"]`);
    if (!scroller || !anchor) return;
    scroller.scrollTo({
      top: scroller.scrollTop + anchor.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 16,
      behavior: reducedMotion ? 'instant' : 'smooth',
    });
    setPreview(null);
  };

  if (!layout.visible || turns.length === 0) return null;
  const selected = turns.find(turn => turn.index === preview?.index);

  return (
    <nav
      aria-label={label}
      className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center"
      style={{ height: layout.height }}
      onMouseLeave={() => setPreview(null)}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPreview(null);
      }}
      onKeyDown={event => {
        if (event.key === 'Escape') setPreview(null);
      }}
    >
      <div
        ref={railRef}
        className="pointer-events-auto ml-2 flex max-h-[85%] w-9 flex-col overflow-y-auto overscroll-contain [scrollbar-width:none]"
        onScroll={() => setPreview(null)}
      >
        {turns.map((turn, position) => {
          const active = layout.active === turn.index;
          const showPreview = (button: HTMLButtonElement) => {
            const nav = railRef.current?.parentElement;
            if (!nav) return;
            const rect = button.getBoundingClientRect();
            setPreview({ index: turn.index, center: rect.top + rect.height / 2 - nav.getBoundingClientRect().top });
          };
          return (
            <button
              key={turn.index}
              type="button"
              aria-current={active ? 'location' : undefined}
              aria-label={`${position + 1}. ${turn.prompt || emptyPrompt}`}
              className="group flex h-5 shrink-0 cursor-pointer items-center pl-2 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2"
              onMouseEnter={event => showPreview(event.currentTarget)}
              onFocus={event => showPreview(event.currentTarget)}
              onClick={() => jump(turn.index)}
            >
              <span aria-hidden="true" className={active || selected === turn
                ? 'h-0.5 w-6 rounded-full bg-foreground'
                : 'h-0.5 w-2 rounded-full bg-foreground/25 group-hover:bg-foreground/70'} />
            </button>
          );
        })}
      </div>
      {selected && preview && (
        <button
          type="button"
          className="pointer-events-auto absolute left-11 w-72 cursor-pointer rounded-xl border border-border bg-card p-3 text-left text-sm text-card-foreground shadow-lg"
          style={{ top: Math.max(4, Math.min(preview.center - 44, layout.height - 124)) }}
          onClick={() => jump(selected.index)}
        >
          <span className="block truncate font-medium">{selected.prompt || emptyPrompt}</span>
          {selected.reply && <span className="mt-1 line-clamp-3 break-words text-muted-foreground">{selected.reply}</span>}
        </button>
      )}
    </nav>
  );
}
