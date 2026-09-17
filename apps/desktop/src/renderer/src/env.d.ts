/// <reference types="vite/client" />

interface Window {
  api?: {
    createLocalProject: (name: string) => Promise<{ success: boolean; path?: string; error?: string }>;
    openFolderPicker: () => Promise<{ success: boolean; path?: string; canceled?: boolean; error?: string }>;
    revealInFinder: (path: string) => Promise<{ success: boolean; error?: string }>;
    credentials: {
      get: () => Promise<{ email: string; password: string } | null>;
      save: (c: { email: string; password: string }) => Promise<{ success: boolean; error?: string }>;
      clear: () => Promise<{ success: boolean; error?: string }>;
    };
  };
}
