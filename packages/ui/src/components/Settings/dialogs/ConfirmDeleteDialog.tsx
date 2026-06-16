import React from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { api } from '../../../lib/api-client';
import { useSettings } from '../../SettingsContext';

interface ConfirmDeleteDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ConfirmDeleteDialog({ isOpen, onClose }: ConfirmDeleteDialogProps) {
  const { t } = useTranslation();
  const { fetchProfile } = useSettings();

  if (!isOpen) return null;

  const executeDeleteConversations = async () => {
    try {
      await api.delete('/api/sessions/all');
      fetchProfile();
      onClose();
    } catch (err: any) {
      console.error('Delete failed:', err.message);
    }
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-10">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="bg-card w-full max-w-sm rounded-2xl p-6 shadow-2xl border border-border/50"
      >
        <h4 className="text-lg font-bold text-foreground mb-2">{t('user_center.usage.delete_all_chats', 'Delete All Chats')}</h4>
        <p className="text-sm text-muted-foreground mb-6">{t('user_center.billing.confirm_delete', 'Are you sure you want to delete all conversations? This cannot be undone.')}</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-muted-foreground hover:bg-muted rounded-xl transition-all">Cancel</button>
          <button onClick={executeDeleteConversations} className="px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-all shadow-md">Delete</button>
        </div>
      </motion.div>
    </div>
  );
}
