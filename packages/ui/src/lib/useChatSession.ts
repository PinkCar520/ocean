import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { authFetch } from './api-client';
interface UseChatSessionProps {
  sessionId: string | null;
  initialMessages: any[];
  token: string | null;
  selectedModelId: string;
  isSearchMode: boolean;
  isKnowledgeMode: boolean;
  onStreamFinished: (id: string) => Promise<void>;
  /** Phase 6 6b：当前 Space（新建会话的 Run 归属） */
  spaceId?: string;
}

export function useChatSession({
  sessionId,
  initialMessages,
  token,
  selectedModelId,
  isSearchMode,
  isKnowledgeMode,
  onStreamFinished,
  spaceId
}: UseChatSessionProps) {
  const initializedRef = useRef(false);
  const sessionIdRef = useRef(sessionId);
  const titleGeneratedRef = useRef(false);
  const [isStopped, setIsStopped] = useState(false);

  // ── Tree State ──
  const [fullTree, setFullTree] = useState<any[]>([]); // 存储所有拉取到的原始消息
  const [currentLeafId, setCurrentLeafId] = useState<string | null>(null);

  // Sync ref to ensure async callbacks always have the latest value
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  // Reset flags when switching sessions
  useEffect(() => {
    titleGeneratedRef.current = false;
    initializedRef.current = false;
    setFullTree([]);
    setData([]);
    setCurrentLeafId(null);
  }, [sessionId]);

  // 1. 根据 fullTree 和 currentLeafId 计算当前活跃路径的线性消息列表
  const activeMessages = useMemo(() => {
    if (fullTree.length === 0) return [];
    
    // 如果没有指定叶子节点，默认取最后一条
    let targetId = currentLeafId;
    if (!targetId) {
      // 找到时间最晚的消息作为默认叶子
      const sorted = [...fullTree].sort((a, b) => 
        new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      );
      targetId = sorted[0]?.id;
    }

    if (!targetId) return [];

    const path: any[] = [];
    const nodeMap = new Map(fullTree.map(m => [m.id, m]));
    
    let curr: any = nodeMap.get(targetId);
    while (curr) {
      path.unshift(curr);
      curr = curr.parentId ? nodeMap.get(curr.parentId) : null;
    }

    return path;
  }, [fullTree, currentLeafId]);

  const [data, setData] = useState<unknown[]>([]);
  const fetchWithAuth = useCallback(
    (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      if (token && token !== 'cookie') {
        headers.set('Authorization', `Bearer ${token}`);
      }
      return authFetch(input, { ...init, headers });
    },
    [token],
  );
  const transport = useMemo(
    () => new DefaultChatTransport({ api: '/api/chat', fetch: fetchWithAuth }),
    [fetchWithAuth],
  );
  const handleData = useCallback(
    (part: unknown) => setData((previous) => [...previous, part]),
    [],
  );

  const onFinishRef = useRef<any>(null);
  onFinishRef.current = async ({ message }: any) => {
    const sid = sessionIdRef.current;
    if (sid) {
      await onStreamFinished(sid);
      // 清空 SDK 内部的增量消息列表，因为此时它们已经通过 initialMessages -> fullTree -> activeMessages 同步到了 UI
      setMessages([]); 
    }
  };

  const handleFinish = useCallback((...args: any[]) => {
    return onFinishRef.current?.(...args);
  }, []);

  const { messages, sendMessage, status, setMessages, stop, error } = useChat({
    id: sessionId ?? 'new',
    transport,
    onFinish: handleFinish,
    onData: handleData,
  });

  // 当 SDK 的 messages 发生变化（流式过程中），同步更新到 UI 列表
  // 这里的策略是：在流式过程中，为了避免历史消息重复或 ID 冲突导致的闪烁，
  // 我们在有增量消息时，优先展示增量消息（因为 SDK 的 messages 通常包含了当前对话上下文）
  // 2. 在 idle 且 messages 还有值时，继续展示合并列表。
  const displayMessages = useMemo(() => {
    const normalizeMessage = (message: any) => ({
      ...message,
      content: typeof message.content === 'string'
        ? message.content
        : (message.parts ?? [])
            .filter((part: any) => part.type === 'text')
            .map((part: any) => part.text ?? '')
            .join(''),
    });
    const normalizedActiveMessages = activeMessages.map(normalizeMessage);
    let base: any[] = [];

    if (status === 'streaming' || status === 'submitted') {
      base = [...normalizedActiveMessages, ...messages.map(normalizeMessage)];
    } else if (messages.length > 0) {
      const filtered = messages.map(normalizeMessage).filter((message: any) => {
        return !normalizedActiveMessages.some(activeMessage =>
          activeMessage.id === message.id || (
            activeMessage.role === message.role && message.content.length > 0 &&
            activeMessage.content === message.content
          )
        );
      });
      base = [...normalizedActiveMessages, ...filtered];
    } else {
      base = normalizedActiveMessages;
    }

    return base;
  }, [status, messages, activeMessages]);

  const isLoading = status === 'streaming' || status === 'submitted';

  // Reset stopped state only when new streaming starts
  const prevIsLoadingRef = useRef(false);
  useEffect(() => {
    if (prevIsLoadingRef.current === false && isLoading) {
      setIsStopped(false);
    }
    prevIsLoadingRef.current = isLoading;
  }, [isLoading]);

  // Sync initialMessages to fullTree
  useEffect(() => {
    if (initialMessages.length > 0) {
      setFullTree(initialMessages);
      
      const sorted = [...initialMessages].sort((a, b) => 
        new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      );
      const latestMessage = sorted[0];

      if (!initializedRef.current || !currentLeafId) {
        initializedRef.current = true;
        titleGeneratedRef.current = true;
        if (latestMessage) {
            setCurrentLeafId(latestMessage.id);
        }
      } else {
        // 如果 initialMessages 发生了实质性更新（通常是流式结束后的 refresh），
        // 且当前 leaf 就在这堆消息中，尝试跟随到最新的叶子
        if (latestMessage && latestMessage.id !== currentLeafId) {
           setCurrentLeafId(latestMessage.id);
        }
      }
    }
  }, [initialMessages]);

  const totalUsage = useMemo(() => {
    let inputTokens = 0;
    let outputTokens = 0;
    for (const msg of displayMessages) {
      const u = (msg as any).usage;
      if (u) {
        inputTokens += u.inputTokens ?? u.promptTokens ?? u.prompt_tokens ?? 0;
        outputTokens += u.outputTokens ?? u.completionTokens ?? u.completion_tokens ?? 0;
      }
    }
    return { promptTokens: inputTokens, completionTokens: outputTokens, totalTokens: inputTokens + outputTokens };
  }, [displayMessages]);

  const handleStop = () => {
    setIsStopped(true);
    stop();
  };

  // 🛡️ 加固版发送函数：确保带上最新的 parentId
  const safeSendMessage = useCallback(async (message: any, options: any = {}) => {
    // 发送消息时，明确告知后端当前所在的父节点 ID
    // 如果是编辑，options.body 中通常会有专门的处理；如果是新消息，取当前叶子 ID
    const parentId = options.body && Object.hasOwn(options.body, 'parentId')
      ? options.body.parentId
      : currentLeafId;

    const headers = new Headers(options.headers);
    if (token && token !== 'cookie') {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const { content, ...messageWithoutContent } = message;
    return sendMessage({
      ...messageWithoutContent,
      parts: message.parts ?? [{ type: 'text', text: content ?? '' }],
    }, {
      ...options,
      headers: Object.fromEntries(headers.entries()),
      body: {
        ...options.body,
        modelId: selectedModelId,
        search: isSearchMode,
        knowledge: isKnowledgeMode,
        sessionId: sessionId,
        spaceId,
        parentId,
      }
    });
  }, [sendMessage, token, selectedModelId, isSearchMode, isKnowledgeMode, sessionId, spaceId, currentLeafId]);

  // 切换分支
  const switchBranch = useCallback((nodeId: string) => {
    // 找到该节点下的最深叶子节点
    const findDeepestLeaf = (id: string): string => {
      const children = fullTree.filter(m => m.parentId === id);
      if (children.length === 0) return id;
      // 简单策略：总是取第一个子分支的最深叶子，或按时间取
      const sorted = children.sort((a, b) => 
        new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      );
      return findDeepestLeaf(sorted[0].id);
    };

    const leafId = findDeepestLeaf(nodeId);
    setCurrentLeafId(leafId);
  }, [fullTree]);

  return {
    messages: displayMessages,
    fullTree,
    setFullTree,
    sendMessage: safeSendMessage,
    status,
    setMessages,
    stop,
    error,
    isLoading,
    isStopped,
    setIsStopped,
    totalUsage,
    handleStop,
    sessionIdRef,
    titleGeneratedRef,
    data,
    switchBranch,
    currentLeafId,
    setCurrentLeafId
  };
}
