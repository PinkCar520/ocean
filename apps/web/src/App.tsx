"use client";

import { TooltipProvider } from "@ocean/ui/components/ui/tooltip";
import '@ocean/ui/lib/i18n';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  Sparkles,
  Cloud,
  Cpu,
  Menu,
} from 'lucide-react'
import { ChatSession } from '@ocean/ui/components/ChatSession';
import { useTranslation } from 'react-i18next';
import { Sidebar } from '@ocean/ui/components/Sidebar';
import { useConversations } from '@ocean/ui/lib/useConversations';
import { cn } from '@ocean/ui/lib/utils';
import { api } from '@ocean/ui/lib/api-client';
import { logout } from './app/actions/auth';
import { createSession, deleteSession, renameSession } from './app/actions/sessions';
import { createProject, deleteProject } from './app/actions/projects';
import { installSkill, uninstallSkill } from './app/actions/skills';

import { WorkspaceProvider, useWorkspace } from '@ocean/ui/contexts/WorkspaceContext';
import { SpaceSwitcher, type SpaceOption } from './components/SpaceSwitcher';
import { CodeProjection } from './components/CodeProjection';
import { WorkProjection } from './components/WorkProjection';
import { LifeProjection } from './components/LifeProjection';

const MODEL_ICONS: Record<string, any> = { Sparkles, Cloud, Cpu, Zap: Sparkles };
const WEB_SESSION_ACTIONS = { create: createSession, rename: renameSession, delete: deleteSession };
const WEB_PROJECT_ACTIONS = { create: createProject, delete: deleteProject };
const WEB_SKILL_ACTIONS = { install: installSkill, uninstall: uninstallSkill };

const AllChatsManager = dynamic(() => import('@ocean/ui/components/AllChatsManager').then(module => module.AllChatsManager));
const KnowledgeBase = dynamic(() => import('@ocean/ui/components/KnowledgeBase').then(module => module.KnowledgeBase));
const Projects = dynamic(() => import('@ocean/ui/components/Projects').then(module => module.Projects));
const SkillLibrary = dynamic(() => import('@ocean/ui/components/SkillLibrary').then(module => module.SkillLibrary));
const SkillManager = dynamic(() => import('@ocean/ui/components/SkillManager').then(module => module.SkillManager));
const UIGallery = dynamic(() => import('@ocean/ui/components/UIGallery').then(module => module.UIGallery));
const SettingsDialog = dynamic(() => import('@ocean/ui/components/Settings/SettingsDialog').then(module => module.SettingsDialog));
const SettingsModal = dynamic(() => import('@ocean/ui/components/SettingsModal').then(module => module.SettingsModal));
const UpgradeModal = dynamic(() => import('@ocean/ui/components/UpgradeModal').then(module => module.UpgradeModal));

function formatModels(models: any[]) {
  return models.map((model: any) => ({
    ...model,
    icon: MODEL_ICONS[model.icon] || Sparkles,
  }));
}

interface AppProps {
  sessionId?: string;
  initialAuthenticated?: boolean;
  initialUser?: Record<string, unknown> | null;
  initialConversations?: any[];
  initialMessages?: any[];
  initialModels?: any[];
  initialProjects?: any[];
  initialSkills?: any[];
  initialSkillStats?: any;
  initialTab?: string;
  initialActiveProject?: any;
  initialKnowledgeDocuments?: any[];
  initialKnowledgeStats?: any;
}

function AppContent({
  sessionId: sessionIdFromUrl,
  initialAuthenticated = false,
  initialUser = null,
  initialConversations = [],
  initialMessages = [],
  initialModels = [],
  initialProjects = [],
  initialSkills = [],
  initialSkillStats = {},
  initialTab,
  initialActiveProject = null,
  initialKnowledgeDocuments,
  initialKnowledgeStats,
}: AppProps) {

  // ── Global Authentication & Identity State ──
  const token = initialAuthenticated ? 'cookie' : null;
  const [user, setUser] = useState<any>(initialUser);

  return (
    <TooltipProvider delayDuration={0}>
      <WorkspaceProvider token={token} initialActiveProject={initialActiveProject}>
        <AppInternal
          token={token}
          user={user}
          setUser={setUser}
          sessionIdFromUrl={sessionIdFromUrl}
          initialConversations={initialConversations}
          initialMessages={initialMessages}
          isServerBootstrapped={initialAuthenticated}
          initialModels={initialModels}
          initialProjects={initialProjects}
          initialSkills={initialSkills}
          initialSkillStats={initialSkillStats}
          initialTab={initialTab}
          initialActiveProject={initialActiveProject}
          initialKnowledgeDocuments={initialKnowledgeDocuments}
          initialKnowledgeStats={initialKnowledgeStats}
        />
      </WorkspaceProvider>
    </TooltipProvider>
  );
}

