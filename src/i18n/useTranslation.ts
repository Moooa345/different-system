import { useLanguageStore, type Language } from '../store/useLanguage';
import { ar, en, type TranslationKey } from './translations';

export function useTranslation() {
  const lang = useLanguageStore((state) => state.lang);
  const setLanguage = useLanguageStore((state) => state.setLanguage);
  const toggleLanguage = useLanguageStore((state) => state.toggleLanguage);
  const dictionary = lang === 'ar' ? ar : en;
  const t = (key: TranslationKey): string => dictionary[key];
  const dir: 'rtl' | 'ltr' = lang === 'ar' ? 'rtl' : 'ltr';
  const formatCurrency = (amount: number) => `${new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en-EG', { maximumFractionDigits: 2 }).format(amount)} ${t('currencyEgp')}`;
  return { t, lang, dir, toggleLanguage, setLanguage: (next: Language) => setLanguage(next), formatCurrency };
}
