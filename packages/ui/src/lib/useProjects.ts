import { useState, useEffect, useCallback } from 'react';
import { api } from './api-client';

export interface Project {
  id: string;
  name: string;
  description: string;
  category: string;
  createdAt: string;
}

let globalProjectsCache: Project[] | null = null;
let isFetching = false;
let fetchPromise: Promise<Project[]> | null = null;
let listeners: Array<(projects: Project[]) => void> = [];

function notifyListeners(projects: Project[]) {
  listeners.forEach(listener => listener(projects));
}

export function useProjects(initialProjects?: Project[]) {
  const hasInitialProjects = initialProjects !== undefined;
  // Keep the hydration frame deterministic; apply the module cache after mount.
  const [projects, setProjects] = useState<Project[]>(initialProjects ?? []);
  const [isLoading, setIsLoading] = useState(!hasInitialProjects);

  useEffect(() => {
    listeners.push(setProjects);
    if (hasInitialProjects) {
      globalProjectsCache = initialProjects;
      notifyListeners(initialProjects);
      setIsLoading(false);
    } else if (globalProjectsCache) {
      setProjects(globalProjectsCache);
      setIsLoading(false);
    } else {
      fetchProjects();
    }
    return () => {
      listeners = listeners.filter(l => l !== setProjects);
    };
  }, [hasInitialProjects, initialProjects]);

  const fetchProjects = useCallback(() => {
    if (!isFetching) {
      isFetching = true;
      fetchPromise = api.get<any>('/api/knowledge-projects')
        .then((data) => {
          const fetchedProjects = Array.isArray(data) ? data : (data.data || []);
          globalProjectsCache = fetchedProjects;
          notifyListeners(fetchedProjects);
          setIsLoading(false);
          isFetching = false;
          return fetchedProjects;
        })
        .catch(err => {
          console.error('[useProjects]', err);
          isFetching = false;
          setIsLoading(false);
          return [];
        });
    } else if (fetchPromise) {
      fetchPromise.then(data => {
        setIsLoading(false);
      });
    }
  }, []);

  return { projects, isLoading, fetchProjects };
}
