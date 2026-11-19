import { Moon, Sun } from 'lucide-react';
import { useTranslation } from '../../i18n/useTranslation';
import { useTheme } from '../../store/useTheme';

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const theme = useTheme((state) => state.theme);
  const toggleTheme = useTheme((state) => state.toggleTheme);
  const label = theme === 'dark' ? t('themeSwitchLight') : t('themeSwitchDark');
  const Icon = theme === 'dark' ? Sun : Moon;
  return <button type="button" onClick={toggleTheme} title={label} aria-label={label} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-stone-200 bg-white px-3 text-stone-700 transition hover:bg-stone-50 ${compact ? 'size-10 px-0' : ''}`}>
    <Icon className="size-4" />{!compact && <span className="text-xs font-semibold">{label}</span>}
  </button>;
}
