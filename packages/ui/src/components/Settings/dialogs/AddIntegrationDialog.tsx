import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { api } from '../../../lib/api-client';
import { useSettings } from '../../SettingsContext';

interface AddIntegrationDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddIntegrationDialog({ isOpen, onClose }: AddIntegrationDialogProps) {
  const { t } = useTranslation();
  const { fetchProfile } = useSettings();
  const [credentialInput, setCredentialInput] = useState('');

  if (!isOpen) return null;

  const executeAddCredential = async () => {
    if (!credentialInput) return;
    try {
      await api.post('/api/user/credentials', { systemType: 'zentao', token: credentialInput, username: 'admin' });
      fetchProfile();
      setCredentialInput('');
      onClose();
    } catch (err: any) {
      console.error('Failed to add credential:', err.message);
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
        <h4 className="text-lg font-bold text-foreground mb-2">{t('user_center.integrations.add', 'Add Integration')}</h4>
        <p className="text-sm text-muted-foreground mb-4">{t('user_center.common.prompt_zentao', 'Please enter your token')}</p>
        <input 
          type="text" 
          value={credentialInput}
          onChange={(e) => setCredentialInput(e.target.value)}
          className="w-full bg-muted border border-border/50 rounded-xl px-4 py-3 text-sm text-foreground mb-6 focus:outline-none focus:ring-2 focus:ring-[#EC5B14]/20"
          placeholder="Token..."
          autoFocus
        />
        <div className="flex gap-3 justify-end">
          <button onClick={() => { setCredentialInput(''); onClose(); }} className="px-4 py-2 text-sm font-bold text-muted-foreground hover:bg-muted rounded-xl transition-all">Cancel</button>
          <button onClick={executeAddCredential} disabled={!credentialInput} className="px-4 py-2 text-sm font-bold text-white bg-[#EC5B14] hover:opacity-90 disabled:opacity-50 rounded-xl transition-all shadow-md">Save</button>
        </div>
      </motion.div>
    </div>
  );
}
