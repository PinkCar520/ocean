import React, { useState } from 'react';
import { Blocks, Plus, Rocket, TerminalSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../SettingsContext';
import { AddIntegrationDialog } from '../dialogs/AddIntegrationDialog';
import { cn } from '../../../lib/utils';

export function IntegrationsTab() {
  const { t } = useTranslation();
  const { userProfile } = useSettings();
  const [showAddCredential, setShowAddCredential] = useState(false);

  return (
    <section className="space-y-8 max-w-3xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-[#EC5B14]/10 p-2 rounded-lg text-[#EC5B14]">
            <Blocks className="w-5 h-5" />
          </div>
          <h3 className="text-xl font-bold text-foreground tracking-tight">{t('user_center.integrations.title')}</h3>
        </div>
        <button 
          onClick={() => setShowAddCredential(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[#EC5B14] text-white text-xs font-bold rounded-xl shadow-lg shadow-[#EC5B14]/20"
        >
          <Plus className="w-4 h-4" /> {t('user_center.integrations.add')}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {userProfile?.credentials?.map((cred: any) => (
          <div key={cred.id} className="p-5 bg-muted border border-border/50 rounded-[24px] hover:shadow-md transition-all">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center shadow-sm",
                  cred.systemType === 'zentao' ? "bg-[#00ACEE]/10 text-[#00ACEE]" : "bg-[#FC6D26]/10 text-[#FC6D26]"
                )}>
                  {cred.systemType === 'zentao' ? <Rocket className="w-6 h-6" /> : <TerminalSquare className="w-6 h-6" />}
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground uppercase tracking-tight">{cred.systemType}</p>
                  <p className="text-[10px] font-bold text-muted-foreground">{t('user_center.common.user_label')}{cred.username}</p>
                </div>
              </div>
              <span className="bg-green-500/10 text-green-500 text-[9px] font-black px-2 py-0.5 rounded-full tracking-widest uppercase">{t('user_center.integrations.active')}</span>
            </div>
            <div className="pt-4 border-t border-border/50 flex items-center justify-between">
              <code className="text-xs font-mono text-muted-foreground">••••••••••••{cred.id.slice(-4)}</code>
              <button className="text-[10px] font-black text-[#EC5B14] uppercase hover:underline">{t('user_center.integrations.settings')}</button>
            </div>
          </div>
        ))}
        {(!userProfile?.credentials || userProfile.credentials.length === 0) && (
          <div className="md:col-span-2 py-12 border-2 border-dashed border-border rounded-[32px] flex flex-col items-center justify-center">
             <Rocket className="w-10 h-10 text-border mb-3" />
             <p className="text-sm font-bold text-muted-foreground">{t('user_center.integrations.empty')}</p>
             <p className="text-[10px] text-muted-foreground/70 mt-1">{t('user_center.integrations.empty_desc')}</p>
          </div>
        )}
      </div>
      
      <AddIntegrationDialog isOpen={showAddCredential} onClose={() => setShowAddCredential(false)} />
    </section>
  );
}
