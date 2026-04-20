import { useChat } from '@ai-sdk/react';
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
}

export function useChatSession({
  sessionId,
  initialMessages,
  token,
  selectedModelId,
  isSearchMode,
  isKnowledgeMode,
  onStreamFinished
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

  const { messages, sendMessage, status, setMessages, stop, error, data } = (useChat as any)({
    id: sessionId ?? 'new',
    initialMessages: [], // 我们通过 setMessages 手动控制渲染列表
    api: '/api/chat',
    fetch: authFetch,
    body: {
      modelId: selectedModelId,
      search: isSearchMode,
      knowledge: isKnowledgeMode,
      sessionId: sessionId,
    },
    onFinish: async ({ message }: any) => {
      const sid = sessionIdRef.current;
      if (sid) {
        await onStreamFinished(sid);
      }
    }
  });

  // 当 SDK 的 messages 发生变化（流式过程中），同步更新到 UI 列表
  // 注意：流式中的 SDK messages 只包含当前最新的一轮，或者全量，取决于 SDK 配置
  // 这里的策略是：在非流式状态下，UI 使用 activeMessages；流式状态下，临时合并 SDK 的增量
  const displayMessages = useMemo(() => {
    if (status === 'streaming' || status === 'submitting') {
      return messages; // 流式时直接使用 SDK 维护的列表
    }
    return activeMessages; // 闲置时使用计算出的树路径
  }, [status, messages, activeMessages]);

  const isLoading = status === 'streaming' || status === 'submitting';

  // Reset stopped state only when new streaming starts
  const prevIsLoadingRef = useRef(false);
  useEffect(() => {
    if (prevIsLoadingRef.current === false && isLoading) {
      setIsStopped(false);
    }
    prevIsLoadingRef.current = isLoading;
  }, [isLoading]);

  // Initial messages loading - 将全量消息存入树
  useEffect(() => {
    if ((!initializedRef.current || fullTree.length === 0) && initialMessages.length > 0) {
      initializedRef.current = true;
      setFullTree(initialMessages);
      titleGeneratedRef.current = true;
      
      // 默认选中最后一条消息所在的路径
      const sorted = [...initialMessages].sort((a, b) => 
        new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      );
      if (sorted[0]) {
        setCurrentLeafId(sorted[0].id);
      }
    }
  }, [initialMessages, fullTree.length]);

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
    const activeToken = localStorage.getItem('uclaw_auth_token');
    
    // 发送消息时，明确告知后端当前所在的父节点 ID
    // 如果是编辑，options.body 中通常会有专门的处理；如果是新消息，取当前叶子 ID
    const parentId = options.body?.parentId || currentLeafId;

    return sendMessage(message, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${activeToken}`
      },
      body: {
        ...options.body,
        modelId: selectedModelId,
        search: isSearchMode,
        knowledge: isKnowledgeMode,
        sessionId: sessionId,
        parentId,
      }
    });
  }, [sendMessage, selectedModelId, isSearchMode, isKnowledgeMode, sessionId, currentLeafId]);

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
