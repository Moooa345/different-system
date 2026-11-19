import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type Language = 'ar' | 'en';
interface LanguageState {
  lang: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
}

export const useLanguageStore = create<LanguageState>()(persist((set, get) => ({
  lang: 'ar',
  setLanguage: (lang) => set({ lang }),
  toggleLanguage: () => set({ lang: get().lang === 'ar' ? 'en' : 'ar' }),
}), { name: 'omnichannel-language', storage: createJSONStorage(() => localStorage) }));
