import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../../lib/api-client';
import { UserProfile, SaveStatus, SettingsContextType, UserPreferences } from './types';
import { useTranslation } from 'react-i18next';

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children, token, onProfileUpdate }: { children: React.ReactNode; token: string | null; onProfileUpdate?: (user: any) => void }) {
  const { i18n } = useTranslation();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

  const fetchProfile = async () => {
    if (!userProfile) setIsLoading(true);
    try {
      const data = await api.get<{ success: boolean; profile: UserProfile }>('/api/user/profile');
      if (data.success) {
        setUserProfile(data.profile);
        if (onProfileUpdate) {
          onProfileUpdate(data.profile);
        }
      }
    } catch (err: any) {
      console.error('Failed to fetch profile:', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchProfile();
    }
  }, [token]);

  const updatePreferences = async (updates: Partial<UserPreferences>) => {
    setSaveStatus('saving');
    try {
      await api.patch('/api/user/preferences', updates);
      
      if (updates.theme) {
        document.documentElement.classList.remove('light', 'dark');
        if (updates.theme === 'system') {
          const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          document.documentElement.classList.add(isDark ? 'dark' : 'light');
        } else {
          document.documentElement.classList.add(updates.theme);
        }
      }
      if (updates.language) {
        i18n.changeLanguage(updates.language);
      }

      setSaveStatus('success');
      await fetchProfile();
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err: any) {
      setSaveStatus('error');
      console.error('Failed to update preferences:', err.message);
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  const updateProfile = async (updates: Partial<UserProfile>) => {
    setSaveStatus('saving');
    try {
      await api.patch('/api/user/profile', updates);
      setSaveStatus('success');
      await fetchProfile();
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err: any) {
      setSaveStatus('error');
      console.error('Failed to update profile:', err.message);
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  const value: SettingsContextType = {
    token,
    userProfile,
    isLoading,
    saveStatus,
    fetchProfile,
    updatePreferences,
    updateProfile,
  };

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
