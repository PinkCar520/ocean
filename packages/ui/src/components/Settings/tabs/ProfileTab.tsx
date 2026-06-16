import React, { useState, useEffect } from 'react';
import { Edit2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../SettingsContext';

export function ProfileTab() {
  const { t } = useTranslation();
  const { userProfile, updateProfile } = useSettings();
  const [editedName, setEditedName] = useState('');
  const [editedEmail, setEditedEmail] = useState('');
  const [emailError, setEmailError] = useState('');

  useEffect(() => {
    if (userProfile) {
      setEditedName(userProfile.name || '');
      setEditedEmail(userProfile.email || '');
    }
  }, [userProfile]);

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 256;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        ctx.drawImage(img, 0, 0, width, height);
        const base64String = canvas.toDataURL('image/jpeg', 0.8);
        updateProfile({ avatar: base64String });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleEmailBlur = () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(editedEmail)) {
      setEmailError(t('user_center.identity.email_invalid', 'Invalid email format'));
      return;
    }
    setEmailError('');
    updateProfile({ email: editedEmail });
  };

  return (
    <section className="space-y-8 max-w-3xl">
      <div className="flex items-center gap-6">
        <div className="relative w-24 h-24 group cursor-pointer">
          {userProfile?.avatar ? (
            <img alt={t('user_center.identity.edit_avatar')} className="w-full h-full rounded-3xl object-cover border-4 border-card shadow-xl shadow-[#000]/5" src={userProfile.avatar} />
          ) : (
            <div className="w-full h-full rounded-3xl bg-primary/10 text-primary flex items-center justify-center text-4xl font-black border-4 border-card shadow-xl shadow-[#000]/5">
              {userProfile?.name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
          )}
          <label className="absolute -bottom-2 -right-2 bg-card p-2 rounded-xl shadow-lg border border-border cursor-pointer hover:bg-muted transition-colors">
            <Edit2 className="w-4 h-4 text-primary" />
            <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
          </label>
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
            onChange={(e) => {
               setEditedEmail(e.target.value);
               if (emailError) setEmailError('');
            }}
            onBlur={handleEmailBlur}
            className={`w-full p-3 bg-muted border ${emailError ? 'border-red-500 focus:border-red-500' : 'border-transparent focus:border-border/50'} focus:bg-card rounded-xl text-sm font-bold text-foreground outline-none transition-all`}
            placeholder={t('user_center.identity.email_placeholder')}
          />
          {emailError && <p className="text-xs text-red-500 font-bold">{emailError}</p>}
        </div>
      </div>
    </section>
  );
}
