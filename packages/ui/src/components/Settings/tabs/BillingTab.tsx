import React, { useState } from 'react';
import { CreditCard } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../SettingsContext';
import { ConfirmDeleteDialog } from '../dialogs/ConfirmDeleteDialog';

export function BillingTab({ onConversationsCleared }: { onConversationsCleared?: () => void }) {
  const { t } = useTranslation();
  const { userProfile } = useSettings();
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  const handleExportData = () => {
    if (!userProfile) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(userProfile, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "ocean_export.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  return (
    <section className="space-y-8 max-w-3xl text-foreground">
      <div className="flex items-center gap-3">
        <div className="bg-primary/10 p-2 rounded-lg text-primary">
          <CreditCard className="w-5 h-5" />
        </div>
        <h3 className="text-xl font-bold tracking-tight">{t('user_center.tabs.billing', 'Usage & Billing')}</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 bg-muted rounded-[24px]">
           <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-4">{t('user_center.usage.total_sessions', 'Total Sessions')}</p>
           <p className="text-2xl font-bold">{userProfile?.stats?.sessionCount || 0}</p>
        </div>
        <div className="p-6 bg-muted rounded-[24px]">
           <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-4">{t('user_center.usage.messages_sent', 'Messages Sent')}</p>
           <p className="text-2xl font-bold">{userProfile?.stats?.messageCount || 0}</p>
        </div>
        <div className="p-6 bg-primary text-white rounded-[32px] flex flex-col items-center justify-center text-center shadow-xl shadow-[#EC5B14]/20">
           <p className="text-[10px] font-black uppercase tracking-widest opacity-80 mb-2">{t('user_center.usage.plan')}</p>
           <p className="text-xl font-bold">{t('user_center.usage.pro_plan')}</p>
        </div>
      </div>

      <div className="pt-8 border-t border-border flex flex-wrap gap-4 items-center justify-between">
        <div className="flex gap-4">
          <button 
            onClick={() => setShowConfirmDelete(true)}
            className="px-6 py-2.5 rounded-full text-[11px] font-bold text-red-600 bg-red-50 hover:bg-red-100 transition-colors uppercase tracking-widest border border-red-200"
          >
            {t('user_center.usage.delete_all_chats', 'Delete All Chats')}
          </button>
          <button 
            onClick={handleExportData}
            className="px-6 py-2.5 rounded-full text-[11px] font-bold text-muted-foreground hover:text-foreground bg-card border border-border hover:bg-muted transition-all shadow-sm uppercase tracking-widest"
          >
            {t('user_center.usage.export_data', 'Export My Data (.JSON)')}
          </button>
        </div>
      </div>

      <ConfirmDeleteDialog isOpen={showConfirmDelete} onClose={() => setShowConfirmDelete(false)} onConversationsCleared={onConversationsCleared} />
    </section>
  );
}
