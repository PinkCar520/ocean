/**
 * useConversations — Server-First 对话管理 Hook
 *
 * 架构对齐 DeepSeek / Claude / ChatGPT：
 * - 服务端是唯一真实数据来源（Source of Truth）
 * - 刷新页面时从 GET /api/sessions/:id/messages 完整恢复
 * - 不使用 IndexedDB，无本地状态
 */
import { useEffect, useRef, useState, useCallback } from 'react';

export interface ConversationSummary {
  id: string;
  title: string;
  channel: string;
  status: string;
  messageCount: number;
  updatedAt: string;
  createdAt: string;
  favorited?: boolean;
}

interface UseConversationsArgs {
  token: string | null;
  sessionId: string | null; // URL 中的 :id（当前打开的会话）
  navigate: (to: string, options?: { replace?: boolean }) => void;
  onAuthExpired: () => void;
  onUserProfile: (user: any) => void;
  t: (key: string, options?: any) => string;
}

export function useConversations({
  token,
  sessionId,
  navigate,
  onAuthExpired,
  onUserProfile,
  t,
}: UseConversationsArgs) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [currentMessages, setCurrentMessages] = useState<any[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const onAuthExpiredRef = useRef(onAuthExpired);
  const onUserProfileRef = useRef(onUserProfile);

  useEffect(() => { onAuthExpiredRef.current = onAuthExpired; }, [onAuthExpired]);
  useEffect(() => { onUserProfileRef.current = onUserProfile; }, [onUserProfile]);

  const authHeaders = useCallback((): HeadersInit => {
    const h: HeadersInit = {};
    if (token) h['Authorization'] = `Bearer ${token}`;
    const uid = localStorage.getItem('uclaw_user_id');
    if (uid) h['X-User-Id'] = uid;
    return h;
  }, [token]);

  // ── 初始化：拉取用户信息 + 会话列表 ─────────────────────────────
  useEffect(() => {
    if (!token) {
      setIsInitialized(true);
      return;
    }

    const init = async () => {
      // 拉取用户资料
      try {
        const res = await fetch('/api/user/profile', { headers: authHeaders() });
        const data = await res.json();
        if (data.success) {
          onUserProfileRef.current(data.profile);
        } else if (res.status === 401) {
          onAuthExpiredRef.current();
          return;
        }
      } catch {
        console.error('[useConversations] Failed to fetch user profile');
      }

      // 拉取会话列表
      await refreshConversations();
      setIsInitialized(true);
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const justCreatedSessionIdRef = useRef<string | null>(null);

  // ── 刷新会话列表 ──────────────────────────────────────────────
  const refreshConversations = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/sessions', { headers: authHeaders() });
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setConversations(data.data);
      }
    } catch (err) {
      console.error('[useConversations] Failed to refresh conversations:', err);
    }
  }, [token, authHeaders]);

  // ── 路由变化：拉取当前会话消息（刷新恢复的关键）────────────────
  useEffect(() => {
    if (!sessionId || !token) {
      setCurrentMessages([]);
      return;
    }

    // 如果是我们刚刚本地创建的会话，不需要立即清空并拉取导致闪烁，直接复用当前缓存
    if (justCreatedSessionIdRef.current === sessionId) {
      justCreatedSessionIdRef.current = null; // 消费掉标记
      return;
    }

    const loadMessages = async () => {
      setIsLoadingMessages(true);
      try {
        const res = await fetch(`/api/sessions/${sessionId}/messages`, {
          headers: authHeaders(),
        });
        if (!res.ok) {
          console.error(`[useConversations] Failed to load messages for session ${sessionId}`);
          setCurrentMessages([]);
          return;
        }
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
          setCurrentMessages(data.data);
        }
      } catch (err) {
        console.error('[useConversations] Error loading messages:', err);
        setCurrentMessages([]);
      } finally {
        setIsLoadingMessages(false);
      }
    };

    loadMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, token]);

  // ── 更新页面标题 ──────────────────────────────────────────────
  useEffect(() => {
    if (sessionId) {
      const conv = conversations.find(c => c.id === sessionId);
      document.title = conv ? `uClaw - ${conv.title}` : 'uClaw - AI Assistant';
    } else {
      document.title = `uClaw - ${t('sidebar.new_chat')}`;
    }
  }, [conversations, sessionId, t]);

  // ── 公共操作 ──────────────────────────────────────────────────

  /**
   * 创建新会话 — 服务端创建，返回 sessionId
   */
  const createSession = useCallback(async (): Promise<string | null> => {
    if (!token) return null;
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ channel: 'web', title: t('sidebar.new_chat') }),
      });
      const data = await res.json();
      if (data.success && data.data?.id) {
        const newId = data.data.id;
        justCreatedSessionIdRef.current = newId; // 标记刚创建的会话
        
        // 乐观更新：立即添加到列表
        setConversations(prev => [{
          id: newId,
          title: t('sidebar.new_chat'),
          channel: 'web',
          status: 'active',
          messageCount: 0,
          updatedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        }, ...prev]);
        return newId;
      }
    } catch (err) {
      console.error('[useConversations] Failed to create session:', err);
    }
    return null;
  }, [token, authHeaders, t]);

  /**
   * 导航到新对话（空白）
   */
  const handleNewChat = useCallback(() => {
    navigate('/');
    setCurrentMessages([]);
  }, [navigate]);

  /**
   * 打开已有会话
   */
  const loadConversation = useCallback((id: string) => {
    navigate(`/chat/${id}`);
  }, [navigate]);

  /**
   * 重命名会话（PATCH，乐观更新）
   */
  const handleRenameChat = useCallback(async (id: string, newTitle: string) => {
    // 乐观更新
    setConversations(prev => prev.map(c => c.id === id ? { ...c, title: newTitle } : c));
    try {
      await fetch(`/api/sessions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ title: newTitle }),
      });
    } catch (err) {
      console.error('[useConversations] Rename failed, refreshing:', err);
      await refreshConversations();
    }
  }, [authHeaders, refreshConversations]);

  /**
   * 删除会话（DELETE，乐观更新）
   */
  const handleDeleteConversations = useCallback(async (ids: string[]) => {
    setConversations(prev => prev.filter(c => !ids.includes(c.id)));
    await Promise.allSettled(
      ids.map(id =>
        fetch(`/api/sessions/${id}`, { method: 'DELETE', headers: authHeaders() })
      )
    );
    // 若当前打开的会话被删除，返回首页
    if (sessionId && ids.includes(sessionId)) {
      navigate('/');
    }
  }, [authHeaders, sessionId, navigate]);

  /**
   * 流完成后刷新侧边栏（获取服务端写入的最新标题/消息数）
   */
  const onStreamFinished = useCallback(async (newSessionId: string) => {
    await refreshConversations();
    // 导航到该会话的 URL（若当前不是）
    if (newSessionId && !sessionId) {
      navigate(`/chat/${newSessionId}`, { replace: true });
    }
  }, [refreshConversations, sessionId, navigate]);

  return {
    isInitialized,
    conversations,
    currentMessages,
    isLoadingMessages,
    createSession,
    handleNewChat,
    loadConversation,
    handleRenameChat,
    handleDeleteConversations,
    onStreamFinished,
    refreshConversations,
  };
}
