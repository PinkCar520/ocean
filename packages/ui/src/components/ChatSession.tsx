import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useSidebarPreview } from '../lib/useSidebarPreview';
import { SidebarToggleIcon } from './chat/SidebarToggleIcon';
import type { ReasoningEffort, WorkspaceSnapshot } from '@ocean/contracts';
import { ThinkingList } from './ThinkingList';
import { DiffViewer } from './DiffViewer';
import { TypingCursor, BrailleSpinner } from './chat/ChatHelpers';
import { parseReasoningToSteps, getFriendlyToolName, type ThinkingStep } from '../lib/chat-utils';
import { useChatSession } from '../lib/useChatSession';
import { useChatInput } from '../lib/useChatInput';
import { ChatInput } from './chat/ChatInput';
import { InquiryWizardCard } from './InquiryWizardCard';
import { ToolInvocationRenderer, ToolInvocationBadge } from './chat/ToolInvocationRenderer';
import { ChatMessage } from './chat/ChatMessage';
import { ConversationThumbnails } from './chat/ConversationThumbnails';
import { ConversationFind } from './chat/ConversationFind';
import { ConversationHeader } from './chat/ConversationHeader';
import type { ConversationSummary } from '../lib/useConversations';
import { IntegrationsPanel } from './chat/IntegrationsPanel';
import { type SessionTokenUsage } from './chat/TokenUsageIndicators';
import { ActiveContextPanel, type WorkspaceHostHealth } from './chat/ActiveContext';
import { ArtifactViewer } from './ArtifactViewer';
import { EmptyState } from './chat/EmptyState';
import { CopyCodeButton, MarkdownComponents, CodeBlock } from './chat/MarkdownConfig';
import { SkillPreviewPanel } from './chat/SkillPreviewPanel';
import { api } from '../lib/api-client';

import { useChat } from '@ai-sdk/react';
import {
  ArrowDown, Sparkles, Copy, RotateCcw, Check,
  Plus, FileText, X as CloseIcon, Image as ImageIcon,
  ChevronDown, Paperclip, ArrowRight, ArrowUp, Terminal, Cpu, Database, Globe, Square,
  ThumbsUp, ThumbsDown, AlertCircle, Pencil
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useReducedMotion } from '../lib/useReducedMotion';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '../lib/utils';
import { useSkillCatalog } from '../lib/useSkillCatalog';
import { UIRenderer } from './UIRenderer';
import { CapsuleAnchor } from './CapsuleAnchor';
import { BugCard } from './BugCard';
import { PipelineCard } from './PipelineCard';
import { TaskPlan } from './TaskPlan';
import { ApprovalCard } from './ApprovalCard';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from './ui/dropdown-menu';
import { TooltipProvider } from './ui/tooltip';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent
} from './ui/tooltip';

interface ChatSessionProps {
  sessionId: string | null;                  // URL 中的会话 ID（null = 新对话）
  initialMessages?: any[];                   // 从服务端拉取的历史消息
  models: any[];
  selectedModelId: string;
  setSelectedModelId: (id: string) => void;
  token: string | null;
  user: any;
  createSession: (
    workspacePath?: string,
    workspaceSnapshot?: WorkspaceSnapshot,
  ) => Promise<string | null>; // 服务端创建新会话
  onStreamFinished: (sessionId: string) => Promise<void>; // 流完成后刷新侧边栏
  onRenameConversation?: (id: string, title: string) => Promise<void>;
  conversation?: ConversationSummary;
  onDeleteConversation?: (id: string) => Promise<void>;
  onUpdateConversation?: (id: string, metadata: Pick<ConversationSummary, 'pinned' | 'projectId'>) => Promise<void>;
  getConversationLink?: (id: string) => string;
  reserveDesktopWindowControls?: boolean;
  alignSidebarToggleWithHeader?: boolean;
  reserveLeftSidebarToggle?: boolean;
  isLoadingHistory?: boolean;
  onMainTabChange?: (id: string) => void;
  /** Phase 6 6b：当前 Space（新建会话归属） */
  spaceId?: string;
  /** 当前 Session 绑定的本机目录（仅 Desktop Work 使用） */
  workspacePath?: string | null;
  workspacePaths?: string[];
  workspaceSnapshot?: WorkspaceSnapshot | null;
  workspaceSnapshots?: WorkspaceSnapshot[];
  workspaceHost?: { hostId?: string; health: WorkspaceHostHealth };
  onWorkspacePathChange?: (
    path: string | undefined,
  ) => Promise<WorkspaceSnapshot | undefined> | WorkspaceSnapshot | undefined;
  canSelectWorkspaceFolder?: boolean;
  /** 空间 Tab（工作|生活）——空状态渲染于 logo 上方 */
  spaceTabs?: Array<{ id: string; label: string }>;
  onSpaceTabChange?: (id: string) => void;
  t: (key: string, options?: any) => string;
  /** 权限模式初值（SSR 读 cookie） */
  initialPermissionMode?: string;
  navigation: {
    navigate: (path: string, options?: any) => void;
    pathname: string;
    state?: unknown;
    key?: string;
    clearState?: () => void;
  };
}

