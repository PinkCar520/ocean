import React, { useState, useEffect } from 'react';
import { Edit2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../SettingsContext';

export function ProfileTab() {
  const { t } = useTranslation();
  const { userProfile, updateProfile } = useSettings();
  const [editedName, setEditedName] = useState('');
  const [editedEmail, setEditedEmail] = useState('');

  useEffect(() => {
    if (userProfile) {
      setEditedName(userProfile.name || '');
      setEditedEmail(userProfile.email || '');
    }
  }, [userProfile]);

  return (
    <section className="space-y-8 max-w-3xl">
      <div className="flex items-center gap-6">
        <div className="relative w-24 h-24">
          <img alt={t('user_center.identity.edit_avatar')} className="w-full h-full rounded-3xl object-cover border-4 border-card shadow-xl shadow-[#000]/5" src={userProfile?.avatar || "https://lh3.googleusercontent.com/aida-public/AB6AXuA0oS2KtsdNSGQoheV6v31oxAq-NhwZzQ47xg8__EJhv8OqGKGnZL3wep9OPHmM8x2Ik6mpZYLUp_nlIoldi6DXVNzDnTDsq10ls1jkUj-t_evdmGKwkn_t5xfFRgHK6-mmcStkVS-zdI45IF3rmBL3mH9KmAB8N9AvKqU-Dv45N0-NNrOIrD2ZlsGh9MmfkPMjEPcNRAJQVNa20KRYE9eY-Svv7Taq6vVmmqM9HxckuxqA9UWUSYJjawCeP6JhTrR_2ym5Y9kmaeo"} />
          <button className="absolute -bottom-2 -right-2 bg-card p-2 rounded-xl shadow-lg border border-border">
            <Edit2 className="w-4 h-4 text-[#EC5B14]" />
          </button>
        </div>
        <div>
          <h4 className="text-2xl font-bold text-foreground">{userProfile?.name}</h4>
          <p className="text-muted-foreground font-semibold mt-1 uppercase tracking-widest text-[10px]">{userProfile?.department || t('user_center.identity.department')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-1">
          <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{t('user_center.identity.work_id')}</label>
          <p className="p-3 bg-muted rounded-xl font-mono text-sm font-bold text-foreground">{userProfile?.workId}</p>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{t('user_center.identity.name')}</label>
          <input 
            value={editedName}
            onChange={(e) => setEditedName(e.target.value)}
            onBlur={() => updateProfile({ name: editedName })}
            className="w-full p-3 bg-muted border border-transparent focus:bg-card focus:border-border/50 rounded-xl text-sm font-bold text-foreground outline-none transition-all"
            placeholder={t('user_center.identity.name_placeholder')}
          />
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{t('user_center.identity.email')}</label>
          <input 
            value={editedEmail}
            onChange={(e) => setEditedEmail(e.target.value)}
            onBlur={() => updateProfile({ email: editedEmail })}
            className="w-full p-3 bg-muted border border-transparent focus:bg-card focus:border-border/50 rounded-xl text-sm font-bold text-foreground outline-none transition-all"
            placeholder={t('user_center.identity.email_placeholder')}
          />
        </div>
      </div>
    </section>
  );
}
