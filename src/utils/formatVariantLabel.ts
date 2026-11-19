import type { TranslationKey } from '../i18n/translations';

export function formatVariantLabel(
  color: string | null | undefined,
  size: string | null | undefined,
  t: (key: TranslationKey) => string,
  separator = ' · ',
) {
  return `${color?.trim() || t('oneColor')}${separator}${size?.trim() || t('pdpNoSize')}`;
}
