import { create } from 'zustand';
import { api } from './api-client';

export interface SkillMeta {
  id: string;
  name: string;
  description: string;
  trigger_keywords: string[];
}

interface SkillStore {
  catalog: SkillMeta[];
  activeSkills: SkillMeta[];
  pickerOpen: boolean;
  pickerQuery: string;

  openPicker: () => void;
  closePicker: () => void;
  setPickerQuery: (query: string) => void;
  selectSkill: (skill: SkillMeta) => void;
  removeSkill: (id: string) => void;
  clearActiveSkills: () => void;
  refreshCatalog: () => Promise<void>;
}

export const useSkillStore = create<SkillStore>((set, get) => ({
  catalog: [],
  activeSkills: [],
  pickerOpen: false,
  pickerQuery: '',

  openPicker: () => set({ pickerOpen: true, pickerQuery: '' }),
  closePicker: () => set({ pickerOpen: false }),
  setPickerQuery: (query: string) => set({ pickerQuery: query }),

  selectSkill: (skill: SkillMeta) => set((state) => {
    // Prevent duplicates
    if (state.activeSkills.find(s => s.id === skill.id)) {
      return { pickerOpen: false };
    }
    return {
      activeSkills: [...state.activeSkills, skill],
      pickerOpen: false
    };
  }),

  removeSkill: (id: string) => set((state) => ({
    activeSkills: state.activeSkills.filter(s => s.id !== id)
  })),

  clearActiveSkills: () => set({ activeSkills: [] }),

  refreshCatalog: async () => {
    try {
      const res = await api.get<any>('/api/chat/skills');
      if (res.data && res.data.skills) {
        set({ catalog: res.data.skills });
      }
    } catch (err) {
      console.error('Failed to fetch skill catalog', err);
    }
  }
}));
