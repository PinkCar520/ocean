'use client';

import { useEffect, useState } from 'react';
import { api } from '@ocean/ui/lib/api-client';
import { cn } from '@ocean/ui/lib/utils';

interface Task {
  id: string;
  title: string;
  status: 'todo' | 'in_progress' | 'done' | 'blocked';
  assigneeId?: string | null;
}

interface Project {
  id: string;
  name: string;
  description?: string | null;
  status: 'active' | 'paused' | 'archived';
  _count?: { tasks: number };
  tasks?: Task[];
}

interface Overview {
  projectCount: number;
  inFlightTasks: number;
  myTasks: number;
}

const STATUS_LABEL: Record<string, string> = {
  todo: '待办',
  in_progress: '进行中',
  done: '已完成',
  blocked: '阻塞',
};

const STATUS_STYLE: Record<string, string> = {
  todo: 'bg-slate-200 text-slate-700',
  in_progress: 'bg-sky-100 text-sky-700',
  done: 'bg-emerald-100 text-emerald-700',
  blocked: 'bg-rose-100 text-rose-700',
};

/**
 * WorkProjection —— Phase 6 6d：Work 空间投影（项目 / 任务）。
 * 挂在 Sidebar 的 Workflows 入口；数据归属 Work Space。
 */
export function WorkProjection({ token }: { token: string | null }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newProject, setNewProject] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [ov, rp] = await Promise.all([
        api.get<any>('/api/work/overview'),
        api.get<any>('/api/work/projects'),
      ]);
      setOverview(Array.isArray(ov?.data) ? ov.data : ov);
      setProjects(Array.isArray(rp?.data) ? rp.data : []);
      setError(null);
    } catch (err) {
      console.error('[Work] failed to load projection:', err);
      setError('无法加载 Work 投影');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const createProject = async () => {
    if (!newProject.trim()) return;
    setBusy(true);
    try {
      await api.post<any>('/api/work/projects', { name: newProject.trim() });
      setNewProject('');
      await load();
    } catch (err) {
      console.error('[Work] create project failed:', err);
    } finally {
      setBusy(false);
    }
  };

  const createTask = async (projectId: string, title: string) => {
    setBusy(true);
    try {
      await api.post<any>(`/api/work/projects/${projectId}/tasks`, { title });
      await load();
    } catch (err) {
      console.error('[Work] create task failed:', err);
    } finally {
      setBusy(false);
    }
  };

  const moveTask = async (taskId: string, status: string) => {
    setBusy(true);
    try {
      await api.patch<any>(`/api/work/tasks/${taskId}`, { status });
      await load();
    } catch (err) {
      console.error('[Work] move task failed:', err);
    } finally {
      setBusy(false);
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
    return <div className="flex-1 flex items-center justify-center text-muted-foreground">加载 Work 投影…</div>;
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">工作空间</h1>
            <p className="text-sm text-muted-foreground">项目与任务流转（归属 Work Space）</p>
          </div>
          <div className="flex gap-2">
            <input
              value={newProject}
              onChange={(e) => setNewProject(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createProject()}
              placeholder="新项目名称…"
              className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary"
            />
            <button
              type="button"
              disabled={busy || !newProject.trim()}
              onClick={createProject}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              新建项目
            </button>
          </div>
        </div>

        {error && <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

        {overview && (
          <div className="grid grid-cols-3 gap-3">
            {statCard('项目', overview.projectCount ?? 0, 'bg-sky-500')}
            {statCard('进行中任务', overview.inFlightTasks ?? 0, 'bg-amber-500')}
            {statCard('我的任务', overview.myTasks ?? 0, 'bg-emerald-500')}
          </div>
        )}

        <div className="space-y-3">
          {projects.length === 0 && !error && (
            <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              还没有项目。创建第一个项目来组织你的工作流。
            </div>
          )}
          {projects.map((project) => (
            <div key={project.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-foreground">
                    {project.name}
                    <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {project._count?.tasks ?? 0} 任务
                    </span>
                  </p>
                  {project.description && (
                    <p className="text-xs text-muted-foreground">{project.description}</p>
                  )}
                </div>
              </div>
              {project.tasks && project.tasks.length > 0 && (
                <div className="mt-3 space-y-1.5 border-t border-border pt-3">
                  {project.tasks.map((task) => (
                    <div key={task.id} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATUS_STYLE[task.status])}>
                          {STATUS_LABEL[task.status]}
                        </span>
                        <span className="truncate text-sm text-foreground">{task.title}</span>
                      </div>
                      {task.status !== 'done' && (
                        <div className="flex shrink-0 items-center gap-1.5">
                          {task.status !== 'in_progress' && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => moveTask(task.id, 'in_progress')}
                              className="rounded-md bg-sky-600 px-2 py-1 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50"
                            >
                              开始
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => moveTask(task.id, 'done')}
                            className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                          >
                            完成
                          </button>
                          {task.status === 'in_progress' && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => moveTask(task.id, 'blocked')}
                              className="rounded-md bg-rose-600 px-2 py-1 text-xs font-medium text-white hover:bg-rose-500 disabled:opacity-50"
                            >
                              阻塞
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <AddTaskBar projectId={project.id} disabled={busy} onAdd={createTask} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AddTaskBar({
  projectId,
  disabled,
  onAdd,
}: {
  projectId: string;
  disabled: boolean;
  onAdd: (projectId: string, title: string) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const submit = () => {
    if (!title.trim()) return;
    onAdd(projectId, title.trim()).then(() => setTitle(''));
  };
  return (
    <div className="mt-2 flex gap-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="新任务…"
        className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary"
      />
      <button
        type="button"
        disabled={disabled || !title.trim()}
        onClick={submit}
        className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
      >
        添加
      </button>
    </div>
  );
}
