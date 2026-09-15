'use client';

import { useEffect, useState } from 'react';
import { api } from '@ocean/ui/lib/api-client';
import { cn } from '@ocean/ui/lib/utils';

interface Repo {
  id: string;
  name: string;
  url?: string | null;
  defaultBranch: string;
  provider: string;
  description?: string | null;
  _count?: { diffs: number };
  diffs?: Array<{
    id: string;
    title?: string | null;
    headRef: string;
    status: string;
    _count?: { reviews: number };
  }>;
}

interface Overview {
  repoCount: number;
  openDiffs: number;
  myPending: number;
}

/**
 * CodeProjection —— Phase 6 6c：Code 空间投影（仓库 / Diff / Review 概览）。
 * 数据来自 Gateway Code API（归属 Code Space）。
 */
export function CodeProjection({ token }: { token: string | null }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [ov, rp] = await Promise.all([
        api.get<any>('/api/code/overview'),
        api.get<any>('/api/code/repositories'),
      ]);
      setOverview(Array.isArray(ov?.data) ? ov.data : ov);
      setRepos(Array.isArray(rp?.data) ? rp.data : []);
      setError(null);
    } catch (err) {
      console.error('[Code] failed to load projection:', err);
      setError('无法加载 Code 投影');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const decide = async (diffId: string, status: string) => {
    setDeciding(diffId);
    try {
      await api.post<any>(`/api/code/diffs/${diffId}/reviews`, { status });
      await load();
    } catch (err) {
      console.error('[Code] review decision failed:', err);
    } finally {
      setDeciding(null);
    }
  };

  const statCard = (label: string, value: number, accent: string) => (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className={cn('mt-2 h-1 w-full rounded-full', accent)} />
    </div>
  );

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-muted-foreground">加载 Code 投影…</div>;
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-xl font-bold text-foreground">代码空间</h1>
          <p className="text-sm text-muted-foreground">仓库、Diff 与 Review 工作区（归属 Code Space）</p>
        </div>

        {error && <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

        {overview && (
          <div className="grid grid-cols-3 gap-3">
            {statCard('仓库', overview.repoCount ?? 0, 'bg-sky-500')}
            {statCard('待审 Diff', overview.openDiffs ?? 0, 'bg-amber-500')}
            {statCard('我的待审', overview.myPending ?? 0, 'bg-emerald-500')}
          </div>
        )}

        <div className="space-y-3">
          {repos.length === 0 && !error && (
            <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              还没有仓库。连接 Git 仓库后，这里将展示 Diff 与 Review。
            </div>
          )}
          {repos.map((repo) => (
            <div key={repo.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-foreground">{repo.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {repo.provider} · {repo.defaultBranch} · {repo._count?.diffs ?? 0} 个 Diff
                  </p>
                </div>
                {repo.url && (
                  <a href={repo.url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                    打开仓库 ↗
                  </a>
                )}
              </div>
              {repo.diffs && repo.diffs.length > 0 && (
                <div className="mt-3 space-y-2 border-t border-border pt-3">
                  <p className="text-xs font-medium text-muted-foreground">最近的开放 Diff</p>
                  {repo.diffs.map((diff) => (
                    <div key={diff.id} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-foreground">
                          {diff.title || diff.headRef}
                          <span className="ml-2 text-xs text-muted-foreground">{diff.headRef}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">{diff._count?.reviews ?? 0} 条 Review</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          disabled={deciding === diff.id}
                          onClick={() => decide(diff.id, 'approved')}
                          className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                        >
                          通过
                        </button>
                        <button
                          type="button"
                          disabled={deciding === diff.id}
                          onClick={() => decide(diff.id, 'changes_requested')}
                          className="rounded-md bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-500 disabled:opacity-50"
                        >
                          需修改
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
