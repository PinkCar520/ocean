export interface UserPreferences {
  defaultModel?: string;
  theme?: 'light' | 'dark' | 'system';
  language?: string;
  customInstructions?: string;
}

export interface UserCredential {
  id: string;
  systemType: string;
  username: string;
  token?: string;
}

export interface UserStats {
  sessionCount: number;
  messageCount: number;
}

export interface UserProfile {
  name?: string;
  email?: string;
  workId?: string;
  department?: string;
  avatar?: string;
  preferences?: UserPreferences;
  credentials?: UserCredential[];
  stats?: UserStats;
}

export type SaveStatus = 'idle' | 'saving' | 'success' | 'error';

export interface SettingsContextType {
  token: string | null;
  userProfile: UserProfile | null;
  isLoading: boolean;
  saveStatus: SaveStatus;
  fetchProfile: () => Promise<void>;
  updatePreferences: (updates: Partial<UserPreferences>) => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
}

export interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  token: string | null;
}
