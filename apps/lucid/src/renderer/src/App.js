import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Routes, Route, useNavigate, useLocation, useParams } from 'react-router-dom';
import { Sparkles, Cloud, Cpu, Menu, } from 'lucide-react';
import { ChatSession } from '@uclaw/ui/components/ChatSession';
import { useTranslation } from 'react-i18next';
import { UserCenter } from '@uclaw/ui/components/UserCenter';
import { UIGallery } from '@uclaw/ui/components/UIGallery';
import { SkillLibrary } from '@uclaw/ui/components/SkillLibrary';
import { KnowledgeBase } from '@uclaw/ui/components/KnowledgeBase';
import { Projects } from '@uclaw/ui/components/Projects';
import { AllChatsManager } from '@uclaw/ui/components/AllChatsManager';
import { Sidebar } from '@uclaw/ui/components/Sidebar';
import { SettingsModal } from '@uclaw/ui/components/SettingsModal';
import { AuthPage } from '@uclaw/ui/components/AuthPage';
import { useConversations } from '@uclaw/ui/lib/useConversations';
import { cn } from '@uclaw/ui/lib/utils';
import { api } from '@uclaw/ui/lib/api-client';
import { WorkspaceProvider, useWorkspace } from '@uclaw/ui/contexts/WorkspaceContext';
function AppContent() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const { id: sessionIdFromUrl } = useParams();
    // ── Global Authentication & Identity State ──
    const [token, setToken] = useState(() => localStorage.getItem('uclaw_auth_token'));
    const [user, setUser] = useState(null);
    return (_jsx(WorkspaceProvider, { token: token, children: _jsx(AppInternal, { token: token, setToken: setToken, user: user, setUser: setUser, sessionIdFromUrl: sessionIdFromUrl }) }));
}
function AppInternal({ token, setToken, user, setUser, sessionIdFromUrl }) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { activeProject, setActiveProjectId } = useWorkspace();
    const [activeTab, setActiveTab] = useState(() => {
        const saved = localStorage.getItem('uclaw_active_tab');
        return saved || 'chat';
    });
    useEffect(() => {
        localStorage.setItem('uclaw_active_tab', activeTab);
    }, [activeTab]);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
        const saved = localStorage.getItem('uclaw_sidebar_collapsed');
        return saved === 'true';
    });
    const toggleSidebar = () => {
        setIsSidebarCollapsed((current) => {
            const newState = !current;
            localStorage.setItem('uclaw_sidebar_collapsed', String(newState));
            return newState;
        });
    };
    const handleLoginSuccess = (newToken, userData) => {
        localStorage.setItem('uclaw_auth_token', newToken);
        localStorage.setItem('uclaw_user_id', userData.workId);
        setToken(newToken);
        setUser(userData);
    };
    const handleLogout = () => {
        localStorage.removeItem('uclaw_auth_token');
        localStorage.removeItem('uclaw_user_id');
        setToken(null);
        setUser(null);
        navigate('/');
    };
    // ── Server-First 会话管理 ──
    const { isInitialized, conversations, currentMessages, isLoadingMessages, createSession, handleNewChat, loadConversation, handleRenameChat, handleDeleteConversations, onStreamFinished, } = useConversations({
        token,
        sessionId: sessionIdFromUrl ?? null,
        navigate,
        onAuthExpired: handleLogout,
        onUserProfile: setUser,
        t,
    });
    useEffect(() => {
        if (activeTab === 'chat')
            return;
        const tabNames = {
            library: t('sidebar.library'),
            workflows: t('sidebar.workflows'),
            projects: t('sidebar.projects') || 'Projects',
            settings: t('settings.title'),
            all_chats: t('sidebar.all_chats'),
        };
        const name = tabNames[activeTab] || activeTab.charAt(0).toUpperCase() + activeTab.slice(1);
        document.title = `uClaw - ${name}`;
    }, [activeTab, t]);
    const handleDeleteChat = (id) => {
        handleDeleteConversations([id]);
    };
    const loadConversationAndActivate = (id) => {
        loadConversation(id);
        setActiveTab('chat');
    };
    const handleNewChatAndActivate = () => {
        handleNewChat();
        setActiveTab('chat');
    };
    const [models, setModels] = useState([]);
    const [selectedModelId, setSelectedModelId] = useState(() => localStorage.getItem('uclaw_selected_model') || '');
    useEffect(() => {
        if (selectedModelId) {
            localStorage.setItem('uclaw_selected_model', selectedModelId);
        }
    }, [selectedModelId]);
    // 动态获取可用模型
    useEffect(() => {
        const fetchModels = async () => {
            try {
                const json = await api.get('/api/chat/models');
                const data = Array.isArray(json) ? json : (json.models || []);
                const iconMap = {
                    'Sparkles': Sparkles,
                    'Cloud': Cloud,
                    'Cpu': Cpu,
                    'Zap': Sparkles, // fallback for Zap icon
                };
                const formattedModels = data.map((m) => ({
                    ...m,
                    icon: iconMap[m.icon] || Sparkles
                }));
                setModels(formattedModels);
                if (formattedModels.length > 0) {
                    const exists = formattedModels.some((m) => m.id === selectedModelId);
                    if (!selectedModelId || !exists) {
                        setSelectedModelId(formattedModels[0].id);
                    }
                }
            }
            catch (err) {
                console.error('Failed to fetch models:', err);
            }
        };
        if (token)
            fetchModels();
    }, [token]);
    const [projects, setProjects] = useState([]);
    // 动态获取项目列表（供全局命令菜单使用）
    useEffect(() => {
        const fetchProjects = async () => {
            try {
                const res = await api.get('/api/knowledge-projects');
                if (res.success)
                    setProjects(res.data);
            }
            catch (err) {
                console.error('Failed to fetch projects for command menu:', err);
            }
        };
        if (token)
            fetchProjects();
    }, [token, activeTab]);
    if (!token) {
        return _jsx(AuthPage, { onLoginSuccess: handleLoginSuccess });
    }
    if (!isInitialized) {
        return _jsx("div", { className: "h-screen w-full flex items-center justify-center bg-[#f6f3f2]", children: _jsx("div", { className: "animate-pulse font-bold text-[#716B67]", children: "Loading..." }) });
    }
    return (_jsxs("div", { className: "flex h-screen w-full bg-[#f6f3f2] font-sans selection:bg-[#EC5B14]/10 selection:text-[#EC5B14]", children: [_jsx(Sidebar, { isOpen: isSidebarOpen, onClose: () => setIsSidebarOpen(false), isCollapsed: isSidebarCollapsed, onToggle: toggleSidebar, activeMainTab: activeTab, onMainTabChange: (id) => { setActiveTab(id); }, onOpenSettings: () => { setIsSettingsOpen(true); }, onNewChat: handleNewChatAndActivate, conversations: conversations, currentChatId: sessionIdFromUrl ?? null, onLoadConversation: loadConversationAndActivate, onRenameConversation: handleRenameChat, onDeleteConversation: handleDeleteChat, onFavoriteConversation: () => { }, user: user, onLogout: handleLogout }), _jsxs("main", { className: cn("flex-1 flex flex-col relative h-screen max-w-full overflow-hidden transition-all duration-300", isSidebarCollapsed ? "md:ml-0" : "md:ml-64"), children: [_jsxs("div", { className: "md:hidden flex items-center justify-between p-3 border-b border-[#E8E4E2] bg-white shrink-0 z-30", children: [_jsx("button", { onClick: () => setIsSidebarOpen(true), className: "p-2 -ml-2 text-[#716B67] hover:bg-[#F6F3F2] rounded-lg transition-colors", children: _jsx(Menu, { className: "w-5 h-5" }) }), _jsx("span", { className: "font-display font-bold text-[#1C1B1B] text-lg", children: "uClaw" }), _jsx("div", { className: "w-9" })] }), _jsx("div", { className: "flex-1 flex overflow-hidden", children: activeTab === 'chat' || !activeTab ? (_jsx("div", { className: "flex-1 flex flex-col relative overflow-hidden", children: _jsx(ChatSession, { sessionId: sessionIdFromUrl ?? null, initialMessages: currentMessages, models: models, selectedModelId: selectedModelId, setSelectedModelId: setSelectedModelId, token: token, user: user, createSession: createSession, onStreamFinished: onStreamFinished, onRenameConversation: handleRenameChat, isLoadingHistory: isLoadingMessages, t: t }) })) : activeTab === 'all_chats' ? (_jsx(AllChatsManager, { conversations: conversations, onLoadConversation: loadConversationAndActivate, onDeleteConversations: handleDeleteConversations })) : activeTab === 'settings' ? (_jsx(UserCenter, { token: token, onLogout: handleLogout })) : activeTab === 'library' ? (_jsx(SkillLibrary, { token: token })) : activeTab === 'projects' ? (activeProject?.id ? (_jsx(KnowledgeBase, { projectId: activeProject.id, onBack: () => setActiveProjectId(null) })) : (_jsx(Projects, {}))) : (_jsx(UIGallery, {})) })] }), _jsx(SettingsModal, { isOpen: isSettingsOpen, onClose: () => setIsSettingsOpen(false), onNavigateSettings: () => {
                    setActiveTab('settings');
                    setIsSettingsOpen(false);
                }, onLogout: handleLogout, user: user })] }));
}
function App() {
    return (_jsxs(Routes, { children: [_jsx(Route, { path: "/", element: _jsx(AppContent, {}) }), _jsx(Route, { path: "/chat/:id", element: _jsx(AppContent, {}) })] }));
}
export default App;
