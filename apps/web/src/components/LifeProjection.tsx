'use client';

import { useEffect, useState } from 'react';
import { api } from '@ocean/ui/lib/api-client';
import { cn } from '@ocean/ui/lib/utils';

interface Memory {
  id: string;
  content: string;
  tags: string[];
  type: string;
  createdAt: string;
}

interface Grant {
  id: string;
  toSpace?: { id: string; name: string; slug: string } | null;
  purpose?: string | null;
  expiresAt?: string | null;
  createdAt: string;
}

interface Privacy {
  grants: Grant[];
  policies: Array<{ key: string; rules: unknown }>;
}

const TYPE_LABEL: Record<string, string> = {
  note: '笔记',
  reminder: '提醒',
  preference: '偏好',
  diary: '日记',
};

/**
 * LifeProjection —— Phase 6 6e：Life 空间投影（个人记忆 / 隐私控制）。
 * 数据归属本人 Life Space（life-<userId>），仅本人可见。
 */
export function LifeProjection({ token }: { token: string | null }) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [privacy, setPrivacy] = useState<Privacy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [mem, priv] = await Promise.all([
        api.get<any>('/api/life/memories'),
        api.get<any>('/api/life/privacy'),
      ]);
      setMemories(Array.isArray(mem?.data) ? mem.data : []);
      setPrivacy(Array.isArray(priv?.data) ? priv.data : null);
      setError(null);
    } catch (err) {
      console.error('[Life] failed to load projection:', err);
      setError('无法加载 Life 投影');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const addMemory = async () => {
    if (!content.trim()) return;
    setBusy(true);
    try {
      const tags = tagInput
        .split(/[,，\s]+/)
        .map((t) => t.trim())
        .filter(Boolean);
      await api.post<any>('/api/life/memories', { content: content.trim(), tags });
      setContent('');
      setTagInput('');
      await load();
    } catch (err) {
      console.error('[Life] add memory failed:', err);
    } finally {
      setBusy(false);
    }
  };

  const removeMemory = async (id: string) => {
    setBusy(true);
    try {
      await api.delete<any>(`/api/life/memories/${id}`);
      await load();
    } catch (err) {
      console.error('[Life] remove memory failed:', err);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-muted-foreground">加载 Life 投影…</div>;
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-xl font-bold text-foreground">生活空间</h1>
          <p className="text-sm text-muted-foreground">个人记忆、提醒与隐私控制（仅本人可见）</p>
        </div>

        {error && <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

        {/* 记忆输入 */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="记点什么…（私人记忆，仅自己可见）"
            rows={2}
            className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          />
          <div className="flex items-center gap-2">
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addMemory()}
              placeholder="标签，逗号分隔…"
              className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary"
            />
            <button
              type="button"
              disabled={busy || !content.trim()}
              onClick={addMemory}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              记录
            </button>
          </div>
        </div>

        {/* 记忆列表 */}
        <div className="space-y-2">
          {memories.length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              还没有个人记忆。写下第一条笔记或提醒。
            </div>
          )}
          {memories.map((memory) => (
            <div key={memory.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {TYPE_LABEL[memory.type] ?? memory.type}
                  </span>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm text-foreground">{memory.content}</p>
                  {memory.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {memory.tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-700">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => removeMemory(memory.id)}
                  className="shrink-0 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* 隐私控制 */}
        {privacy && (
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm font-semibold text-foreground">隐私与授权</p>
            <p className="text-xs text-muted-foreground">当前 Life 空间对外的数据授权与策略</p>
            {privacy.grants.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">暂无对外授权——你的私人数据默认不共享。</p>
            ) : (
              <div className="mt-3 space-y-2">
                {privacy.grants.map((grant) => (
                  <div key={grant.id} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                    <div>
                      <p className="text-sm text-foreground">
                        授权给 <span className="font-medium">{grant.toSpace?.name ?? grant.toSpace?.id}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">{grant.purpose || '数据共享'}</p>
                    </div>
                    {grant.expiresAt && (
                      <span className="text-xs text-amber-600">到期 {new Date(grant.expiresAt).toLocaleDateString()}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
            {privacy.policies.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3">
                {privacy.policies.map((policy) => (
                  <span key={policy.key} className={cn('rounded-full px-2 py-0.5 text-xs', 'bg-muted text-muted-foreground')}>
                    {policy.key}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
