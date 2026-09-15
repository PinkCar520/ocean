'use client';

import { useEffect, useState } from 'react';
import { authFetch } from '../lib/api-client';

export interface ArtifactMeta {
  runId: string;
  artifactId: string;
  name: string;
  uri?: string;
  contentType?: string;
}

/**
 * ArtifactViewer —— Phase 6 6f：统一 Artifact 查看器。
 * 通过 `/api/runs/:id/artifacts/:artifactId` 拉取产物内容，
 * 按 content-type 渲染（文本 / JSON / 图片 / 其他=下载）。
 */
export function ArtifactViewer({ runId, artifactId, name, contentType }: ArtifactMeta) {
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [content, setContent] = useState<string | null>(null);
  const [isImage, setIsImage] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    const url = `/api/runs/${runId}/artifacts/${artifactId}`;
    authFetch(url, { headers: { Accept: 'text/plain' } })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = await res.text();
        setContent(raw);
        setIsImage(!!contentType?.startsWith('image/'));
        setState('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[Artifact] load failed:', err);
        setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [runId, artifactId, contentType]);

  const isJson = contentType?.includes('json') || name.endsWith('.json');
  const isText = contentType?.startsWith('text/') || !contentType || !isJson;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-1.5">
        <span className="text-xs font-medium text-foreground truncate">{name}</span>
        <a
          href={`/api/runs/${runId}/artifacts/${artifactId}`}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 text-xs text-primary hover:underline"
        >
          打开
        </a>
      </div>
      <div className="p-3">
        {state === 'loading' && <p className="text-xs text-muted-foreground">加载产物…</p>}
        {state === 'error' && <p className="text-xs text-destructive">产物加载失败</p>}
        {state === 'ready' && isImage && content && (
          <img src={content} alt={name} className="max-h-64 w-auto rounded" />
        )}
        {state === 'ready' && !isImage && content && (
          <pre className={`max-h-64 overflow-auto text-xs leading-relaxed ${isJson ? 'text-emerald-700' : 'text-foreground'}`}>
            {isJson ? (() => {
              try { return JSON.stringify(JSON.parse(content), null, 2); } catch { return content; }
            })() : content}
          </pre>
        )}
      </div>
    </div>
  );
}
