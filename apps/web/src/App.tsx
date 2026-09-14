"use client";

import { TooltipProvider } from "@ocean/ui/components/ui/tooltip";
import '@ocean/ui/lib/i18n';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Sparkles,
  Cloud,
  Cpu,
  Menu,
} from 'lucide-react'
import { ChatSession } from '@ocean/ui/components/ChatSession';
import { useTranslation } from 'react-i18next';
import { SettingsDialog } from '@ocean/ui/components/Settings/SettingsDialog';
import { UIGallery } from '@ocean/ui/components/UIGallery';
import { SkillLibrary } from '@ocean/ui/components/SkillLibrary';
import { KnowledgeBase } from '@ocean/ui/components/KnowledgeBase';
import { Projects } from '@ocean/ui/components/Projects';
import { AllChatsManager } from '@ocean/ui/components/AllChatsManager';
import { Sidebar } from '@ocean/ui/components/Sidebar';
import { SettingsModal } from '@ocean/ui/components/SettingsModal';
import { UpgradeModal } from '@ocean/ui/components/UpgradeModal';
import { AuthPage } from '@ocean/ui/components/AuthPage';
import { useConversations } from '@ocean/ui/lib/useConversations';
import { cn } from '@ocean/ui/lib/utils';
import { api } from '@ocean/ui/lib/api-client';
import { SkillManager } from '@ocean/ui/components/SkillManager';

import { WorkspaceProvider, useWorkspace } from '@ocean/ui/contexts/WorkspaceContext';

const MODEL_ICONS: Record<string, any> = { Sparkles, Cloud, Cpu, Zap: Sparkles };

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
  const [token, setToken] = useState<string | null>(initialAuthenticated ? 'cookie' : null);
  const [user, setUser] = useState<any>(initialUser);

  return (
    <TooltipProvider delayDuration={0}>
      <WorkspaceProvider token={token} initialActiveProject={initialActiveProject}>
        <AppInternal
          token={token}
          setToken={setToken}
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
  setToken,
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
  const navigationStateKey = `ocean_navigation_state:${pathname}`;
  const [navigationState, setNavigationState] = useState<unknown>(() => {
    if (typeof window === 'undefined') return undefined;
    const value = sessionStorage.getItem(navigationStateKey);
    if (!value) return undefined;
    try { return JSON.parse(value); } catch { return undefined; }
  });
  const navigate = useCallback((path: string, options?: { replace?: boolean; state?: unknown }) => {
    if (options?.state !== undefined) {
      sessionStorage.setItem(`ocean_navigation_state:${path}`, JSON.stringify(options.state));
    }
    setNavigationState(options?.state);
    if (options?.replace) router.replace(path);
    else router.push(path);
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

  const [activeTab, setActiveTab] = useState(() => {
    if (initialTab) return initialTab;
    if (typeof window === 'undefined') return 'chat';
    const saved = localStorage.getItem('ocean_active_tab');
    return saved || 'chat';
  });

  useEffect(() => {
    localStorage.setItem('ocean_active_tab', activeTab);
  }, [activeTab]);

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

  const handleLoginSuccess = (_newToken: string, userData: any) => {
    setToken('cookie');
    setUser(userData);
    const requestedPath = new URLSearchParams(window.location.search).get('next');
    navigate(requestedPath?.startsWith('/') && !requestedPath.startsWith('//') ? requestedPath : '/app', {
      replace: true,
    });
  };

  const handleLogout = async () => {
    await api.post('/api/auth/logout').catch(() => undefined);
    setToken(null);
    setUser(null);
    navigate('/auth', { replace: true });
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
  });

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
    return <AuthPage onLoginSuccess={handleLoginSuccess} />;
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
        onMainTabChange={(id: string) => { setActiveTab(id); }}
        onOpenSettings={() => { setIsSettingsOpen(true); }}
        onNewChat={handleNewChatAndActivate}
        conversations={conversations}
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
          <div className="w-9" />
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex overflow-hidden">
          {activeTab === 'chat' || !activeTab ? (
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
                createSession={createSession}
                onStreamFinished={onStreamFinished}
                onRenameConversation={handleRenameChat}
                isLoadingHistory={isLoadingMessages}
                t={t}
              />
            </div>
          ) : activeTab === 'all_chats' ? (
            <AllChatsManager
              conversations={conversations}
              onLoadConversation={loadConversationAndActivate}
              onDeleteConversations={handleDeleteConversations}
            />
          ) : activeTab === 'library' ? (
            <SkillLibrary
              token={token}
              onMainTabChange={setActiveTab}
              initialSkills={initialSkills}
              initialStats={initialSkillStats}
            />
          ) : activeTab === 'skill_studio' ? (
            <SkillManager token={token} onMainTabChange={setActiveTab} user={user} />
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
              />
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
        onUpgradeClick={() => {
          setIsUpgradeModalOpen(true);
          setIsSettingsOpen(false);
        }}
        onLogout={handleLogout}
        user={user}
      />
      <UpgradeModal
        isOpen={isUpgradeModalOpen}
        onClose={() => setIsUpgradeModalOpen(false)}
      />
      <SettingsDialog
        isOpen={isMainSettingsOpen}
        onClose={() => setIsMainSettingsOpen(false)}
        token={token}
        onProfileUpdate={(updatedUser: any) => setUser(updatedUser)}
        onConversationsCleared={async () => {
          await refreshConversations();
          navigate('/');
        }}
      />
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
