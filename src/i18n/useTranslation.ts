import { useCallback } from 'react';
import { useLanguageStore, type Language } from '../store/useLanguage';
import { ar, en, type TranslationKey } from './translations';

export function useTranslation() {
  const lang = useLanguageStore((state) => state.lang);
  const setLanguage = useLanguageStore((state) => state.setLanguage);
  const toggleLanguage = useLanguageStore((state) => state.toggleLanguage);
  const dictionary = lang === 'ar' ? ar : en;
  const t = useCallback((key: TranslationKey): string => dictionary[key], [dictionary]);
  const dir: 'rtl' | 'ltr' = lang === 'ar' ? 'rtl' : 'ltr';
  const formatCurrency = useCallback((amount: number) => `${new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en-EG', { maximumFractionDigits: 2 }).format(amount)} ${t('currencyEgp')}`, [lang, t]);
  return { t, lang, dir, toggleLanguage, setLanguage: (next: Language) => setLanguage(next), formatCurrency };
}