export function ChatSession({
  sessionId,
  initialMessages = [],
  models,
  selectedModelId,
  setSelectedModelId,
  token,
  user,
  createSession,
  onStreamFinished,
  onRenameConversation,
  conversation,
  onDeleteConversation,
  onUpdateConversation,
  getConversationLink,
  reserveDesktopWindowControls,
  alignSidebarToggleWithHeader,
  reserveLeftSidebarToggle,
  isLoadingHistory,
  onMainTabChange,
  spaceId,
  workspacePath,
  workspacePaths = [],
  workspaceSnapshot,
  workspaceSnapshots = [],
  workspaceHost,
  onWorkspacePathChange,
  canSelectWorkspaceFolder = false,
  spaceTabs,
  onSpaceTabChange,
  t,
  navigation,
  initialPermissionMode = 'acceptEdits',
}: ChatSessionProps) {
  const reducedMotion = useReducedMotion();

  // Custom Hook: globally fetches & caches dynamic skill names
  const { getLocalizedName } = useSkillCatalog();

  // 处理带有 autoSubmit 状态的跳转，将发送行为顺延到导航完成后进行
  const [isLocalThinking, setIsLocalThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [findFocusRequest, setFindFocusRequest] = useState(0);
  const previousFindFocusRef = useRef<HTMLElement | null>(null);
  const closeFind = useCallback(() => {
    setFindOpen(false);
    previousFindFocusRef.current?.focus({ preventScroll: true });
  }, []);
  const userScrolledUpRef = useRef(false);
  const handledAutoSubmitKeyRef = useRef<string | null>(null);
  const navigate = navigation.navigate;

  // ── Session Configuration State ──
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [isKnowledgeMode, setIsKnowledgeMode] = useState(false);
  const [sessionModesHydrated, setSessionModesHydrated] = useState(false);
  const [draftWorkspacePath, setDraftWorkspacePath] = useState<string | undefined>();
  const [draftWorkspaceSnapshot, setDraftWorkspaceSnapshot] = useState<WorkspaceSnapshot>();
  const selectedWorkspacePath = sessionId ? workspacePath ?? undefined : draftWorkspacePath;
  const selectedWorkspaceSnapshot = sessionId
    ? workspaceSnapshot ?? undefined
    : draftWorkspaceSnapshot ?? workspaceSnapshots.find(snapshot =>
        snapshot.roots.some(root => root.role === 'primary' && root.path === selectedWorkspacePath),
      );
  const handleWorkspacePathChange = useCallback(async (path: string | undefined) => {
    const snapshot = await onWorkspacePathChange?.(path);
    setDraftWorkspacePath(path);
    setDraftWorkspaceSnapshot(snapshot);
  }, [onWorkspacePathChange]);
  const createSessionForWorkspace = useCallback(
    (path?: string) =>
      createSession(
        path,
        path === selectedWorkspacePath ? selectedWorkspaceSnapshot : undefined,
      ),
    [createSession, selectedWorkspacePath, selectedWorkspaceSnapshot],
  );
  useEffect(() => {
    setIsSearchMode(sessionStorage.getItem('ocean_search_mode') === '1');
    setIsKnowledgeMode(sessionStorage.getItem('ocean_knowledge_mode') === '1');
    setSessionModesHydrated(true);
  }, []);
  useEffect(() => {
    if (!sessionModesHydrated) return;
    sessionStorage.setItem('ocean_search_mode', isSearchMode ? '1' : '0');
  }, [isSearchMode, sessionModesHydrated]);
  useEffect(() => {
    if (!sessionModesHydrated) return;
    sessionStorage.setItem('ocean_knowledge_mode', isKnowledgeMode ? '1' : '0');
  }, [isKnowledgeMode, sessionModesHydrated]);

  const [selectedReasoningEffort, setReasoningEffort] = useState<ReasoningEffort>();
  const selectedModel = models.find(model => model.id === selectedModelId);
  const supportsReasoningEffort = selectedModel?.provider === 'deepseek';
  const reasoningEffort = supportsReasoningEffort ? selectedReasoningEffort : undefined;

  // ── Hooks ──
  const {
    messages, fullTree, sendMessage, status, setMessages, stop, error,
    isLoading, isStopped, setIsStopped, handleStop,
    sessionIdRef, titleGeneratedRef, data, switchBranch, currentLeafId, setCurrentLeafId
  } = useChatSession({
    sessionId, initialMessages, token, selectedModelId, reasoningEffort,
    isSearchMode, isKnowledgeMode, onStreamFinished, spaceId
  });

  const usageQuery = new URLSearchParams({ modelId: selectedModelId });
  if (currentLeafId) usageQuery.set('leafId', currentLeafId);
  const usagePath = sessionId
    ? `/api/chat/sessions/${encodeURIComponent(sessionId)}/usage?${usageQuery}`
    : null;
  const [usageSnapshot, setUsageSnapshot] = useState<{ path: string; usage: SessionTokenUsage }>();
  useEffect(() => {
    if (!usagePath || !token) return;
    let active = true;
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const usage = await api.get<SessionTokenUsage>(usagePath);
        if (active) setUsageSnapshot({ path: usagePath, usage });
      } catch {
        if (active) setUsageSnapshot(undefined);
      } finally {
        pending = false;
      }
    };
    void refresh();
    const timer = isLoading ? setInterval(refresh, 2500) : undefined;
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [usagePath, token, isLoading]);

  // ── 实时解析并合并 Active Context 元数据 ──
  const activeContext = useMemo(() => {
    if (!data || !Array.isArray(data)) return null;
    const contexts = (data as any[])
      .filter(d => d.type === 'data-active-context')
      .map(d => d.data);
    if (contexts.length === 0) return null;

    // 合并所有历史 Context 事件（最新的覆盖旧的）
    return contexts.reduce((acc, curr) => {
      return {
        ...acc,
        payload: { ...(acc.payload || {}), ...(curr.payload || {}) }
      };
    }, { payload: {} });
  }, [data]);

  // ── 标准 UI message data parts 中的 Artifact 去重渲染 ──
  const artifacts = useMemo(() => {
    if (!data || !Array.isArray(data)) return [];
    const seen = new Set<string>();
    const list: any[] = [];
    for (const d of data as any[]) {
      const artifact = d?.type === 'data-artifact' ? d.data : undefined;
      if (artifact?.artifactId) {
        const key = `${artifact.runId}:${artifact.artifactId}`;
        if (!seen.has(key)) {
          seen.add(key);
          list.push(artifact);
        }
      }
    }
    return list;
  }, [data]);

  const {
    localInput, setLocalInput, selectedSkill, setSelectedSkill, attachments, addFiles, removeFile,
    textAreaRef, onFormSubmit, uploadFile, ghostText, setGhostText, isPredicting
  } = useChatInput({
    sendMessage, createSession: createSessionForWorkspace, workspacePath: selectedWorkspacePath, token, selectedModelId, reasoningEffort,
    isSearchMode, isKnowledgeMode, navigate,
    sessionIdRef, setIsLocalThinking, userScrolledUpRef, isLoading
  });

  // Prefill a new conversation from the public homepage without automatically sending it.
  // Only consume the URL hint once, so normal editing and session changes are unaffected.
  const homepagePromptConsumed = useRef(false);
  useEffect(() => {
    if (homepagePromptConsumed.current || sessionId || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const suggestedPrompt = params.get('prompt');
    if (!suggestedPrompt) return;
    homepagePromptConsumed.current = true;
    setLocalInput(suggestedPrompt.slice(0, 8000));
    params.delete('prompt');
    const remaining = params.toString();
    window.history.replaceState(window.history.state, '', window.location.pathname + (remaining ? '?' + remaining : '') + window.location.hash);
  }, [sessionId, setLocalInput]);

  // ── Local UI State ──
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<{ name: string; contentType: string; url: string } | null>(null);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  type RunApproval = { id: string; runId: string; toolName: string; args: Record<string, unknown> };
  type RunInquiry = { runId: string; toolCallId: string } &
    Pick<React.ComponentProps<typeof InquiryWizardCard>, 'description' | 'inquiries'>;
  type Interaction = { kind: 'approval'; data: RunApproval } | { kind: 'inquiry'; data: RunInquiry };
  const interactionPath = sessionId ? `/api/chat/sessions/${encodeURIComponent(sessionId)}/pending-interaction` +
    (currentLeafId ? `?leafId=${encodeURIComponent(currentLeafId)}` : '') : null;
  const [restoredInteraction, setRestoredInteraction] = useState<{ path: string; interaction: Interaction | null }>();
  useEffect(() => {
    if (!interactionPath || !token || isLoading) return;
    let active = true;
    let recoveringRunId: string | undefined;
    const fetchInteraction = async () => {
      try {
        const result = await api.get<{ interaction: Interaction | null }>(interactionPath);
        if (!active) return;
        setRestoredInteraction({ path: interactionPath, interaction: result.interaction });
        if (result.interaction) recoveringRunId = result.interaction.data.runId;
        if (!recoveringRunId) return;
        if (!result.interaction) {
          const run = await api.get<{ status: string }>(`/api/runs/${encodeURIComponent(recoveringRunId)}/status`);
          if (!active) return;
          if (['succeeded', 'failed', 'cancelled'].includes(run.status)) {
            if (sessionId) await onStreamFinished(sessionId);
            return;
          }
        }
        if (active) timer = setTimeout(fetchInteraction, 2500);
      } catch {
        if (active && recoveringRunId) timer = setTimeout(fetchInteraction, 5000);
      }
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    void fetchInteraction();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [interactionPath, token, isLoading, sessionId, onStreamFinished]);
  const restored = !isLoading && restoredInteraction?.path === interactionPath ? restoredInteraction.interaction : null;
  const pendingApproval = useMemo(() => {
    if (!isLoading) return restored?.kind === 'approval' ? restored.data : null;
    const event = [...data].reverse().find((part): part is { type: 'data-run-approval'; data: RunApproval | null } =>
      !!part && typeof part === 'object' && 'type' in part && part.type === 'data-run-approval');
    return event?.data ?? null;
  }, [data, isLoading, restored]);
  const pendingInquiry = useMemo(() => {
    if (!isLoading) return restored?.kind === 'inquiry' ? restored.data : null;
    const event = [...data].reverse().find((part): part is { type: 'data-run-inquiry'; data: RunInquiry | null } =>
      !!part && typeof part === 'object' && 'type' in part && part.type === 'data-run-inquiry');
    return event?.data ?? null;
  }, [data, isLoading, restored]);
  const [inquiryResponse, setInquiryResponse] = useState<{ id: string; state: 'sending' | 'sent' | 'error' }>();
  const inquiryState = inquiryResponse?.id === pendingInquiry?.toolCallId ? inquiryResponse?.state : undefined;
  const submitInquiry = async (answers?: Record<string, string | string[]>) => {
    if (!pendingInquiry || inquiryState === 'sending' || inquiryState === 'sent') return;
    const { runId, toolCallId: id } = pendingInquiry;
    setInquiryResponse({ id, state: 'sending' });
    try {
      await api.post(`/api/runs/${encodeURIComponent(runId)}/inquiries/${encodeURIComponent(id)}/answer`,
        answers ? { status: 'answered', answers } : { status: 'dismissed' });
      setInquiryResponse({ id, state: 'sent' });
    } catch {
      setInquiryResponse({ id, state: 'error' });
    }
  };
  const [approvalResponse, setApprovalResponse] = useState<{ id: string; state: 'sending' | 'sent' | 'error' }>();
  const approvalState = approvalResponse?.id === pendingApproval?.id ? approvalResponse?.state : undefined;
  const [activeCapsule, setActiveCapsule] = useState<{
    toolCallId?: string;
    uiKit?: any;
    artifact?: {
      type: 'code' | 'web';
      title: string;
      content: string;
      language?: string;
    }
  } | null>(null);
  const [messageFeedback, setMessageFeedback] = useState<Record<string, 'up' | 'down'>>({});
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);

  // ── Branching Metadata Calculation ──
  const branchMetadata = useMemo(() => {
    const totalBranches: Record<string, number> = {};
    const branchIndex: Record<string, number> = {};

    messages.forEach((m: any) => {
      // 找到该消息的所有兄弟节点（具有相同 parentId 的节点）
      const siblings = fullTree
        .filter((node: any) => node.parentId === m.parentId)
        .sort((a: any, b: any) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());

      totalBranches[m.id] = siblings.length;
      branchIndex[m.id] = siblings.findIndex((s: any) => s.id === m.id);
    });

    return { totalBranches, branchIndex };
  }, [messages, fullTree]);

  const onBranchChange = useCallback((msgId: string, index: number) => {
    const currentMsg = fullTree.find(m => m.id === msgId);
    if (!currentMsg) return;

    const siblings = fullTree
      .filter(node => node.parentId === currentMsg.parentId)
      .sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());

    const targetSibling = siblings[index];
    if (targetSibling) {
      switchBranch(targetSibling.id);
    }
  }, [fullTree, switchBranch]);

  // ── Effects ──
  useEffect(() => {
    const autoSubmit = Boolean((navigation.state as any)?.autoSubmit);
    const autoSubmitKey = sessionId && autoSubmit ? `${sessionId}:${navigation.key ?? navigation.pathname}` : null;
    if (sessionId && autoSubmitKey && handledAutoSubmitKeyRef.current !== autoSubmitKey) {
      handledAutoSubmitKeyRef.current = autoSubmitKey;
      navigation.clearState?.();
      window.setTimeout(() => onFormSubmit(), 0);
    }
  }, [sessionId, navigation, onFormSubmit]);

  useEffect(() => {
    if (messages.length > 0 && messages[messages.length - 1].role === 'assistant') {
      setIsLocalThinking(false);
    }
  }, [messages]);

  // ── Scroll Management ──
  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      userScrolledUpRef.current = !isNearBottom;
      setShowScrollButton(!isNearBottom);
    }
  };

  useEffect(() => {
    const onFindKey = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'f') {
        if (!messages.length) return;
        event.preventDefault();
        if (!findOpen && document.activeElement instanceof HTMLElement) {
          previousFindFocusRef.current = document.activeElement;
        }
        setFindOpen(true);
        setFindFocusRequest(request => request + 1);
      } else if (findOpen && event.key === 'Escape') {
        event.preventDefault();
        closeFind();
      }
    };
    window.addEventListener('keydown', onFindKey);
    return () => window.removeEventListener('keydown', onFindKey);
  }, [messages.length, findOpen, closeFind]);

  useEffect(() => {
    setFindOpen(false);
  }, [sessionId]);

  const prevMessagesLengthRef = useRef(0);
  useEffect(() => {
    if (findOpen || !scrollRef.current || userScrolledUpRef.current) return;
    const shouldSmooth = messages.length > prevMessagesLengthRef.current || isLoading;
    scrollRef.current.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: shouldSmooth ? 'smooth' : 'auto',
    });
    prevMessagesLengthRef.current = messages.length;
  }, [messages, isLoading, findOpen]);

  useEffect(() => {
    if (textAreaRef.current) textAreaRef.current.focus();
  }, [textAreaRef]);

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  };

  // ── Actions ──
  const copyToClipboard = useCallback((m: any) => {
    const text = Array.isArray(m.parts)
      ? m.parts.map((p: any) => {
        if (p.type === 'text') return p.text;
        if (p.type === 'skill') return `/${p.name} `;
        return '';
      }).join('')
      : m.content || '';
    navigator.clipboard.writeText(text);
    setCopiedId(m.id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const handleRegenerate = useCallback(async (msgId: string) => {
    if (isLoading) return;
    const currentMsg = fullTree.find(m => m.id === msgId);
    if (!currentMsg) return;

    const userMsgId = currentMsg.parentId;
    if (!userMsgId) return;

    const userMsg = fullTree.find(m => m.id === userMsgId);
    if (!userMsg) return;

    try {
      await sendMessage({
        content: userMsg.content,
        role: 'user',
        experimental_attachments: userMsg.experimental_attachments
      } as any, {
        body: { parentId: userMsg.parentId }
      });
    } catch (err) {
      console.error('Regenerate failed:', err);
    }
  }, [isLoading, fullTree, sendMessage]);

  const handleRetry = useCallback(async () => {
    if (messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role !== 'user') return;

    try {
      await sendMessage({
        content: lastMsg.content,
        role: 'user',
        experimental_attachments: lastMsg.experimental_attachments,
      } as any, {
        body: { parentId: lastMsg.parentId }
      });
    } catch (err) {
      console.error('Retry failed:', err);
    }
  }, [messages, sendMessage]);

  const startEditing = useCallback((msgId: string, content: string) => {
    setEditingMessageId(msgId);
    setEditText(content);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingMessageId(null);
    setEditText('');
  }, []);

  const submitEdit = useCallback(async (msgId: string) => {
    const trimmed = editText.trim();
    if (!trimmed) {
      cancelEdit();
      return;
    }
    const currentMsg = fullTree.find(m => m.id === msgId);
    if (!currentMsg) return;

    try {
      await sendMessage({
        content: trimmed,
        role: 'user',
        experimental_attachments: currentMsg.experimental_attachments,
      } as any, {
        body: { parentId: currentMsg.parentId },
      });
    } catch (err) {
      console.error('Edit submit failed:', err);
    }
    cancelEdit();
  }, [editText, fullTree, sendMessage, cancelEdit]);

  const handleApprovalResponse = useCallback(async (status: 'approved' | 'denied') => {
    if (!pendingApproval || approvalState === 'sending' || approvalState === 'sent') return;
    const { id, runId } = pendingApproval;
    setApprovalResponse({ id, state: 'sending' });
    try {
      await api.post(`/api/runs/${encodeURIComponent(runId)}/approvals/${encodeURIComponent(id)}/decide`, {
        decision: status === 'approved' ? 'approved' : 'rejected',
        scope: 'once',
      });
      setApprovalResponse({ id, state: 'sent' });
    } catch {
      setApprovalResponse({ id, state: 'error' });
    }
  }, [pendingApproval, approvalState]);

  const onExtractArtifact = useCallback((artifact: any) => {
    setActiveCapsule({ artifact: { ...artifact, type: 'code' } });
  }, []);


  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback(() => { setIsDragging(false); }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  }, [addFiles]);

  const lastMessage = messages[messages.length - 1];
  const lastToolInvocations = lastMessage?.parts?.filter((part: any) =>
    part.type === 'tool-invocation' ||
    part.type === 'dynamic-tool' ||
    part.type?.startsWith('tool-')
  ) || lastMessage?.toolInvocations || [];
  const activeInquiryPart = lastMessage?.role === 'assistant'
    ? lastToolInvocations.find((p: any) => {
      const result = p.output ?? p.result;
      return result?.ui?.uiType === 'inquiry_card';
    })
    : null;

  const rightSidebarPreview = useSidebarPreview(!isRightSidebarOpen && !previewAttachment && !activeCapsule);
  const showHeader = Boolean(sessionId || messages.length > 0 || status === 'submitted');
  const lastVisibleMessageId = messages.at(-1)?.id;
  const visibleMessages = useMemo(() => {
    const unique = new Map(messages.map((message, index) => [message.id || (message as { createdAt?: string | Date }).createdAt || index, message]));
    return Array.from(unique.values()).filter(message => message.role === 'user' || message.role === 'assistant');
  }, [messages]);
  const shareLeafId = !isLoading && !isLoadingHistory && initialMessages.some(message => message.id === lastVisibleMessageId)
    ? lastVisibleMessageId : undefined;
  return (
    <div
      className={cn("flex-1 flex overflow-hidden h-full relative", showHeader && "pt-14")}
      onDragOver={handleDragOver}
    >
      {showHeader && (
        <header className={cn(
          'pointer-events-none absolute inset-x-0 top-0 z-[9999] flex h-14 items-center justify-between gap-3 border-b border-border bg-background pl-4 pr-12',
          reserveLeftSidebarToggle && 'md:pl-14',
          reserveDesktopWindowControls && 'md:pl-32',
        )}>
          <ConversationHeader
            key={sessionId}
            sessionId={sessionId}
            conversation={conversation}
            shareLeafId={shareLeafId}
            shareOwner={user}
            link={getConversationLink}
            rename={onRenameConversation}
            remove={onDeleteConversation}
            update={onUpdateConversation}
          />
        </header>
      )}
      {/* Right Sidebar Toggle Button — 始终吸附于整个视图最右侧顶部 */}
      {(!previewAttachment && !activeCapsule) && (
        <div className={cn("absolute right-3 z-[9999] titlebar-no-drag", (showHeader || alignSidebarToggleWithHeader) ? "top-0 flex h-14 items-center border-b border-transparent" : "top-[4px]")}>
          <Tooltip disableHoverableContent>
            <TooltipTrigger asChild>
              <button
                onPointerEnter={rightSidebarPreview.begin}
                onPointerLeave={rightSidebarPreview.leave}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  rightSidebarPreview.reset();
                  setIsRightSidebarOpen(previous => !previous);
                }}
                className="w-8 h-7 inline-flex items-center justify-center rounded-md hover:bg-foreground/10 text-muted-foreground hover:text-foreground transition-colors cursor-pointer titlebar-no-drag pointer-events-auto"
                style={{ WebkitAppRegion: 'no-drag' } as any}
                aria-label={t(isRightSidebarOpen ? 'sidebar.collapseRight' : 'sidebar.expandRight')}
              >
                <SidebarToggleIcon side="right" expanded={isRightSidebarOpen || rightSidebarPreview.open} />
              </button>
            </TooltipTrigger>
            <TooltipContent variant="inverse" side="bottom" className="z-[10000]">{t(isRightSidebarOpen ? 'sidebar.collapseRight' : 'sidebar.expandRight')}</TooltipContent>
          </Tooltip>
        </div>
      )}
      <div className={cn(
        "flex-1 flex flex-col relative overflow-hidden bg-card/40 transition-all duration-300",
        messages.length === 0 && !isLoadingHistory && "justify-center"
      )}>
        <AnimatePresence>
          {isDragging && (
            <motion.div
              {...(reducedMotion ? { initial: false, animate: { opacity: 1 } } : { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } })}
              onDragLeave={handleDragLeave} onDrop={handleDrop}
              className="absolute inset-0 z-50 bg-primary/5 backdrop-blur-[2px] border-4 border-dashed border-primary/20 m-4 rounded-[40px] flex flex-col items-center justify-center text-primary"
            >
              <Plus className="w-12 h-12 mb-4" />
              <p className="text-xl font-bold font-display">{t('common.drag_drop')}</p>
            </motion.div>
          )}
        </AnimatePresence>

        <ConversationFind
          key={sessionId}
          scrollRef={scrollRef}
          open={findOpen}
          focusRequest={findFocusRequest}
          belowHeader={showHeader}
          close={closeFind}
        />
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className={cn(
            "overflow-y-auto px-4 md:px-8 scroll-smooth relative w-full",
            messages.length === 0 && !isLoadingHistory ? "flex-none py-2" : "flex-1 py-4"
          )}
        >
          {/* 右侧栏关闭按钮 */}
          {previewAttachment && (
            <button
              onClick={() => setPreviewAttachment(null)}
              className="absolute right-4 top-4 z-30 p-2 rounded-lg bg-card/80 backdrop-blur-sm border border-border/60 text-muted-foreground hover:text-primary hover:bg-card hover:border-primary/30 transition-all shadow-sm"
              title="关闭预览"
            >
              <CloseIcon className="w-4 h-4" />
            </button>
          )}

          <div data-conversation-content className="max-w-[800px] mx-auto space-y-8">

            <AnimatePresence mode="popLayout" initial={false}>
              {isLoadingHistory ? (
                <div className="flex flex-col mt-8 w-full gap-8 max-w-3xl mx-auto px-2">
                  <div className="flex justify-end w-full opacity-60">
                    <div className="bg-[#eeece9] w-2/3 h-14 rounded-[20px] animate-pulse rounded-tr-[4px]"></div>
                  </div>
                  <div className="flex justify-start w-full gap-4 mt-2 opacity-60">
                    <div className="w-8 h-8 rounded-xl bg-border animate-pulse shrink-0"></div>
                    <div className="flex-1 max-w-[80%] h-32 rounded-[20px] bg-[#fcfcfc] animate-pulse rounded-tl-[4px] border border-[#f0f0f0]"></div>
                  </div>
                </div>
              ) : messages.length === 0 ? (
                /* 还原 EmptyState 在此处的渲染，但逻辑改为判断 messages */
                <EmptyState
                  t={t}
                  setLocalInput={setLocalInput}
                  onFormSubmit={onFormSubmit}
                  showSuggestions={false}
                  spaceTabs={spaceTabs}
                  activeSpaceId={(spaceId ?? '').startsWith('life-') ? 'life' : 'work'}
                  onSpaceTabChange={onSpaceTabChange}
                />
              ) : (
                <div key="chat-messages" className="flex flex-col w-full">
                  {visibleMessages.map((m, idx, arr) => (
                      <ChatMessage
                        key={m.id || idx}
                        message={m}
                        idx={idx}
                        isLast={idx === arr.length - 1}
                        isLoading={isLoading && !pendingApproval && !pendingInquiry}
                        reducedMotion={reducedMotion}
                        t={t}
                        getLocalizedName={getLocalizedName}
                        copyToClipboard={copyToClipboard}
                        copiedId={copiedId}
                        messageFeedback={messageFeedback}
                        setMessageFeedback={setMessageFeedback}
                        handleRegenerate={handleRegenerate}
                        startEditing={startEditing}
                        editingMessageId={editingMessageId}
                        editText={editText}
                        setEditText={setEditText}
                        submitEdit={submitEdit}
                        cancelEdit={cancelEdit}
                        setPreviewAttachment={setPreviewAttachment}
                        previewAttachment={previewAttachment}
                        activeCapsule={activeCapsule}
                        setActiveCapsule={setActiveCapsule}
                        sendMessage={sendMessage}
                        branchIndex={branchMetadata.branchIndex}
                        totalBranches={branchMetadata.totalBranches}
                        onBranchChange={onBranchChange}
                        isStopped={isStopped}
                        onExtract={onExtractArtifact}
                      />
                    ))}

                  {/* Error Banner */}
                  {error && (
                    <motion.div
                      {...(reducedMotion ? { initial: false, animate: { opacity: 1 } } : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 } })}
                      className="flex w-full gap-4 items-start mb-8"
                    >
                      <div className="w-8 h-8 rounded-[10px] bg-red-50 flex items-center justify-center shrink-0 mt-1">
                        <AlertCircle className="w-4 h-4 text-red-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="bg-red-50/80 border border-red-200 rounded-[20px] px-5 py-4">
                          <p className="text-sm font-semibold text-red-700 mb-1">
                            {t('chat.error.title', 'Request failed')}
                          </p>
                          <p className="text-xs text-red-500/80 break-words">
                            {error.message || t('chat.error.message', 'Something went wrong while generating the response. Please try again.')}
                          </p>
                          <button
                            onClick={() => handleRetry()}
                            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 active:scale-[0.98] transition-all"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            {t('chat.error.retry', 'Retry')}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* 当正在提交但 messages 列表还没更新出 assistant 回复时的"先行占位" */}
                  {!pendingApproval && !pendingInquiry && (isLoading || isLocalThinking) && (messages.length === 0 || messages[messages.length - 1]?.role === 'user') && (
                    <motion.div {...(reducedMotion ? { initial: false, animate: { opacity: 1 } } : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 } })} className="flex w-full gap-4 items-start mb-8">
                      <div aria-hidden="true" className="w-8 h-8 flex items-center justify-center text-primary shrink-0 mt-1">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <ThinkingList steps={[{ label: t('chat.thinking'), status: 'active' }]} />
                      </div>
                    </motion.div>
                  )}
                  <div className="h-px w-full mt-4" />
                </div>
              )}

            </AnimatePresence>

            {artifacts.length > 0 && (
              <div className="w-full space-y-2 pt-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">产物</p>
                {artifacts.map((a) => (
                  <ArtifactViewer
                    key={`${a.runId}:${a.artifactId}`}
                    runId={a.runId}
                    artifactId={a.artifactId}
                    name={a.name || 'artifact'}
                    contentType={a.contentType}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {!isLoadingHistory && visibleMessages.length > 0 && (
          <ConversationThumbnails
            key={sessionId}
            scrollRef={scrollRef}
            messages={visibleMessages}
            reducedMotion={reducedMotion}
            label={t('chat.thumbnails.label')}
            emptyPrompt={t('chat.thumbnails.emptyPrompt')}
          />
        )}

        {!pendingInquiry && !pendingApproval && activeInquiryPart && (
          <div className="w-full px-4 md:px-8 z-10">
            <div className="max-w-[800px] mx-auto relative flex flex-col justify-end pb-1">
              <InquiryWizardCard
                skillName={activeInquiryPart.result?.ui?.props?.skillName || activeInquiryPart.output?.ui?.props?.skillName}
                description={activeInquiryPart.result?.ui?.props?.description || activeInquiryPart.output?.ui?.props?.description}
                inquiries={activeInquiryPart.result?.ui?.props?.inquiries || activeInquiryPart.output?.ui?.props?.inquiries}
                onComplete={async (answers) => {
                  const props = activeInquiryPart.result?.ui?.props || activeInquiryPart.output?.ui?.props || {};
                  const inquiries = props.inquiries || [];
                  const requestId = props.requestId;

                  if (requestId) {
                    try {
                      await api.post(`/api/chat/approvals/${requestId}/respond`, {
                        status: 'approved',
                        result: answers
                      });
                      // Remove activeInquiryPart after successful submit
                      // Since this is a blocking MCP request, we don't inject a message
                    } catch (err) {
                      console.error('Failed to submit MCP intent clarify:', err);
                    }
                  } else {
                    const formattedText = Object.entries(answers)
                      .map(([q, a]) => {
                        const inq = inquiries.find((i: any) => i.question === q);
                        const label = inq?.header || q;
                        const ansStr = Array.isArray(a) ? a.join(', ') : a;
                        return `Q: ${label}\\\nA: ${ansStr}`;
                      })
                      .join('\\\n');
                    sendMessage({ content: formattedText, role: 'user' });
                  }
                }}
                onCancel={async () => {
                  const props = activeInquiryPart.result?.ui?.props || activeInquiryPart.output?.ui?.props || {};
                  if (props.requestId) {
                    await api.post(`/api/chat/approvals/${props.requestId}/respond`, { status: 'denied' });
                  } else {
                    sendMessage({ content: '已取消操作', role: 'user' });
                  }
                }}
              />
            </div>
          </div>
        )}

        {pendingInquiry && !pendingApproval && (
          <section aria-label={t('chat.run_inquiry.title')}
            className="titlebar-no-drag pointer-events-auto z-10 max-h-[45dvh] shrink-0 overflow-auto px-4 md:px-8">
            <div className="mx-auto max-w-[800px] pb-2">
              <fieldset disabled={inquiryState === 'sending' || inquiryState === 'sent'} className="min-w-0">
                <InquiryWizardCard key={pendingInquiry.toolCallId}
                  skillName={t('chat.run_inquiry.title')}
                  description={pendingInquiry.description}
                  inquiries={pendingInquiry.inquiries}
                  onComplete={answers => void submitInquiry(answers)}
                  onCancel={() => void submitInquiry()}
                />
              </fieldset>
              {inquiryState === 'error' && <p role="alert" className="mt-2 text-xs text-destructive">{t('chat.run_inquiry.error')}</p>}
            </div>
          </section>
        )}

        {pendingApproval && (
          <section aria-label={t('chat.run_approval.title')}
            className="titlebar-no-drag pointer-events-auto z-10 max-h-[40dvh] shrink-0 overflow-y-auto px-4 md:px-8">
            <div className="mx-auto max-w-[800px] pb-2">
              <ApprovalCard
                requestId={pendingApproval.id}
                toolName={pendingApproval.toolName}
                description={t('chat.run_approval.description')}
                args={pendingApproval.args}
                status="pending"
                approveLabel={t('chat.run_approval.approve')}
                submitting={approvalState === 'sending' || approvalState === 'sent'}
                responseError={approvalState === 'error'}
                onApprove={() => void handleApprovalResponse('approved')}
                onReject={() => void handleApprovalResponse('denied')}
                className="mt-0 max-w-none shadow-none"
              />
            </div>
          </section>
        )}

        <ChatInput
          tokenUsage={usagePath ? usageSnapshot?.path === usagePath ? usageSnapshot.usage : null : undefined}
          isEmpty={messages.length === 0 && !isLoadingHistory}
          localInput={localInput}
          setLocalInput={setLocalInput}
          selectedSkill={selectedSkill}
          setSelectedSkill={setSelectedSkill}
          attachments={attachments}
          addFiles={addFiles}
          removeFile={removeFile}
          isModelDropdownOpen={isModelDropdownOpen}
          setIsModelDropdownOpen={setIsModelDropdownOpen}
          isSearchMode={isSearchMode}
          setIsSearchMode={setIsSearchMode}
          isKnowledgeMode={isKnowledgeMode}
          setIsKnowledgeMode={setIsKnowledgeMode}
          onFormSubmit={onFormSubmit}
          handleStop={handleStop}
          isLoading={isLoading}
          models={models}
          selectedModelId={selectedModelId}
          setSelectedModelId={setSelectedModelId}
          reasoningEffort={reasoningEffort}
          onReasoningEffortChange={supportsReasoningEffort ? setReasoningEffort : undefined}
          textAreaRef={textAreaRef}
          t={t}
          lastUserMessage={messages.filter(m => m.role === 'user').pop()?.content}
          setPreviewAttachment={setPreviewAttachment}
          ghostText={ghostText}
          setGhostText={setGhostText}
          isPredicting={isPredicting}
          onMainTabChange={onMainTabChange}
          initialPermissionMode={initialPermissionMode}
          workspacePath={selectedWorkspacePath}
          workspacePaths={workspacePaths}
          onWorkspacePathChange={handleWorkspacePathChange}
          showWorkspaceFolder={canSelectWorkspaceFolder && spaceId === 'work'}
          workspaceFolderEditable={!sessionId && canSelectWorkspaceFolder && spaceId === 'work'}
        />
      </div>

      {/* Sidebar Right (Capsule Panel + Preview + Meta) */}
      <aside onPointerEnter={rightSidebarPreview.keep} onPointerLeave={rightSidebarPreview.leave} className={cn(
        "absolute right-0 top-0 bottom-0 z-40 border-l border-border bg-background lg:bg-background/80 backdrop-blur-md flex-col h-full overflow-hidden transition-all duration-300",
        (previewAttachment || activeCapsule)
          ? "lg:relative translate-x-0 flex w-full lg:w-[560px] opacity-100"
          : isRightSidebarOpen
            ? "lg:relative hidden lg:flex w-80 opacity-100"
            : cn(
                "flex w-80 max-w-full",
                rightSidebarPreview.open
                  ? "translate-x-0 opacity-100 shadow-xl"
                  : "translate-x-full opacity-0 pointer-events-none invisible",
              )
      )}>
        {activeCapsule ? (
          /* ── Capsule Panel ── */
          <motion.div
            {...(reducedMotion
              ? { initial: false, animate: { x: 0, opacity: 1 } }
              : { initial: { x: '100%', opacity: 0 }, animate: { x: 0, opacity: 1 }, exit: { x: '100%', opacity: 0 }, transition: { type: 'spring', damping: 25, stiffness: 200 } }
            )}
            className="flex-1 flex flex-col h-full bg-card"
          >
            <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between bg-muted/50">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-foreground">
                  {activeCapsule.artifact ? '代码组件' : '交互胶囊'}
                </span>
                <span className="text-[10px] text-muted-foreground bg-border px-1.5 py-0.5 rounded-full">
                  {activeCapsule.artifact ? activeCapsule.artifact.language : activeCapsule.uiKit?.uiType}
                </span>
              </div>
              <button
                onClick={() => setActiveCapsule(null)}
                className="p-1.5 hover:bg-[#eeece9] rounded-lg transition-colors"
              >
                <CloseIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto bg-card">
              {activeCapsule.artifact ? (
                <div className="flex flex-col h-full">
                  <div className="flex items-center justify-between px-6 py-4 border-b border-[#F6F3F2]">
                    <h3 className="text-[15px] font-bold text-foreground">{activeCapsule.artifact.title}</h3>
                    <CopyCodeButton code={activeCapsule.artifact.content} />
                  </div>
                  <div className="flex-1 bg-[#0d0d0d] overflow-auto">
                    <CodeBlock
                      language={activeCapsule.artifact.language}
                      value={activeCapsule.artifact.content}
                      minimal={true}
                    />
                  </div>
                </div>
              ) : (
                <div className="p-4">
                  <UIRenderer
                    uiKit={activeCapsule.uiKit}
                    onAction={(actionId, payload) => {
                      if (actionId === 'approve_request') {
                        sendMessage({ content: `APPROVE:${(payload as any).requestId}`, role: 'user' });
                      } else if (actionId === 'reject_request') {
                        sendMessage({ content: `REJECT:${(payload as any).requestId}`, role: 'user' });
                      } else if (actionId === 'create_zentao_task') {
                        const d = payload as any;
                        sendMessage({ content: `Create ZenTao task for ${d.bugId}: assignee=${d.assignee}`, role: 'user' });
                      } else if (actionId === 'open_bug_detail') {
                        console.log('[Capsule] Open bug detail:', (payload as any).id);
                      } else if (actionId === 'view_logs') {
                        console.log('[Capsule] View pipeline logs:', (payload as any).pipelineId);
                      } else if (actionId === 'retry_pipeline') {
                        sendMessage({ content: `Retry pipeline ${(payload as any).pipelineId}`, role: 'user' });
                      }
                    }}
                  />
                </div>
              )}
            </div>
          </motion.div>
        ) : previewAttachment ? (
          <SkillPreviewPanel
            attachment={previewAttachment}
            onClose={() => setPreviewAttachment(null)}
          />
        ) : (
          <div className="flex flex-col h-full overflow-y-auto custom-scrollbar relative">
            <div className="h-14 border-b border-border/60 shrink-0 w-full" />
            <ActiveContextPanel
              workspacePath={selectedWorkspaceSnapshot?.roots.find(root => root.role === 'primary')?.path ?? selectedWorkspacePath}
              workspaceHostHealth={workspaceHost?.hostId && selectedWorkspaceSnapshot &&
                selectedWorkspaceSnapshot.hostId !== workspaceHost.hostId ? 'other-host' : workspaceHost?.health}
              onAction={(action) => {
                onFormSubmit({ content: action, role: 'user' });
              }}
            />
            <div className="border-t border-border/60 bg-muted/30">
              <IntegrationsPanel t={t} />
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
