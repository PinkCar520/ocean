import React, { useState, useEffect, useCallback } from 'react';
import {
  FolderRoot, Search, ArrowUpDown, Plus,
  Sparkles, X, Loader2, ArrowRight, Trash2
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
        <section className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-4">
            <div>
              <h2 className="text-3xl font-display font-extrabold tracking-tight text-foreground">{t('projects.title')}</h2>
              <p className="text-muted-foreground font-medium">{t('projects.subtitle')}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            {/* Search */}
            <div className="relative flex-1 md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={t('projects.search_placeholder')}
                className="w-full bg-card border border-border rounded-lg pl-10 pr-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/10 transition-all"
              />
            </div>

            {/* Sort Toggle */}
            <button
              onClick={() => setSortBy(sortBy === 'newest' ? 'assets' : 'newest')}
              className="p-2 bg-card border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors"
              title={sortBy === 'newest' ? t('projects.sort.newest') : t('projects.sort.assets')}
            >
              <ArrowUpDown className="w-4 h-4" />
            </button>

            {/* Create Dropdown or Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setCreationMode('CLOUD'); setIsModalOpen(true); }}
                className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 shadow-md hover:bg-primary/90 transition-all"
              >
                <Plus className="w-4 h-4" />
                新建云端项目
              </button>
              <button
                onClick={() => { setCreationMode('LOCAL'); setIsModalOpen(true); }}
                className="bg-card border border-border text-foreground px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 hover:bg-muted transition-all"
              >
                <FolderRoot className="w-4 h-4 text-primary" />
                导入本地项目
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
            <div className="col-span-full py-20 text-center bg-card rounded-2xl border border-dashed border-border">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <FolderRoot className="text-muted-foreground/80 w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold mb-1">{t('projects.empty')}</h3>
              <p className="text-muted-foreground mb-6">{t('projects.empty_desc')}</p>
              <button
                onClick={() => setIsModalOpen(true)}
                className="text-primary font-bold text-sm flex items-center gap-1 mx-auto hover:underline"
              >
                {t('projects.create_first')} <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            filteredProjects.map((project) => (
              <motion.div
                layoutId={project.id}
                key={project.id}
                className="bg-card flex flex-col rounded-[20px] shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-transparent hover:border-primary/30 hover:shadow-[0_10px_30px_rgba(236,91,20,0.05)] transition-all overflow-hidden group cursor-pointer relative"
              >
                {/* Delete Button Overlay */}
                <div className="absolute top-4 left-4 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
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
                    className="bg-black/40 backdrop-blur-md text-white p-2 rounded-full border border-white/20 hover:bg-red-500 hover:border-red-500 shadow-sm transition-all active:scale-95"
                    title="删除项目"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="relative h-44 w-full shrink-0 overflow-hidden bg-muted" onClick={() => setActiveProjectId(project.id)}>
                  <img
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                    src={project.iconUrl || "https://images.unsplash.com/photo-1589829085413-56de8ae18c73?auto=format&fit=crop&q=80&w=800"}
                    alt={project.name}
                  />
                  {/* Tags overlaid on the image */}
                  <div className="absolute top-4 right-4 flex items-center gap-2">
                    <span className={cn(
                      "px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest rounded-md backdrop-blur-md shadow-sm",
                      project.description?.includes('(path:') 
                        ? "bg-black/40 text-white border border-white/20" 
                        : "bg-white/90 text-black border border-black/10 dark:bg-black/60 dark:text-white dark:border-white/20"
                    )}>
                      {project.description?.includes('(path:') ? '本地 💻' : '云端 ☁️'}
                    </span>
                  </div>
                  <div className="absolute bottom-4 left-4">
                    <span className="px-2.5 py-1 bg-primary/90 backdrop-blur-md text-white border border-white/20 shadow-sm text-[10px] font-bold uppercase tracking-widest rounded-md">
                      {project.category}
                    </span>
                  </div>
                </div>
                
                <div className="p-5 flex flex-col">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xl font-display font-bold group-hover:text-primary transition-colors truncate pr-4">{project.name}</h4>
                    <span className="text-[10px] text-muted-foreground font-medium shrink-0">{new Date(project.updatedAt).toLocaleDateString()}</span>
                  </div>
                  
                  {(() => {
                    const desc = project.description?.replace(/\[CLOUD\]|\(path:.*?\)/g, '').trim();
                    return desc ? (
                      <p className="text-muted-foreground text-sm mb-4 line-clamp-2 leading-relaxed">{desc}</p>
                    ) : (
                      <div className="mb-4"></div> /* Spacer if no description */
                    );
                  })()}
                  
                  <div className="flex items-center justify-between pt-4 border-t border-border/60">
                    <div className="flex -space-x-2">
                      <img className="w-7 h-7 rounded-full border-2 border-card object-cover shadow-sm" src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${project.id}`} alt="user" />
                    </div>
                    <div className="flex items-center gap-1.5 bg-muted/50 px-2.5 py-1 rounded-md border border-border/50">
                      <span className="text-[11px] font-black text-foreground">{project._count?.documents || 0}</span>
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-tighter">{t('projects.stats.assets')}</span>
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
