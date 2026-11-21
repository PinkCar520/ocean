import { useEffect, useId, useRef, useState } from 'react';
import { CircleGauge, Database } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';

export interface SessionTokenUsage {
  context: {
    promptTokens: number;
    estimatedTokens: number;
    contextWindow: number | null;
    breakdown?: { systemTokens: number; toolTokens: number; messageTokens: number };
  } | null;
  totals: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheTrackedInputTokens: number;
    unknownCalls: number;
    measuredCalls: number;
  };
}

export function TokenUsageIndicators({ usage, t }: {
  usage: SessionTokenUsage | null;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const [open, setOpen] = useState<'context' | 'total'>();
  const root = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(undefined);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(undefined);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const context = usage?.context;
  const totals = usage?.totals;
  const format = (tokens: number) => tokens.toLocaleString();
  const compact = (tokens: number) => new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(tokens);
  const percent = (ratio: number) => new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 2 }).format(ratio);
  const ratio = context?.contextWindow ? context.estimatedTokens / context.contextWindow : undefined;
  const hasUsage = !!totals && totals.measuredCalls > 0;
  const total = totals ? totals.inputTokens + totals.outputTokens : 0;
  const hasCache = hasUsage && totals.cacheTrackedInputTokens === totals.inputTokens;
  const rate = hasCache && totals.inputTokens > 0 ? percent(totals.cacheReadTokens / totals.inputTokens) : '—';
  const details = context?.breakdown && [
    ['system_tokens', context.breakdown.systemTokens],
    ['tool_tokens', context.breakdown.toolTokens],
    ['message_tokens', context.breakdown.messageTokens],
  ] as const;
  const rows = open === 'context'
    ? details?.map(([key, value]) => [key, `~${format(value)}`])
    : [
        ['cache_hit', rate],
        ['uncached_input', hasCache ? format(totals.inputTokens - totals.cacheReadTokens) : '—'],
        ['cache_read', hasCache ? format(totals.cacheReadTokens) : '—'],
        ['output_tokens', hasUsage ? format(totals.outputTokens) : '—'],
      ];

  return (
    <div ref={root} className="relative mt-2 flex flex-wrap items-center gap-2 px-2 text-xs text-muted-foreground">
      {(['total', 'context'] as const).map((kind) => {
        const Icon = kind === 'context' ? CircleGauge : Database;
        const label = t(kind === 'context' ? 'chat.meta.context_usage' : 'chat.meta.session_usage');
        const value = kind === 'context'
          ? ratio !== undefined ? percent(ratio) : context ? `~${compact(context.estimatedTokens)} tok` : '—'
          : hasUsage ? `${compact(total)} tok` : '—';

        return (
          <div key={kind} className="relative">
            <Tooltip delayDuration={250}>
              <TooltipTrigger asChild>
                <button type="button" aria-expanded={open === kind} aria-controls={open === kind ? id : undefined}
                  onClick={() => setOpen(open === kind ? undefined : kind)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background px-2 py-1 hover:bg-muted focus-visible:outline focus-visible:outline-primary">
                  <Icon className="size-3.5" aria-hidden="true" />
                  <span className="sr-only">{label}</span>
                  <span className="tabular-nums">{value}</span>
                </button>
              </TooltipTrigger>
              {open !== kind && (
                <TooltipContent side="top" variant="inverse">
                  {t(kind === 'context' ? 'chat.meta.show_context_usage' : 'chat.meta.show_session_usage')}
                </TooltipContent>
              )}
            </Tooltip>
            {open === kind && (
              <section id={id} aria-label={label} className="absolute bottom-full left-0 z-40 mb-2 w-64 max-w-[calc(100vw-5rem)] rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-lg">
                <div className="flex justify-between gap-2 font-semibold">
                  <span>{label}</span>
                  <span className="tabular-nums">{kind === 'context'
                    ? context ? `~${compact(context.estimatedTokens)}${context.contextWindow ? ` / ${compact(context.contextWindow)}` : ''}` : '—'
                    : hasUsage ? `${format(total)} tok` : '—'}</span>
                </div>
                {kind === 'context' && ratio !== undefined && (
                  <progress aria-label={label} max={1} value={Math.min(1, ratio)}
                    className="mt-3 h-1.5 w-full overflow-hidden rounded-full accent-primary" />
                )}
                {rows ? (
                  <dl className="mt-2 space-y-1.5 border-t border-border pt-2">
                    {rows.map(([key, value]) => (
                      <div key={key} className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">{t(`chat.meta.${key}`)}</dt>
                        <dd className="font-mono tabular-nums">{value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="mt-2 text-muted-foreground">{t('chat.meta.breakdown_unavailable')}</p>
                )}
                {kind === 'total' && !!totals?.unknownCalls && (
                  <p className="mt-2 text-muted-foreground">{t('chat.meta.unknown_calls', { count: totals.unknownCalls })}</p>
                )}
              </section>
            )}
          </div>
        );
      })}
    </div>
  );
}
