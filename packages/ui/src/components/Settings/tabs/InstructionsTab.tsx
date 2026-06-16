import React, { useState, useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../SettingsContext';

export function InstructionsTab() {
  const { t } = useTranslation();
  const { userProfile, updatePreferences } = useSettings();
  const [editedInstructions, setEditedInstructions] = useState('');

  useEffect(() => {
    if (userProfile?.preferences?.customInstructions) {
      setEditedInstructions(userProfile.preferences.customInstructions);
    }
  }, [userProfile]);

  return (
    <section className="space-y-8 max-w-3xl">
      <div className="flex items-center gap-3">
        <div className="bg-primary/10 p-2 rounded-lg text-primary">
          <Sparkles className="w-5 h-5" />
        </div>
        <h3 className="text-xl font-bold tracking-tight text-foreground">{t('user_center.tabs.instructions', 'Custom Instructions')}</h3>
      </div>
      
      <p className="text-muted-foreground text-sm leading-relaxed max-w-2xl">
        {t('user_center.instructions.desc', 'Give Ocean specific instructions on how you want it to behave and respond. These will be applied to every new conversation.')}
      </p>

      <div className="space-y-6">
        <div className="space-y-3">
          <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            {t('user_center.instructions.label', 'How should Ocean respond?')}
          </label>
          <textarea 
            value={editedInstructions}
            onChange={(e) => setEditedInstructions(e.target.value)}
            onBlur={() => updatePreferences({ customInstructions: editedInstructions })}
            placeholder={t('user_center.instructions.placeholder', 'e.g. \"Answer professionally in Chinese. Focus on legal compliance and code quality. Use California law standards for IP discussions.\"')}
            className="w-full h-48 p-5 bg-muted border border-transparent focus:bg-card focus:border-border/50 rounded-[24px] text-[14px] font-medium text-foreground outline-none transition-all resize-none leading-relaxed"
          />
        </div>
      </div>
    </section>
  );
}