function AppInternal({
  token,
  user,
  setUser,
  sessionIdFromUrl,
  initialConversations,
  initialMessages,
  isServerBootstrapped,
  initialModels,
  initialProjects,
  initialSkills,
  initialSkillStats,
  initialTab,
  initialActiveProject,
  initialKnowledgeDocuments,
  initialKnowledgeStats,
}: any) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const activeTab = initialTab ?? (
    pathname.startsWith('/app/chats') ? 'all_chats'
      : pathname.startsWith('/app/skills/studio') ? 'skill_studio'
        : pathname.startsWith('/app/skills') ? 'library'
          : pathname.startsWith('/app/projects') ? 'projects'
            : pathname.startsWith('/app/workflows') ? 'workflows'
              : 'chat'
  );
  const navigationStateKey = `ocean_navigation_state:${pathname}`;
  const [navigationState, setNavigationState] = useState<unknown>(() => {
    if (typeof window === 'undefined') return undefined;
    const value = sessionStorage.getItem(navigationStateKey);
    if (!value) return undefined;
    try { return JSON.parse(value); } catch { return undefined; }
  });
  const navigate = useCallback((path: string, options?: { replace?: boolean; state?: unknown }) => {
    const nextPath = path === '/chat' || path.startsWith('/chat/')
      ? `/app${path}`
      : path;
    if (options?.state !== undefined) {
      sessionStorage.setItem(`ocean_navigation_state:${nextPath}`, JSON.stringify(options.state));
    }
    setNavigationState(options?.state);
    if (options?.replace) router.replace(nextPath);
    else router.push(nextPath);
  }, [router]);
  const navigation = useMemo(() => ({
    navigate,
    pathname,
    state: navigationState,
    key: `${pathname}:${sessionIdFromUrl ?? 'new'}`,
    clearState: () => {
      sessionStorage.removeItem(navigationStateKey);
      setNavigationState(undefined);
    },
  }), [navigate, navigationState, navigationStateKey, pathname, sessionIdFromUrl]);
  const { activeProject, setActiveProjectId } = useWorkspace();

  const handleMainTabChange = useCallback((tab: string) => {
    const routes: Record<string, string> = {
      chat: '/app',
      all_chats: '/app/chats',
      library: '/app/skills',
      skill_studio: '/app/skills/studio',
      projects: '/app/projects',
      workflows: '/app/workflows',
    };
    navigate(routes[tab] ?? '/app');
  }, [navigate]);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false); // Used for UserMenu Popover
  const [isMainSettingsOpen, setIsMainSettingsOpen] = useState(false); // Used for Settings Dialog Modal
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    const saved = localStorage.getItem('ocean_sidebar_collapsed');
    return saved === 'true';
  });
  const [models, setModels] = useState<any[]>(() => formatModels(initialModels));
  const [selectedModelId, setSelectedModelId] = useState(() => {
    if (typeof window === 'undefined') return '';
    const savedModelId = localStorage.getItem('ocean_selected_model') || '';
    if (initialModels.some((model: any) => model.id === savedModelId)) return savedModelId;
    const preferredModelId = user?.preferences?.defaultModel;
    return initialModels.some((model: any) => model.id === preferredModelId)
      ? preferredModelId
      : initialModels[0]?.id || '';
  });

  const toggleSidebar = () => {
    const newState = !isSidebarCollapsed;
    setIsSidebarCollapsed(newState);
    localStorage.setItem('ocean_sidebar_collapsed', String(newState));
  };

  const handleLogout = async () => {
    await logout();
  };

  // ── Phase 6：Space 切换与当前身份 ──
  const [activeSpaceId, setActiveSpaceId] = useState<string>(() => {
    if (typeof window === 'undefined') return 'work';
    return localStorage.getItem('ocean_active_space') ?? 'work';
  });
  const [spaces, setSpaces] = useState<SpaceOption[]>([]);

  useEffect(() => {
    localStorage.setItem('ocean_active_space', activeSpaceId);
  }, [activeSpaceId]);

  // 加载可用 Space 列表；缺省 Work 兜底；当前 Space 不存在时创建 Life
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const json = await api.get<any>('/api/spaces');
        const list: SpaceOption[] = Array.isArray(json?.data) ? json.data : [];
        if (!cancelled) setSpaces(list);
        const hasActive = list.some((sp) => sp.id === activeSpaceId);
        if (!hasActive && activeSpaceId !== 'work') {
          const life = await api.post<any>('/api/spaces/life', {});
          if (!cancelled && life?.data?.id) {
            setSpaces((prev) =>
              prev.some((sp) => sp.id === life.data.id)
                ? prev
                : [...prev, { id: life.data.id, name: '生活空间', type: 'life', role: 'owner' }],
            );
          }
        }
      } catch (err) {
        console.error('[Space] failed to load spaces:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [activeSpaceId]);

  const handleSpaceChange = (spaceId: string) => {
    setActiveSpaceId(spaceId);
    navigate('/app');
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
    initialConversations,
    initialMessages,
    isServerBootstrapped,
    sessionActions: WEB_SESSION_ACTIONS,
    spaceId: activeSpaceId,
  });

  // 当前 Space 的会话（Work 无 spaceId 的历史会话视作 Work）
  const spaceConversations = useMemo(
    () => conversations.filter((c: any) => (c.spaceId ?? 'work') === activeSpaceId),
    [conversations, activeSpaceId],
  );

  // Sync Global Settings from User Profile
  useEffect(() => {
    if (user?.preferences) {
      // Sync Theme
      if (user.preferences.theme) {
        const applyTheme = (theme: string) => {
          document.documentElement.classList.remove('light', 'dark');
          if (theme === 'system') {
            const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            document.documentElement.classList.add(isDark ? 'dark' : 'light');
            document.documentElement.setAttribute('data-color-mode', isDark ? 'dark' : 'light');
          } else {
            document.documentElement.classList.add(theme);
            document.documentElement.setAttribute('data-color-mode', theme);
          }
        };

        applyTheme(user.preferences.theme);

        if (user.preferences.theme === 'system') {
          const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
          const handler = () => applyTheme('system');
          mediaQuery.addEventListener('change', handler);
          return () => mediaQuery.removeEventListener('change', handler);
        }
      }
      
      // Sync Language
      if (user.preferences.language && i18n.language !== user.preferences.language) {
        i18n.changeLanguage(user.preferences.language);
      }
      
    }
  }, [user, i18n]);

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
    loadConversation(id);
  };

  const handleNewChatAndActivate = () => {
    handleNewChat();
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

        const formattedModels = formatModels(data);

        setModels(formattedModels);
        if (formattedModels.length > 0) {
          setSelectedModelId((currentModelId: string) => {
            if (formattedModels.some((model: any) => model.id === currentModelId)) return currentModelId;
            const preferredModelId = user?.preferences?.defaultModel;
            return formattedModels.some((model: any) => model.id === preferredModelId)
              ? preferredModelId
              : formattedModels[0].id;
          });
        }
      } catch (err) {
        console.error('Failed to fetch models:', err);
      }
    };
    if (token && !isServerBootstrapped) fetchModels();
  }, [token, isServerBootstrapped, user?.preferences?.defaultModel]);

  if (!token) {
    return null;
  }

  if (!isInitialized) {
    return <div className="h-screen w-full flex items-center justify-center bg-muted"><div className="animate-pulse font-bold text-muted-foreground">Loading...</div></div>;
  }

  return (
    <div className="flex h-screen w-full bg-muted font-sans selection:bg-primary/10 selection:text-primary">
      {/* 1. 侧边栏 (Fixed App Shell) */}
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        isCollapsed={isSidebarCollapsed}
        onToggle={toggleSidebar}
        activeMainTab={activeTab}
        onMainTabChange={handleMainTabChange}
        onOpenProject={(id: string) => navigate(`/app/projects/${id}`)}
        onOpenSettings={() => { setIsSettingsOpen(true); }}
        onNewChat={handleNewChatAndActivate}
        conversations={spaceConversations}
        currentChatId={sessionIdFromUrl ?? null}
        onLoadConversation={loadConversationAndActivate}
        onRenameConversation={handleRenameChat}
        onDeleteConversation={handleDeleteChat}
        onFavoriteConversation={() => { }} // Favorite 功能可后续实现
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
          <SpaceSwitcher spaces={spaces.length ? spaces : [{ id: 'work', name: '工作空间', type: 'work' }]} activeSpaceId={activeSpaceId} onChange={handleSpaceChange} />
        </div>

        {/* Space 切换条（Phase 6） */}
        <div className="hidden md:flex items-center justify-between px-4 py-1.5 border-b border-border bg-card/50 shrink-0">
          <SpaceSwitcher spaces={spaces.length ? spaces : [{ id: 'work', name: '工作空间', type: 'work' }]} activeSpaceId={activeSpaceId} onChange={handleSpaceChange} />
          <span className="text-xs text-muted-foreground">当前身份：{spaces.find((sp) => sp.id === activeSpaceId)?.name ?? activeSpaceId}</span>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex overflow-hidden">
          {activeSpaceId === 'code' ? (
            <CodeProjection token={token} />
          ) : activeSpaceId?.startsWith('life-') ? (
            <LifeProjection token={token} />
          ) : activeTab === 'chat' || !activeTab ? (
            <div className="flex-1 flex flex-col relative overflow-hidden">
              <ChatSession
                navigation={navigation}
                sessionId={sessionIdFromUrl ?? null}
                initialMessages={currentMessages}
                models={models}
                selectedModelId={selectedModelId}
                setSelectedModelId={setSelectedModelId}
                token={token}
                user={user}
                spaceId={activeSpaceId}
                createSession={createSession}
                onStreamFinished={onStreamFinished}
                onRenameConversation={handleRenameChat}
                isLoadingHistory={isLoadingMessages}
                t={t}
              />
            </div>
          ) : activeTab === 'all_chats' ? (
            <AllChatsManager
              conversations={spaceConversations}
              onLoadConversation={loadConversationAndActivate}
              onDeleteConversations={handleDeleteConversations}
            />
          ) : activeTab === 'library' ? (
            <SkillLibrary
              token={token}
              onMainTabChange={handleMainTabChange}
              initialSkills={initialSkills}
              initialStats={initialSkillStats}
              skillActions={WEB_SKILL_ACTIONS}
            />
          ) : activeTab === 'skill_studio' ? (
            <SkillManager token={token} onMainTabChange={handleMainTabChange} user={user} />
          ) : activeTab === 'projects' ? (
            activeProject?.id ? (
              <KnowledgeBase
                projectId={activeProject.id}
                onBack={() => {
                  setActiveProjectId(null);
                  navigate('/app');
                }}
                initialProject={initialActiveProject ?? activeProject}
                initialDocuments={initialKnowledgeDocuments}
                initialStats={initialKnowledgeStats}
              />
            ) : (
              <Projects
                initialProjects={initialProjects}
                onOpenProject={(project) => navigate(`/app/projects/${project.id}`)}
                projectActions={WEB_PROJECT_ACTIONS}
              />
            )
          ) : activeTab === 'workflows' ? (
            <WorkProjection token={token} />
          ) : (
            <UIGallery />
          )}
        </div>

      </main>
      {isSettingsOpen && <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onNavigateSettings={() => {
          setIsMainSettingsOpen(true);
          setIsSettingsOpen(false);
        }}
        onUpgradeClick={() => {
          setIsUpgradeModalOpen(true);
          setIsSettingsOpen(false);
        }}
        onLogout={handleLogout}
        user={user}
      />}
      {isUpgradeModalOpen && <UpgradeModal
        isOpen={isUpgradeModalOpen}
        onClose={() => setIsUpgradeModalOpen(false)}
      />}
      {isMainSettingsOpen && <SettingsDialog
        isOpen={isMainSettingsOpen}
        onClose={() => setIsMainSettingsOpen(false)}
        token={token}
        onProfileUpdate={(updatedUser: any) => setUser(updatedUser)}
        onConversationsCleared={async () => {
          await refreshConversations();
          navigate('/app');
        }}
      />}
    </div>
  );
}

function App({
  sessionId,
  initialAuthenticated,
  initialUser,
  initialConversations,
  initialMessages,
  initialModels,
  initialProjects,
  initialSkills,
  initialSkillStats,
  initialTab,
  initialActiveProject,
  initialKnowledgeDocuments,
  initialKnowledgeStats,
}: AppProps) {
  return (
    <AppContent
      sessionId={sessionId}
      initialAuthenticated={initialAuthenticated}
      initialUser={initialUser}
      initialConversations={initialConversations}
      initialMessages={initialMessages}
      initialModels={initialModels}
      initialProjects={initialProjects}
      initialSkills={initialSkills}
      initialSkillStats={initialSkillStats}
      initialTab={initialTab}
      initialActiveProject={initialActiveProject}
      initialKnowledgeDocuments={initialKnowledgeDocuments}
      initialKnowledgeStats={initialKnowledgeStats}
    />
  );
}

export default App;
