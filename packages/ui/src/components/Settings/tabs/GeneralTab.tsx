import React, { useState, useEffect } from 'react';
import { ShieldCheck, Sun, Moon, Monitor } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from "../../../lib/utils";
import { useSettings } from '../SettingsContext';
import { api } from '../../../lib/api-client';

export function GeneralTab() {
  const { t, i18n } = useTranslation();
  const { userProfile, updatePreferences } = useSettings();

  const preferredModel = userProfile?.preferences?.defaultModel || 'deepseek-v3';
  const currentTheme = userProfile?.preferences?.theme || 'light';

  const [models, setModels] = useState<any[]>([]);

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const json = await api.get<any>('/api/chat/models');
        const data = Array.isArray(json) ? json : (json.models || []);
        setModels(data);
      } catch (err) {
        console.error('Failed to fetch models:', err);
      }
    };
    fetchModels();
  }, []);

  return (
    <section className="space-y-8 max-w-3xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2 rounded-lg text-primary">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <h3 className="text-xl font-bold tracking-tight text-foreground">{t('user_center.general.title')}</h3>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
        <div className="space-y-6">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">{t('user_center.general.default_model')}</label>
            <select
              value={preferredModel}
              onChange={(e) => updatePreferences({ defaultModel: e.target.value })}
              className="w-full bg-muted border border-transparent focus:bg-card focus:border-border/50 rounded-xl px-4 py-3 text-sm font-bold text-foreground outline-none transition-all cursor-pointer"
            >
              {models.length > 0 ? (
                models.map(m => (
                  <option key={m.id} value={m.id}>{m.name || m.id}</option>
                ))
              ) : (
                <>
                  <option value="deepseek-v3">{t('user_center.models.deepseek_v3', 'DeepSeek V3 (Default)')}</option>
                  <option value="qwen-turbo">{t('user_center.models.qwen_turbo', 'Qwen Turbo')}</option>
                  <option value="gpt-4o-mini">{t('user_center.models.gpt4o_mini', 'GPT-4o Mini')}</option>
                </>
              )}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">{t('user_center.general.appearance')}</label>
            <div className="flex gap-2 p-1.5 bg-muted rounded-2xl border border-border/50">
              <button 
                onClick={() => updatePreferences({ theme: 'system' })}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl transition-all font-bold text-sm",
                  currentTheme === 'system' ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Monitor className="w-4 h-4" /> {t('user_center.general.appearance_system', '跟随系统')}
              </button>
              <button 
                onClick={() => updatePreferences({ theme: 'light' })}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl transition-all font-bold text-sm",
                  currentTheme === 'light' ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Sun className="w-4 h-4" /> {t('user_center.general.appearance_light')}
              </button>
              <button 
                onClick={() => updatePreferences({ theme: 'dark' })}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl transition-all font-bold text-sm",
                  currentTheme === 'dark' ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Moon className="w-4 h-4" /> {t('user_center.general.appearance_dark')}
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">{t('user_center.general.language')}</label>
            <select
              value={i18n.language?.startsWith('zh') ? 'zh' : 'en'}
              onChange={(e) => updatePreferences({ language: e.target.value })}
              className="w-full bg-muted border border-transparent focus:bg-card focus:border-border/50 rounded-xl px-4 py-3 text-sm font-bold text-foreground outline-none transition-all cursor-pointer"
            >
              <option value="zh">{t('user_center.general.lang_zh')}</option>
              <option value="en">{t('user_center.general.lang_en')}</option>
            </select>
          </div>
        </div>
      </div>
    </section>
  );
}
