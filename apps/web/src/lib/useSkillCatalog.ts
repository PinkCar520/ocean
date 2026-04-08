import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

export interface SkillCatalogEntry {
  id: string;
  name: string;
  description: string;
  locales: Record<string, { displayName?: string; description?: string }> | null;
}

// Module-level cache to ensure we only fetch this once per session 
// (or across multiple ChatSession mountings)
let globalCatalogCache: SkillCatalogEntry[] | null = null;
let isFetching = false;
let fetchPromise: Promise<SkillCatalogEntry[]> | null = null;

export function useSkillCatalog() {
  const [catalog, setCatalog] = useState<SkillCatalogEntry[]>(globalCatalogCache || []);
  const [isLoading, setIsLoading] = useState(!globalCatalogCache);
  const { i18n } = useTranslation();

  useEffect(() => {
    if (globalCatalogCache) {
      setCatalog(globalCatalogCache);
      setIsLoading(false);
      return;
    }

    if (!isFetching) {
      isFetching = true;
      fetchPromise = fetch('/api/skills/catalog')
        .then(res => {
          if (!res.ok) throw new Error('Failed to fetch catalog');
          return res.json();
        })
        .then((data: SkillCatalogEntry[]) => {
          globalCatalogCache = data;
          setCatalog(data);
          setIsLoading(false);
          isFetching = false;
          return data;
        })
        .catch(err => {
          console.error('[useSkillCatalog]', err);
          isFetching = false;
          setIsLoading(false);
          return [];
        });
    } else if (fetchPromise) {
      fetchPromise.then(data => {
        setCatalog(data);
        setIsLoading(false);
      });
    }
  }, []);

  const getLocalizedName = (skillId: string, fallbackName?: string): string => {
    const entry = catalog.find(c => c.id === skillId || c.name === skillId);
    if (!entry) return fallbackName || skillId;

    // Determine target locale (e.g., 'zh' from 'zh-CN')
    const targetLocale = i18n.language ? i18n.language.split('-')[0] : 'en';
    
    const localized = entry.locales?.[targetLocale];
    return localized?.displayName || fallbackName || entry.name;
  };

  return { catalog, isLoading, getLocalizedName };
}
