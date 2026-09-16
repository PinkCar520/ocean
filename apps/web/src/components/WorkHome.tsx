'use client';

import { useRef, useState } from 'react';

interface WorkHomeProps {
  /** 提交工作指令：暂存 prompt 并进入工作聊天 */
  onCreateWorkChat: (prompt: string) => void;
  /** 打开侧边栏「项目」 */
  onOpenProjects: () => void;
  /** 打开侧边栏「工作流」 */
  onOpenWorkflows: () => void;
}

/**
 * WorkHome —— 工作 Tab 专属引导首页（参考 ChatGPT Work：居中「我们要做什么？」）。
 * 与生活 Tab 的聊天页形成界面区分；输入框提交后进入工作空间聊天并自动发送。
 */
export function WorkHome({ onCreateWorkChat, onOpenProjects, onOpenWorkflows }: WorkHomeProps) {
  const [prompt, setPrompt] = useState('');
  const [tip, setTip] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const showTip = (text: string) => {
    setTip(text);
    window.setTimeout(() => setTip(null), 3000);
  };

  const submit = () => {
    const text = prompt.trim();
    if (!text) return;
    setPrompt('');
    onCreateWorkChat(text);
  };

  const heroBtn = (label: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-border bg-card px-3.5 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {label}
    </button>
  );

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6">
      <div className="flex w-full max-w-2xl flex-col items-center text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">我们要做什么？</h1>
        <p className="mt-2 text-sm text-muted-foreground">规划项目、推进任务、检查流水线——告诉 Ocean 你的工作目标。</p>
        <div className="mt-6 flex w-full items-center gap-2">
          <input
            ref={inputRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="输入工作指令，如：创建 Q3 里程碑项目并分配任务…"
            className="flex-1 rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={submit}
            className="shrink-0 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            开始
          </button>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {heroBtn('使用 Ocean Work', () => inputRef.current?.focus())}
          {heroBtn('帮我批准', () => showTip('待审批事项显示在右下角审批面板'))}
          {heroBtn('选择项目', onOpenProjects)}
          {heroBtn('检查流水线', onOpenWorkflows)}
        </div>
        {tip && (
          <p className="mt-4 rounded-full bg-card px-4 py-1.5 text-xs text-muted-foreground">{tip}</p>
        )}
      </div>
    </div>
  );
}
