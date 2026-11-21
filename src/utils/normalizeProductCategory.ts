export type ProductCategoryFilter = 'all' | 'sneakers' | 'bags';
export type CanonicalProductCategory = Exclude<ProductCategoryFilter, 'all'>;

const BAG_ALIASES = new Set(['bag', 'bags', 'شنطة', 'شنط', 'حقائب']);
const SHOE_ALIASES = new Set(['shoe', 'shoes', 'sneaker', 'sneakers', 'footwear', 'حذاء', 'أحذية', 'احذية', 'الأحذية', 'الاحذية']);

export function normalizeProductCategory(value: string | null | undefined): CanonicalProductCategory | null {
  if (!value) return null;

  const normalized = value
    .trim()
    .toLocaleLowerCase()
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا');

  if (BAG_ALIASES.has(normalized)) return 'bags';
  if (SHOE_ALIASES.has(normalized)) return 'sneakers';
  return null;
}
