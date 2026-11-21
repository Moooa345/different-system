import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'light' | 'dark';
interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem('store-theme');
    const theme = stored ? JSON.parse(stored)?.state?.theme : null;
    return theme === 'light' || theme === 'dark' ? theme : 'light';
  } catch {
    return 'light';
  }
}

function applyTheme(theme: Theme) {
  if (typeof document !== 'undefined') document.documentElement.classList.toggle('dark', theme === 'dark');
}

const initialTheme = readStoredTheme();
applyTheme(initialTheme);

export const useTheme = create<ThemeState>()(persist((set, get) => ({
  theme: initialTheme,
  setTheme: (theme) => { applyTheme(theme); set({ theme }); },
  toggleTheme: () => {
    const theme = get().theme === 'dark' ? 'light' : 'dark';
    applyTheme(theme);
    set({ theme });
  },
}), {
  name: 'store-theme',
  onRehydrateStorage: () => (state) => applyTheme(state?.theme ?? initialTheme),
}));
