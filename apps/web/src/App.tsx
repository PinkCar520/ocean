import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useChat } from '@ai-sdk/react';
import { ArrowUp, Bot, User, Sparkles } from 'lucide-react';
import { BugCard } from './components/BugCard';

type BugDetail = {
  id: string;
  title: string;
  status: 'active' | 'resolved' | 'closed';
  assignee: string;
  severity: 'high' | 'medium' | 'low';
  createdAt?: string;
  description?: string;
};

function App() {
  const chat = useChat({
    // 已将鉴权与转发逻辑下沉至 vite.config.ts 代理层，确保 100% 通行
  });

  const { messages, sendMessage, status } = chat as any;
  // isLoading 用于禁用输入框
  const isLoading = status === 'streaming' || status === 'submitting';
  // isWaiting 专门用于显示底部的加载动画，仅在提交中（还没收到首字节）时显示
  const isWaiting = status === 'submitting';

  const submitInFlightRef = useRef(false);

  // 使用本地状态进行完全控制
  const [localInput, setLocalInput] = useState('');

  // 调试日志
  useEffect(() => {
    console.log('[UClaw Debug] useChat status:', status);
    if (messages.length > 0) {
      console.log('[UClaw Debug] Last message:', JSON.stringify(messages[messages.length - 1], null, 2));
    }
  }, [status, messages]);

  const onChangeWrapper = (e: ChangeEvent<HTMLInputElement>) => {
    setLocalInput(e.target.value);
  };

  const onFormSubmit = async (e: any) => {
    e.preventDefault();
    if (!localInput.trim() || isLoading || submitInFlightRef.current) return;

    const currentInput = localInput;
    submitInFlightRef.current = true;
    setLocalInput(''); // 先清空输入框提升体验
    
    try {
      if (typeof sendMessage === 'function') {
        // 关键修复：根据报错分析，该 SDK 期望接收对象 { text: string }
        await sendMessage({ text: currentInput });
      } else if ((chat as any).append) {
        // 兜底方案：如果 sendMessage 不存在，尝试使用标准 append
        await (chat as any).append({ role: 'user', content: currentInput });
      }
    } catch (err) {
      console.error('[UClaw] Send failed:', err);
      setLocalInput(currentInput);
    } finally {
      submitInFlightRef.current = false;
    }
  };

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const renderBugCard = (bug: BugDetail, key: string) => (
    <div key={key} className="animate-in fade-in slide-in-from-bottom-2 duration-500">
      <BugCard
        bugId={bug.id}
        title={bug.title}
        status={bug.status}
        assignee={bug.assignee}
        severity={bug.severity}
        createdAt={bug.createdAt}
        description={bug.description}
      />
    </div>
  );

  const getSearchQueryLabel = (part: any) => {
    const query = part?.input?.query;
    return typeof query === 'string' && query.trim() ? query.trim() : null;
  };

  const renderToolPart = (part: any, index: number) => {
    if (part.type === 'tool-getBugInfo') {
      if (part.state === 'output-available' && part.output) {
        return renderBugCard(part.output as BugDetail, `${part.toolCallId || index}-bug`);
      }

      return (
        <div key={part.toolCallId || index} className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse">
          <div className="w-2 h-2 rounded-full bg-primary/40"></div>
          Searching ZenTao for bug details...
        </div>
      );
    }

    if (part.type === 'tool-searchBugs') {
      if (part.state === 'output-available') {
        const bugs = Array.isArray(part.output) ? (part.output as BugDetail[]) : [];
        const queryLabel = getSearchQueryLabel(part);

        return (
          <div key={part.toolCallId || index} className="flex flex-col gap-4 rounded-2xl border border-border/80 bg-white/70 p-4 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
              <div className="flex flex-col gap-1">
                <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.22em]">
                  ZenTao Search
                </div>
                <div className="text-sm font-semibold text-foreground">
                  {bugs.length} result{bugs.length === 1 ? '' : 's'} found
                </div>
              </div>
              {queryLabel && (
                <div className="rounded-full border border-border bg-accent px-3 py-1 text-[10px] font-mono text-muted-foreground">
                  query: {queryLabel}
                </div>
              )}
            </div>
            {bugs.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2">
                {bugs.map((bug) => renderBugCard(bug, `${part.toolCallId || index}-${bug.id}`))}
              </div>
            ) : (
              <div className="text-xs text-zinc-400 italic bg-zinc-50 p-3 rounded-xl border border-dashed">
                No matching bugs found in ZenTao.
              </div>
            )}
          </div>
        );
      }

      return (
        <div key={part.toolCallId || index} className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse">
          <div className="w-2 h-2 rounded-full bg-primary/40"></div>
          Searching ZenTao for bugs...
        </div>
      );
    }

    return null;
  };

  const renderMessageContent = (message: any) => {
    const parts = Array.isArray(message.parts) ? message.parts : [];

    const textContent = parts.length > 0
      ? parts
          .filter((part: any) => part?.type === 'text' && typeof part?.text === 'string' && part.text.trim() !== '')
          .map((part: any) => part.text)
          .join('\n')
      : (message.content || message.text || '');

    const toolParts = parts
      .map((part: any, index: number) => renderToolPart(part, index))
      .filter(Boolean);

    const legacyToolInvocations = (message.toolInvocations || []).map((toolInvocation: any, index: number) => {
      const { toolName, toolCallId, state } = toolInvocation;

      if (toolName === 'getBugInfo') {
        if (state === 'result' && toolInvocation.result) {
          return renderBugCard(toolInvocation.result as BugDetail, `${toolCallId || index}-legacy-bug`);
        }

        return (
          <div key={toolCallId || index} className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse">
            <div className="w-2 h-2 rounded-full bg-primary/40"></div>
            Searching ZenTao for bug details...
          </div>
        );
      }

      if (toolName === 'searchBugs') {
        const bugs = Array.isArray(toolInvocation.result) ? (toolInvocation.result as BugDetail[]) : [];
        const queryLabel = typeof toolInvocation.args?.query === 'string' ? toolInvocation.args.query.trim() : '';

        if (state === 'result') {
          return (
            <div key={toolCallId || index} className="flex flex-col gap-4 rounded-2xl border border-border/80 bg-white/70 p-4 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-500">
              <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
                <div className="flex flex-col gap-1">
                  <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.22em]">
                    ZenTao Search
                  </div>
                  <div className="text-sm font-semibold text-foreground">
                    {bugs.length} result{bugs.length === 1 ? '' : 's'} found
                  </div>
                </div>
                {queryLabel && (
                  <div className="rounded-full border border-border bg-accent px-3 py-1 text-[10px] font-mono text-muted-foreground">
                    query: {queryLabel}
                  </div>
                )}
              </div>
              {bugs.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {bugs.map((bug) => renderBugCard(bug, `${toolCallId || index}-legacy-${bug.id}`))}
                </div>
              ) : (
                <div className="text-xs text-zinc-400 italic bg-zinc-50 p-3 rounded-xl border border-dashed">
                  No matching bugs found in ZenTao.
                </div>
              )}
            </div>
          );
        }

        return (
          <div key={toolCallId || index} className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse">
            <div className="w-2 h-2 rounded-full bg-primary/40"></div>
            Searching ZenTao for bugs...
          </div>
        );
      }

      return null;
    }).filter(Boolean);

    return (
      <div className="flex flex-col gap-4">
        {toolParts}
        {legacyToolInvocations}
        {textContent && <p className="leading-relaxed whitespace-pre-wrap">{textContent}</p>}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-screen bg-background text-foreground font-sans selection:bg-primary/30">
      
      {/* 极简顶栏 */}
      <header className="flex-none border-b border-border bg-white/80 backdrop-blur-md px-6 py-4 flex items-center justify-between z-10 sticky top-0">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2 rounded-xl text-primary">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-semibold text-sm tracking-wide text-foreground">UClaw Desk</h1>
            <p className="text-[10px] text-muted-foreground font-mono tracking-wider uppercase mt-0.5">Enterprise Intranet Agent</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
           <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
           <span className="text-xs text-muted-foreground font-mono">Gateway Active</span>
        </div>
      </header>

      {/* 滚动消息面板 */}
      <main ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-8 space-y-8 scroll-smooth">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-500 space-y-4 opacity-50">
            <Bot className="w-12 h-12 stroke-[1]" />
            <p className="text-sm font-light">Ask me to check Jenkins or ZenTao queries...</p>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-8 pb-10">
            {messages.map((m: any) => (
              <div 
                key={m.id} 
                className={`flex gap-4 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {m.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-lg bg-accent border border-border flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
                
                <div 
                  className={`
                    max-w-[85%] px-5 py-3.5 rounded-2xl text-sm
                    ${m.role === 'user' 
                      ? 'bg-primary text-white rounded-tr-sm shadow-md' 
                      : 'bg-transparent text-foreground'}
                  `}
                >
                  {renderMessageContent(m)}
                </div>

                {m.role === 'user' && (
                  <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-primary" />
                  </div>
                )}
              </div>
            ))}
            {isWaiting && (
               <div className="flex gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                 <div className="w-8 h-8 rounded-lg bg-accent border border-border flex items-center justify-center flex-shrink-0">
                   <Bot className="w-4 h-4 text-muted-foreground" />
                 </div>
                 <div className="px-5 py-3.5 flex items-center gap-1.5 opacity-50">
                   <span className="w-1.5 h-1.5 rounded-full bg-zinc-300 animate-bounce" style={{ animationDelay: '0ms' }}></span>
                   <span className="w-1.5 h-1.5 rounded-full bg-zinc-300 animate-bounce" style={{ animationDelay: '150ms' }}></span>
                   <span className="w-1.5 h-1.5 rounded-full bg-zinc-300 animate-bounce" style={{ animationDelay: '300ms' }}></span>
                 </div>
               </div>
            )}
          </div>
        )}
      </main>

      {/* 底部悬浮输入框 */}
      <footer className="flex-none p-6 pt-0 bg-gradient-to-t from-white via-white/90 to-transparent">
        <form onSubmit={onFormSubmit} className="relative max-w-4xl mx-auto group">
          <input
            className="w-full bg-white border border-border rounded-2xl pl-5 pr-14 py-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 transition-all shadow-lg"
            value={localInput}
            placeholder="Type your command..."
            onChange={onChangeWrapper}
            disabled={isLoading}
          />
          <button 
            type="submit" 
            disabled={isLoading || !localInput.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 rounded-xl bg-primary text-white hover:bg-blue-600 transition-colors disabled:opacity-50"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
        </form>
        <p className="text-center text-[10px] text-muted-foreground mt-4 font-mono">
          Strictly internal tools execution environment. All network traffic is monitored.
        </p>
      </footer>

    </div>
  );
}

export default App;
