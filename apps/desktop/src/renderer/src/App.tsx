import { TooltipProvider } from "@ocean/ui/components/ui/tooltip";
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  workspaceConfigurationSchema,
  workspaceRecordSchema,
  type WorkspaceConfiguration,
  type WorkspaceRecord,
  type WorkspaceSnapshot,
} from '@ocean/contracts';
import { Routes, Route, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Sparkles,
  Cloud,
  Cpu,
  Menu,
} from 'lucide-react';
import { ChatSession } from '@ocean/ui/components/ChatSession';
import { useTranslation } from 'react-i18next';
import { resolvePreferredLanguage } from '@ocean/ui/lib/i18n';
import { SettingsDialog } from '@ocean/ui/components/Settings/SettingsDialog';
import { UIGallery } from '@ocean/ui/components/UIGallery';
import { SkillLibrary } from '@ocean/ui/components/SkillLibrary';
import { KnowledgeBase } from '@ocean/ui/components/KnowledgeBase';
import { Projects } from '@ocean/ui/components/Projects';
import { AllChatsManager } from '@ocean/ui/components/AllChatsManager';
import { Sidebar } from '@ocean/ui/components/Sidebar';
import { SettingsModal } from '@ocean/ui/components/SettingsModal';
import { AuthPage } from '@ocean/ui/components/AuthPage';
import { useConversations } from '@ocean/ui/lib/useConversations';
import { cn } from '@ocean/ui/lib/utils';
import { Toaster } from '@ocean/ui/components/GlobalToast';
import { api } from '@ocean/ui/lib/api-client';
import { SkillManager } from '@ocean/ui/components/SkillManager';
import { WorkProjection } from '@ocean/ui/components/WorkProjection';

import { WorkspaceProvider, useWorkspace } from '@ocean/ui/contexts/WorkspaceContext';

type WorkspaceHostInfo = Pick<WorkspaceConfiguration, 'hostId' | 'platform'>;

type WorkspaceHostHealth = 'signed-out' | 'starting' | 'online' | 'reconnecting' | 'unauthorized' | 'unavailable';

function getWorkspaceHostBridge() {
  return (window as Window & {
    api?: {
      getWorkspaceHostInfo?: () => Promise<{ info?: WorkspaceHostInfo; health: WorkspaceHostHealth } | null>;
      setWorkspaceHostSession?: (token: string | null) => Promise<void>;
    };
  }).api;
}

function toWorkspaceSnapshot(workspace: WorkspaceRecord): WorkspaceSnapshot {
  return {
    schemaVersion: 1,
    workspaceId: workspace.id,
    workspaceRevision: workspace.revision,
    name: workspace.name,
    hostId: workspace.hostId,
    platform: workspace.platform,
    roots: workspace.roots,
    cwd: workspace.cwd,
    worktree: workspace.worktree,
  };
}

function AppContent() {
  const { id: sessionIdFromUrl } = useParams<{ id?: string }>();
  
  // ── Global Authentication & Identity State ──
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('ocean_auth_token'));
  const [user, setUser] = useState<any>(null);

  return (
    <TooltipProvider delayDuration={0}>
      <WorkspaceProvider token={token}>
        <AppInternal key={token ?? "signed-out"}
          token={token} 
        setToken={setToken} 
        user={user} 
        setUser={setUser} 
        sessionIdFromUrl={sessionIdFromUrl}
      />
      </WorkspaceProvider>
    </TooltipProvider>
  );
}

