import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { api } from '../../../lib/api-client';
import { useSettings } from '../SettingsContext';

interface AddIntegrationDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddIntegrationDialog({ isOpen, onClose }: AddIntegrationDialogProps) {
  const { t } = useTranslation();
  const { fetchProfile } = useSettings();
  const [credentialInput, setCredentialInput] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [isTestSuccess, setIsTestSuccess] = useState(false);
  const [testError, setTestError] = useState('');

  if (!isOpen) return null;

  const executeTestConnection = async () => {
    if (!credentialInput) return;
    setIsTesting(true);
    setTestError('');
    setIsTestSuccess(false);
    try {
      // Mock API call to test connection
      await api.post('/api/user/credentials/test', { token: credentialInput });
      setIsTestSuccess(true);
    } catch (err: any) {
      setTestError(err.message || 'Connection failed');
    } finally {
      setIsTesting(false);
    }
  };

  const executeAddCredential = async () => {
    if (!credentialInput || !isTestSuccess) return;
    try {
      await api.post('/api/user/credentials', { systemType: 'zentao', token: credentialInput, username: 'admin' });
      fetchProfile();
      setCredentialInput('');
      setIsTestSuccess(false);
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
        <p className="text-sm text-muted-foreground mb-1">{t('user_center.common.prompt_zentao', 'Please enter your token')}</p>
        <a href="https://www.zentao.net/book/zentaopmshelp/356.html" target="_blank" rel="noreferrer" className="text-[10px] text-primary hover:underline mb-4 block">
          How to get my ZenTao Token?
        </a>
        <input 
          type="text" 
          value={credentialInput}
          onChange={(e) => {
            setCredentialInput(e.target.value);
            setIsTestSuccess(false);
            setTestError('');
          }}
          className="w-full bg-muted border border-border/50 rounded-xl px-4 py-3 text-sm text-foreground mb-4 focus:outline-none focus:ring-2 focus:ring-primary/20"
          placeholder="Token..."
          autoFocus
        />
        {testError && <p className="text-xs text-red-500 font-bold mb-4">{testError}</p>}
        {isTestSuccess && <p className="text-xs text-green-500 font-bold mb-4">Connection Successful!</p>}
        
        <div className="flex gap-3 justify-between items-center">
          <button 
            onClick={executeTestConnection} 
            disabled={!credentialInput || isTesting} 
            className="px-4 py-2 text-xs font-bold text-primary bg-primary/10 hover:bg-primary/20 disabled:opacity-50 rounded-xl transition-all"
          >
            {isTesting ? 'Testing...' : 'Test Connection'}
          </button>
          <div className="flex gap-3">
            <button onClick={() => { setCredentialInput(''); setIsTestSuccess(false); setTestError(''); onClose(); }} className="px-4 py-2 text-sm font-bold text-muted-foreground hover:bg-muted rounded-xl transition-all">Cancel</button>
            <button onClick={executeAddCredential} disabled={!isTestSuccess} className="px-4 py-2 text-sm font-bold text-white bg-primary hover:opacity-90 disabled:opacity-50 rounded-xl transition-all shadow-md">Save</button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
