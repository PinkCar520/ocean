import React, { useState, useEffect, useCallback } from 'react';
import {
  FolderRoot, Search, ArrowUpDown, Plus,
  Sparkles, X, Loader2, ArrowRight, Trash2, Database, Clock
} from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api-client';
import { useWorkspace } from '../contexts/WorkspaceContext';

export function Projects() {
  const { t } = useTranslation();
  const { setActiveProjectId } = useWorkspace();

  // State
  const [projects, setProjects] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'assets'>('newest');
  const [isLoading, setIsLoading] = useState(true);

  // New Project Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [creationMode, setCreationMode] = useState<'CLOUD' | 'LOCAL'>('CLOUD');
  const [newProject, setNewProject] = useState({ name: '', category: 'Engineering', description: '' });
  const [isCreating, setIsCreating] = useState(false);

  const fetchProjects = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get<any>('/api/knowledge-projects');
      if (res.success) {
        setProjects(res.data);
      }
    } catch (err) {
      console.error('Failed to fetch projects:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const [isPickingPath, setIsPickingPath] = useState(false);

  const handlePickLocalPath = async () => {
    setIsPickingPath(true);
    try {
      // 发起 RPC 请求，要求本地助手打开文件夹选择器
      const res = await api.post<any>('/api/user/node/open-folder-picker');
      if (res.success && res.path) {
        setNewProject({ ...newProject, description: `${newProject.description} (path:${res.path})` });
      }
    } catch (err) {
      console.error('Failed to trigger local picker:', err);
      // 如果助手未连接，给出友好提示
      alert('无法调起本地助手。请确保 Ocean 本地助手（Daemon）已启动并处于登录状态。');
    } finally {
      setIsPickingPath(false);
    }
  };


  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    try {
      let finalDescription = newProject.description || '';

      // 如果是本地模式，且未选择路径，则报错
      if (creationMode === 'LOCAL' && !finalDescription.includes('(path:')) {
         alert('请选择本地项目路径！');
         setIsCreating(false);
         return;
      }

      // 如果是云端项目，加上标识
      if (creationMode === 'CLOUD') {
         finalDescription += ' [CLOUD]';
      }

      // 1. 本地模式下的目录创建（可选扩展）
      // ...

      // 2. 将项目元数据存入云端数据库
      const res = await api.post<any>('/api/knowledge-projects', {
        ...newProject,
        description: finalDescription
      });

      if (res.success) {
        setIsModalOpen(false);
        setNewProject({ name: '', category: 'Engineering', description: '' });
        await fetchProjects();
      }
    } catch (err) {
      console.error('Failed to create project:', err);
      alert('创建项目失败，请检查网络或本地助手连接。');
    } finally {
      setIsCreating(false);
    }
  };

  const filteredProjects = projects
    .filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.category.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return (b._count?.documents || 0) - (a._count?.documents || 0);
    });

  return (
    <div className="flex-1 overflow-y-auto bg-background font-sans text-foreground p-10 relative pb-32">
      <div className="max-w-7xl mx-auto space-y-10 w-full">

        {/* Header Section */}
        <section className="flex flex-col md:flex-row justify-between items-center gap-6 pb-6 border-b border-border/50">
          <div className="flex items-center gap-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-foreground">{t('projects.title', 'Projects')}</h2>
              <p className="text-sm text-muted-foreground mt-1">{t('projects.subtitle', 'Manage and orchestrate your enterprise knowledge assets.')}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            {/* Search */}
            <div className="relative flex-1 md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={t('projects.search_placeholder', 'Search projects...')}
                className="w-full bg-transparent border border-border/60 hover:border-border rounded-lg pl-9 pr-4 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary/30 transition-all placeholder:text-muted-foreground/50"
              />
            </div>

            {/* Sort Toggle */}
            <button
              onClick={() => setSortBy(sortBy === 'newest' ? 'assets' : 'newest')}
              className="p-1.5 bg-transparent border border-border/60 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              title={sortBy === 'newest' ? t('projects.sort.newest') : t('projects.sort.assets')}
            >
              <ArrowUpDown className="w-4 h-4" />
            </button>

            {/* Create Dropdown or Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setCreationMode('CLOUD'); setIsModalOpen(true); }}
                className="bg-foreground text-background px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-foreground/90 transition-all shadow-sm"
              >
                <Plus className="w-4 h-4" />
                {t('projects.new_cloud', 'New Cloud Project')}
              </button>
              <button
                onClick={() => { setCreationMode('LOCAL'); setIsModalOpen(true); }}
                className="bg-transparent border border-border/60 text-foreground px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-muted/50 transition-all"
              >
                <FolderRoot className="w-4 h-4 text-muted-foreground" />
                {t('projects.import_local', 'Import Local')}
              </button>
            </div>
          </div>
        </section>

        {/* Projects Grid */}
        <section className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6 pt-4">
          {isLoading ? (
            <div className="col-span-full py-20 flex flex-col items-center justify-center">
              <Loader2 className="w-8 h-8 text-primary animate-spin mb-2" />
              <p className="text-muted-foreground font-medium">{t('common.syncing')}</p>
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="col-span-full py-24 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-foreground/5 to-transparent border border-border/50 flex items-center justify-center mb-6 shadow-sm">
                <FolderRoot className="w-8 h-8 text-muted-foreground/60" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">{t('projects.empty', 'No projects found')}</h3>
              <p className="text-sm text-muted-foreground max-w-sm mb-6 leading-relaxed">
                {t('projects.empty_desc', 'Get started by creating a new cloud project or importing an existing local one.')}
              </p>
              <button
                onClick={() => setIsModalOpen(true)}
                className="bg-foreground text-background px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-foreground/90 transition-all shadow-sm"
              >
                <Plus className="w-4 h-4" />
                {t('projects.create_first', 'Create Project')}
              </button>
            </div>
          ) : (
            filteredProjects.map((project) => (
              <motion.div
                layoutId={project.id}
                key={project.id}
                className="bg-card flex flex-col rounded-[16px] border border-border/50 hover:border-border hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:hover:shadow-[0_8px_30px_rgb(0,0,0,0.2)] transition-all overflow-hidden group cursor-pointer relative"
              >
                {/* Delete Button Overlay */}
                <div className="absolute top-3 right-3 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (confirm(`确定要删除项目 "${project.name}" 吗？此操作不可恢复。`)) {
                        try {
                          await api.delete(`/api/knowledge-projects/${project.id}`);
                          await fetchProjects();
                        } catch (err) {
                          console.error('Delete failed:', err);
                          alert('删除失败');
                        }
                      }
                    }}
                    className="bg-background/80 backdrop-blur-md text-muted-foreground p-1.5 rounded-md border border-border/50 hover:bg-red-500 hover:text-white hover:border-red-500 shadow-sm transition-all"
                    title="删除项目"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="relative h-48 w-full shrink-0 overflow-hidden bg-muted/30" onClick={() => setActiveProjectId(project.id)}>
                  <div className="absolute inset-0 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.05)] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)] z-10 pointer-events-none mix-blend-overlay"></div>
                  <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/20 to-transparent z-10 pointer-events-none"></div>
                  <img
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                    src={project.iconUrl || "https://images.unsplash.com/photo-1589829085413-56de8ae18c73?auto=format&fit=crop&q=80&w=800"}
                    alt={project.name}
                  />
                </div>
                
                <div className="p-4 flex flex-col flex-1">
                  <div className="flex items-center gap-2 mb-3">
                    <span className={cn(
                      "px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-md border",
                      project.description?.includes('(path:') 
                        ? "bg-muted text-muted-foreground border-border/50" 
                        : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                    )}>
                      {project.description?.includes('(path:') ? 'Local' : 'Cloud'}
                    </span>
                    <span className="px-2 py-0.5 bg-muted/50 text-muted-foreground border border-border/50 text-[10px] font-semibold uppercase tracking-wider rounded-md">
                      {project.category}
                    </span>
                  </div>
                  
                  <h4 className="text-lg font-bold group-hover:text-primary transition-colors truncate mb-1" title={project.name}>{project.name}</h4>
                  
                  {(() => {
                    const desc = project.description?.replace(/\[CLOUD\]|\(path:.*?\)/g, '').trim();
                    return desc ? (
                      <p className="text-muted-foreground text-xs line-clamp-2 leading-relaxed mb-4 flex-1">{desc}</p>
                    ) : (
                      <div className="mb-4 flex-1"></div>
                    );
                  })()}
                  
                  <div className="flex items-center justify-between pt-3 mt-auto border-t border-border/40">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Database className="w-3.5 h-3.5" />
                      <span className="text-xs font-medium">{project._count?.documents || 0} Assets</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground/60">
                      <Clock className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-medium">{new Date(project.updatedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </section>

      </div>

      {/* New Project Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-card w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-2xl font-display font-bold">
                    {creationMode === 'LOCAL' ? '导入本地项目' : '新建云端项目'}
                  </h3>
                  <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-muted rounded-full">
                    <X className="w-5 h-5 text-muted-foreground" />
                  </button>
                </div>

                <form onSubmit={handleCreateProject} className="space-y-6">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">{t('projects.create_modal.name_label')}</label>
                    <input
                      required
                      value={newProject.name}
                      onChange={e => setNewProject({ ...newProject, name: e.target.value })}
                      placeholder={t('projects.create_modal.name_placeholder')}
                      className="w-full bg-muted border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary/20 outline-none font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">{t('projects.create_modal.category_label')}</label>
                    <select
                      value={newProject.category}
                      onChange={e => setNewProject({ ...newProject, category: e.target.value })}
                      className="w-full bg-muted border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary/20 outline-none font-medium appearance-none"
                    >
                      <option value="Finance">💰 财务与审计项目</option>
                      <option value="HR">👥 人事与招聘项目</option>
                      <option value="Legal">⚖️ 法务与合规项目</option>
                      <option value="Engineering">💻 研发与工程项目</option>
                      <option value="Operations">📊 业务运营项目</option>
                    </select>
                  </div>

                  {creationMode === 'LOCAL' && (
                    <div className="bg-muted/50 p-4 rounded-2xl border border-border/50">
                      <div className="flex items-center justify-between mb-4">
                        <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">本地工作文件夹 (私有化保护)</label>
                      </div>

                      <div className="flex gap-2">
                        <div className="flex-1 bg-card rounded-xl px-4 py-3 text-sm text-muted-foreground truncate font-medium border border-border">
                          {newProject.description?.includes('path:') ? newProject.description.split('path:')[1].split(')')[0] : '点击选择本地工作文件夹...'}
                        </div>
                        <button 
                          type="button"
                          onClick={handlePickLocalPath}
                          disabled={isPickingPath}
                          className="bg-card border border-border px-4 rounded-xl text-xs font-bold hover:bg-muted transition-all disabled:opacity-50 flex items-center gap-2 shadow-sm"
                        >
                          {isPickingPath ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                          浏览
                        </button>
                      </div>
                      <p className="mt-3 text-[10px] text-muted-foreground/80 font-medium leading-relaxed">
                        💡 原始资料和索引将仅保存在您的本地电脑中，绝不会上传至云端。
                      </p>
                    </div>
                  )}

                  {creationMode === 'CLOUD' && (
                    <div className="bg-primary/5 p-4 rounded-2xl border border-primary/20">
                      <p className="text-[11px] text-primary font-medium leading-relaxed flex items-center gap-2">
                        <Sparkles className="w-4 h-4 shrink-0" />
                        这是一个云端协作项目。文件将被加密存储于云端，并建立云端 RAG 知识库，支持跨设备漫游与团队共享。
                      </p>
                    </div>
                  )}

                  <button
                    disabled={isCreating}
                    type="submit"
                    className="w-full bg-primary text-white py-4 rounded-xl font-bold text-sm shadow-lg shadow-[#EC5B14]/20 hover:bg-[#cc4900] transition-all flex items-center justify-center gap-2"
                  >
                    {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    {t('projects.create_modal.submit')}
                  </button>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