function AppInternal({ token, setToken, user, setUser, sessionIdFromUrl }: any) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { activeProject, setActiveProjectId } = useWorkspace();

  const [activeTab, setActiveTab] = useState(() => {
    const saved = localStorage.getItem('ocean_active_tab');
    if (saved === 'code') return 'workflows';
    return saved || 'chat';
  });
  const [activeSpaceId, setActiveSpaceId] = useState(() => {
    const saved = localStorage.getItem('ocean_active_space');
    return saved?.startsWith('life-') ? saved : 'work';
  });

  useEffect(() => {
    localStorage.setItem('ocean_active_tab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    localStorage.setItem('ocean_active_space', activeSpaceId);
  }, [activeSpaceId]);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false); // Used for UserMenu Popover
  const [isMainSettingsOpen, setIsMainSettingsOpen] = useState(false); // Used for Settings Dialog Modal
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('ocean_sidebar_collapsed');
    return saved === 'true';
  });
  const [models, setModels] = useState<any[]>([]);
  const [selectedModelId, setSelectedModelId] = useState(() => localStorage.getItem('ocean_selected_model') || '');
  const [workspaceHostInfo, setWorkspaceHostInfo] = useState<WorkspaceHostInfo | null>(null);
  const [workspaceHostHealth, setWorkspaceHostHealth] = useState<WorkspaceHostHealth>('starting');
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([]);
  const [workspacesLoaded, setWorkspacesLoaded] = useState(false);
  const workspaceCreationRequests = useRef(new Map<string, Promise<WorkspaceSnapshot>>());

  useEffect(() => {
    const bridge = getWorkspaceHostBridge();
    if (!bridge?.setWorkspaceHostSession || !bridge.getWorkspaceHostInfo) return;
    let active = true;
    const refresh = async () => {
      try {
        const status = await bridge.getWorkspaceHostInfo?.();
        if (!active || !status) return;
        setWorkspaceHostInfo(status.info ?? null);
        setWorkspaceHostHealth(status.health);
      } catch {
        if (active) setWorkspaceHostHealth('unavailable');
      }
    };
    void bridge.setWorkspaceHostSession(token).then(refresh).catch(() => {
      if (active) setWorkspaceHostHealth('unavailable');
    });
    const timer = token ? window.setInterval(refresh, 2000) : undefined;
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [token]);

  useEffect(() => {
    let active = true;
    setWorkspacesLoaded(false);
    if (!token) {
      setWorkspaces([]);
      setWorkspacesLoaded(true);
      return;
    }

    void api.get<any>('/api/workspaces').then(response => {
      if (!response?.success || !Array.isArray(response.data)) {
        throw new Error('Workspace catalog returned an invalid response.');
      }
      const records = workspaceRecordSchema.array().parse(response.data);
      if (active) {
        setWorkspaces(records);
        setWorkspacesLoaded(true);
      }
    }).catch(error => {
      console.error('[Workspace] failed to load Workspace catalog:', error);
    });
    return () => {
      active = false;
    };
  }, [token]);

  const handleWorkspacePathChange = useCallback(async (
    path: string | undefined,
  ): Promise<WorkspaceSnapshot | undefined> => {
    if (!path) return undefined;

    const hostInfo = workspaceHostInfo;
    if (!hostInfo) throw new Error('Local Workspace Host identity is unavailable.');
    const assertAccount = () => {
      if (localStorage.getItem('ocean_auth_token') !== token) {
        throw new Error('Desktop account changed.');
      }
    };
    assertAccount();

    let catalog = workspaces;
    if (!workspacesLoaded) {
      const response = await api.get<any>('/api/workspaces');
      if (!response?.success || !Array.isArray(response.data)) {
        throw new Error('Workspace catalog returned an invalid response.');
      }
      assertAccount();
      catalog = workspaceRecordSchema.array().parse(response.data);
      setWorkspaces(catalog);
      setWorkspacesLoaded(true);
    }

    const existing = catalog.find(workspace =>
      workspace.hostId === hostInfo?.hostId &&
      workspace.roots.some(root => root.role === 'primary' && root.path === path),
    );
    if (existing) return toWorkspaceSnapshot(existing);

    const requestKey = `${hostInfo.hostId}\0${path}`;
    const inFlight = workspaceCreationRequests.current.get(requestKey);
    if (inFlight) return inFlight;

    const name = path.split(/[\\/]/).filter(Boolean).pop() || path;
    const rootId = crypto.randomUUID();
    const configuration = workspaceConfigurationSchema.parse({
      name,
      hostId: hostInfo.hostId,
      platform: hostInfo.platform,
      roots: [{ id: rootId, label: name, path, role: 'primary', access: 'read_write' }],
      cwd: { rootId, relativePath: '.' },
      worktree: { enabled: false },
    });
    const createRequest = (async () => {
      const response = await api.post<any>('/api/workspaces', configuration);
      if (!response?.success || !response.data) {
        throw new Error('Workspace configuration was not saved.');
      }
      assertAccount();
      const created = workspaceRecordSchema.parse(response.data);
      setWorkspaces(previous => [created, ...previous.filter(item => item.id !== created.id)]);
      return toWorkspaceSnapshot(created);
    })();
    workspaceCreationRequests.current.set(requestKey, createRequest);
    try {
      return await createRequest;
    } finally {
      workspaceCreationRequests.current.delete(requestKey);
    }
  }, [token, workspaceHostInfo, workspaces, workspacesLoaded]);

  const toggleSidebar = () => {
    setIsSidebarCollapsed((current) => {
      const newState = !current;
      localStorage.setItem('ocean_sidebar_collapsed', String(newState));
      return newState;
    });
  };

  const handleLoginSuccess = (newToken: string, userData: any) => {
    localStorage.setItem('ocean_auth_token', newToken);
    localStorage.setItem('ocean_user_id', userData.workId);
    setToken(newToken);
    setUser(userData);
  };

  const handleLogout = () => {
    void api.post('/api/auth/logout').catch(() => {});
    void getWorkspaceHostBridge()?.setWorkspaceHostSession?.(null).catch(() => {});
    localStorage.removeItem('ocean_auth_token');
    localStorage.removeItem('ocean_user_id');
    setToken(null);
    setUser(null);
    navigate('/');
  };

  // ── Server-First 会话管理 ──
  const {
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
  } = useConversations({
    token,
    sessionId: sessionIdFromUrl ?? null,
    navigate,
    onAuthExpired: handleLogout,
    onUserProfile: setUser,
    t,
    spaceId: activeSpaceId,
    homePath: '/',
  });

  const localWorkspaces = workspaceHostInfo
    ? workspaces.filter(workspace => workspace.hostId === workspaceHostInfo.hostId)
    : [];
  const workspaceSnapshots = localWorkspaces.map(toWorkspaceSnapshot);
  const workspacePaths = Array.from(new Set(
    localWorkspaces.flatMap(workspace =>
      workspace.roots
        .filter(root => root.role === 'primary')
        .map(root => root.path),
    ),
  ));

  const spaceConversations = conversations.filter((conversation) => {
    const conversationSpaceId = conversation.spaceId === 'code'
      ? 'work'
      : conversation.spaceId ?? 'work';
    return conversationSpaceId === activeSpaceId;
  });

  useEffect(() => {
    if (!sessionIdFromUrl) return;
    const conversation = conversations.find((item) => item.id === sessionIdFromUrl);
    if (conversation?.spaceId) {
      setActiveSpaceId(conversation.spaceId === 'code' ? 'work' : conversation.spaceId);
    }
  }, [sessionIdFromUrl, conversations]);

  const handleSpaceTabChange = async (space: string) => {
    if (space === 'work') {
      setActiveSpaceId('work');
      setActiveTab('chat');
      navigate('/');
      return;
    }
    if (activeSpaceId.startsWith('life-')) return;

    try {
      const response = await api.post<any>('/api/spaces/life', {});
      const lifeSpaceId = response?.data?.id;
      if (!lifeSpaceId) throw new Error('Life Space was not returned by the API.');
      setActiveSpaceId(lifeSpaceId);
      setActiveTab('chat');
      navigate('/');
    } catch (error) {
      console.error('[Space] failed to switch to Life:', error);
    }
  };

  const spaceTabs = [
    { id: 'work', label: t('space.tabs.work', '工作') },
    { id: 'life', label: t('space.tabs.life', '生活') },
  ];

  // Sync Global Settings from User Profile
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    if (user?.preferences) {
      // Sync Theme
      if (user.preferences.theme) {
        const applyTheme = (theme: string) => {
          document.documentElement.classList.remove('light', 'dark');
          if (theme === 'system') {
            const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            document.documentElement.classList.add(isDark ? 'dark' : 'light');
          } else {
            document.documentElement.classList.add(theme);
          }
        };

        applyTheme(user.preferences.theme);

        if (user.preferences.theme === 'system') {
          const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
          const handler = () => applyTheme('system');
          mediaQuery.addEventListener('change', handler);
          cleanup = () => mediaQuery.removeEventListener('change', handler);
        }
      }
      
      // Sync Language
      if (user.preferences.language) {
        const language = resolvePreferredLanguage(user.preferences.language);
        if (i18n.language !== language) void i18n.changeLanguage(language);
      }
      
    }
    return cleanup;
  }, [user?.preferences, i18n]);

  useEffect(() => {
    if (activeTab === 'chat') return;
    const tabNames: Record<string, string> = {
      library: t('sidebar.library'),
      workflows: t('sidebar.workflows'),
      projects: t('sidebar.projects') || 'Projects',
      settings: t('settings.title'),
      all_chats: t('sidebar.all_chats'),
    };
    const name = tabNames[activeTab] || activeTab.charAt(0).toUpperCase() + activeTab.slice(1);
    document.title = `Ocean - ${name}`;
  }, [activeTab, t]);

  const handleDeleteChat = (id: string) => {
    handleDeleteConversations([id]);
  };

  const loadConversationAndActivate = (id: string) => {
    const conversation = conversations.find((item) => item.id === id);
    if (conversation?.spaceId) {
      setActiveSpaceId(conversation.spaceId === 'code' ? 'work' : conversation.spaceId);
    }
    loadConversation(id);
    setActiveTab('chat');
  };

  const handleNewChatAndActivate = () => {
    handleNewChat();
    setActiveTab('chat');
  };

  useEffect(() => {
    if (selectedModelId) {
      localStorage.setItem('ocean_selected_model', selectedModelId);
    }
  }, [selectedModelId]);

  // 动态获取可用模型
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const json = await api.get<any>('/api/chat/models');
        const data = Array.isArray(json) ? json : (json.models || []);

        const iconMap: Record<string, any> = {
          'Sparkles': Sparkles,
          'Cloud': Cloud,
          'Cpu': Cpu,
          'Zap': Sparkles, // fallback for Zap icon
        };
        const formattedModels = data.map((m: any) => ({
          ...m,
          icon: iconMap[m.icon] || Sparkles
        }));

        setModels(formattedModels);

        if (formattedModels.length > 0) {
          setSelectedModelId((currentModelId) => {
            const currentExists = formattedModels.some((m: any) => m.id === currentModelId);
            if (currentExists) return currentModelId;

            const preferredModelId = user?.preferences?.defaultModel;
            const preferredExists = formattedModels.some((m: any) => m.id === preferredModelId);
            return preferredExists ? preferredModelId : formattedModels[0].id;
          });
        }
      } catch (err) {
        console.error('Failed to fetch models:', err);
      }
    };
    if (token) fetchModels();
  }, [token, user?.preferences?.defaultModel]);

  const [, setProjects] = useState<any[]>([]);

  // 动态获取项目列表（供全局命令菜单使用）
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const res = await api.get<any>('/api/knowledge-projects');
        if (res.success) setProjects(res.data);
      } catch (err) {
        console.error('Failed to fetch projects for command menu:', err);
      }
    };
    if (token) fetchProjects();
  }, [token, activeTab]);

  if (!token) {
    return (
      <>
        <Toaster />
        <AuthPage onLoginSuccess={handleLoginSuccess} />
      </>
    );
  }

  if (!isInitialized) {
    return <div className="h-screen w-full flex items-center justify-center bg-muted"><div className="animate-pulse font-bold text-muted-foreground">Loading...</div></div>;
  }

  return (
    <div className="flex h-screen w-full bg-muted font-sans selection:bg-primary/10 selection:text-primary">
      <Toaster />
      {/* 1. 侧边栏 (Fixed App Shell) */}
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        isCollapsed={isSidebarCollapsed}
        onToggle={toggleSidebar}
        activeMainTab={activeTab}
        onMainTabChange={(id: string) => { setActiveTab(id); }}
        onOpenSettings={() => { setIsSettingsOpen(true); }}
        onNewChat={handleNewChatAndActivate}
        conversations={spaceConversations}
        currentChatId={sessionIdFromUrl ?? null}
        onLoadConversation={loadConversationAndActivate}
        onRenameConversation={handleRenameChat}
        onDeleteConversation={handleDeleteChat}
        onFavoriteConversation={() => {}} // Favorite 功能可后续实现
        user={user}
        onLogout={handleLogout}
        token={token}
      />
      {/* 2. 主区域 (Fluid Workspace) */}
      <main className={cn(
        "flex-1 flex flex-col relative h-screen max-w-full overflow-hidden transition-all duration-300",
        isSidebarCollapsed ? "md:ml-0" : "md:ml-64"
      )}>
        {/* Mobile Header */}
        <div className="md:hidden flex items-center justify-between p-3 border-b border-border bg-card shrink-0 z-30">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 -ml-2 text-muted-foreground hover:bg-muted rounded-lg transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-display font-bold text-foreground text-lg">Ocean</span>
          <div className="w-9" />
        </div>

        {workspaceHostHealth !== 'online' && (
          <div role="status" className="px-4 py-1 text-xs text-muted-foreground">
            {i18n.language.startsWith('zh')
              ? { starting: '正在启动本机 Workspace Host', reconnecting: '本机 Workspace Host 正在重连',
                  unauthorized: '本机 Workspace Host 凭证被拒绝', unavailable: '本机 Workspace Host 不可用',
                  'signed-out': '本机 Workspace Host 已停止' }[workspaceHostHealth]
              : { starting: 'Starting local Workspace Host', reconnecting: 'Local Workspace Host reconnecting',
                  unauthorized: 'Local Workspace Host credential rejected', unavailable: 'Local Workspace Host unavailable',
                  'signed-out': 'Local Workspace Host stopped' }[workspaceHostHealth]}
          </div>
        )}
        {/* Main Content Area */}
        <div className="flex-1 flex overflow-hidden">
          {activeTab === 'chat' || !activeTab ? (
            <div className="flex-1 flex flex-col relative overflow-hidden">
              <ChatSession
                navigation={{
                  navigate,
                  pathname: location.pathname,
                  state: location.state,
                  key: location.key,
                  clearState: () => navigate(location.pathname, { replace: true, state: {} }),
                }}
                sessionId={sessionIdFromUrl ?? null}
                initialMessages={currentMessages}
                models={models}
                selectedModelId={selectedModelId}
                setSelectedModelId={setSelectedModelId}
                token={token}
                user={user}
                spaceId={activeSpaceId}
                workspacePath={conversations.find((conversation) => conversation.id === sessionIdFromUrl)?.workspacePath}
                workspaceSnapshot={conversations.find((conversation) => conversation.id === sessionIdFromUrl)?.workspaceSnapshot}
                workspacePaths={workspacePaths}
                workspaceSnapshots={workspaceSnapshots}
                workspaceHost={{ hostId: workspaceHostInfo?.hostId, health: workspaceHostHealth }}
                onWorkspacePathChange={handleWorkspacePathChange}
                canSelectWorkspaceFolder
                spaceTabs={spaceTabs}
                onSpaceTabChange={handleSpaceTabChange}
                createSession={createSession}
                onStreamFinished={onStreamFinished}
                onRenameConversation={handleRenameChat}
                isLoadingHistory={isLoadingMessages}
                onMainTabChange={(id: string) => setActiveTab(id)}
                t={t}
              />
            </div>
          ) : activeTab === 'all_chats' ? (
            <AllChatsManager
              conversations={spaceConversations}
              onLoadConversation={loadConversationAndActivate}
              onDeleteConversations={handleDeleteConversations}
            />
          ) : activeTab === 'workflows' ? (
            <WorkProjection token={token} />
          ) : activeTab === 'library' ? (
            <SkillLibrary token={token} onMainTabChange={setActiveTab} />
          ) : activeTab === 'skill_studio' ? (
            <SkillManager token={token} onMainTabChange={setActiveTab} user={user} />
          ) : activeTab === 'projects' ? (
            activeProject?.id ? (
              <KnowledgeBase 
                projectId={activeProject.id} 
                onBack={() => setActiveProjectId(null)} 
              />
            ) : (
              <Projects />
            )
          ) : (
            <UIGallery />
          )}
        </div>

      </main>
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onNavigateSettings={() => {
          setIsMainSettingsOpen(true);
          setIsSettingsOpen(false);
        }}
        onLogout={handleLogout}
        onPreferencesUpdate={(preferences) => {
          setUser((currentUser: any) => currentUser && { ...currentUser, preferences });
        }}
        user={user}
      />
      <SettingsDialog 
        isOpen={isMainSettingsOpen} 
        onClose={() => setIsMainSettingsOpen(false)} 
        token={token} 
        onProfileUpdate={(updatedUser: any) => setUser(updatedUser)}
        onSignOut={() => {
          setIsMainSettingsOpen(false);
          return handleLogout();
        }}
        onConversationsCleared={async () => {
          await refreshConversations();
          navigate('/');
        }}
      />
    </div>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<AppContent />} />
      <Route path="/chat/:id" element={<AppContent />} />
    </Routes>
  );
}

export default App;
