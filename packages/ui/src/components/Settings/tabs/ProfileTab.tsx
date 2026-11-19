import React, { useState, useEffect, useId } from 'react';
import { Edit2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../SettingsContext';

export function ProfileTab() {
  const { t } = useTranslation();
  const { userProfile, updateProfile } = useSettings();
  const [editedName, setEditedName] = useState('');
  const [editedEmail, setEditedEmail] = useState('');
  const [emailError, setEmailError] = useState('');

  const nameId = useId();
  const emailId = useId();
  const savedName = userProfile?.name || '';
  const savedEmail = userProfile?.email || '';

  useEffect(() => setEditedName(savedName), [savedName]);
  useEffect(() => setEditedEmail(savedEmail), [savedEmail]);

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
    if (editedEmail !== userProfile?.email) void updateProfile({ email: editedEmail });
  };

  return (
    <section className="space-y-8 max-w-3xl">
      <div className="flex items-center gap-6">
        <div className="relative h-24 w-24 shrink-0">
          {userProfile?.avatar ? (
            <img alt={t('user_center.identity.edit_avatar')} className="w-full h-full rounded-full object-cover shadow-xl shadow-[#000]/5" src={userProfile.avatar} />
          ) : (
            <div className="w-full h-full rounded-full bg-primary/10 text-primary flex items-center justify-center text-4xl font-black shadow-xl shadow-[#000]/5">
              {userProfile?.name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
          )}
          <label
            title={t('user_center.identity.edit_avatar')}
            className="absolute inset-0 flex cursor-pointer items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity hover:opacity-100 focus-within:opacity-100 focus-within:ring-2 focus-within:ring-primary [@media(hover:none)]:opacity-100"
          >
            <Edit2 aria-hidden="true" className="h-5 w-5" />
            <input type="file" aria-label={t('user_center.identity.edit_avatar')} accept="image/*" className="sr-only" onChange={handleAvatarUpload} />
          </label>
        </div>
        <div>
          <h4 className="text-2xl font-bold text-foreground">{userProfile?.name}</h4>
          <p className="text-muted-foreground font-semibold mt-1 uppercase tracking-widest text-[10px]">{userProfile?.department || t('user_center.identity.department')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-2">
          <label htmlFor={nameId} className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{t('user_center.identity.name')}</label>
          <input 
            id={nameId}
            value={editedName}
            onChange={(e) => setEditedName(e.target.value)}
            onBlur={() => {
              const name = editedName.trim();
              if (name && name !== userProfile?.name) void updateProfile({ name });
            }}
            className="w-full p-3 bg-muted border border-transparent focus:bg-card focus:border-border/50 rounded-xl text-sm font-bold text-foreground outline-none transition-all"
            placeholder={t('user_center.identity.name_placeholder')}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor={emailId} className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{t('user_center.identity.email')}</label>
          <input 
            id={emailId}
            type="email"
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
