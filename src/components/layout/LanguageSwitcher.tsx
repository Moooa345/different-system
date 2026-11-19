import { Languages } from 'lucide-react';
import { useTranslation } from '../../i18n/useTranslation';

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { t, lang, toggleLanguage } = useTranslation();
  return <button type="button" onClick={toggleLanguage} aria-label={lang === 'ar' ? t('switchToEnglish') : t('switchToArabic')} className={`inline-flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-bold text-stone-700 transition hover:bg-stone-50 ${compact ? 'size-10 px-0' : ''}`}>
    <Languages className="size-4" />{!compact && t('language')}
  </button>;
}
