import type { Product, ProductVariant } from '../lib/types';

export type AlternativeVariant = Pick<ProductVariant, 'id' | 'product_id' | 'sku' | 'color' | 'size' | 'image_url' | 'unit_sell_price' | 'stock_qty' | 'is_active'>;
export type TaggedProduct = Pick<Product, 'id' | 'name' | 'category' | 'image_url' | 'image_urls' | 'gallery_urls' | 'is_active' | 'style_tags'> & { variants: AlternativeVariant[] };

export interface SimilarAlternatives {
  sameModelOtherColors: AlternativeVariant[];
  similarProducts: Array<{ product: TaggedProduct; matchingTags: string[]; availableVariants: AlternativeVariant[] }>;
}

export function getSimilarAlternatives(
  targetProduct: TaggedProduct,
  requestedVariant: AlternativeVariant | null,
  allActiveProducts: TaggedProduct[],
): SimilarAlternatives {
  const sameModelOtherColors = requestedVariant
    ? targetProduct.variants.filter((variant) => variant.is_active && variant.stock_qty > 0
      && variant.size === requestedVariant.size && variant.color !== requestedVariant.color)
      .sort((a, b) => a.unit_sell_price - b.unit_sell_price)
    : [];
  const targetPrice = requestedVariant?.unit_sell_price
    ?? targetProduct.variants.filter((variant) => variant.unit_sell_price > 0).reduce((lowest, variant) => Math.min(lowest, variant.unit_sell_price), Number.POSITIVE_INFINITY);
  const targetTags = new Set(targetProduct.style_tags.map((tag) => tag.trim().toLocaleLowerCase()).filter(Boolean));
  const ranked = allActiveProducts
    .filter((product) => product.is_active && product.id !== targetProduct.id && product.category === targetProduct.category)
    .map((product) => {
      const availableVariants = product.variants.filter((variant) => variant.is_active && variant.stock_qty > 0);
      if (!availableVariants.length) return null;
      const matchingTags = product.style_tags.filter((tag) => targetTags.has(tag.trim().toLocaleLowerCase()));
      const exactSize = Boolean(requestedVariant?.size && availableVariants.some((variant) => variant.size === requestedVariant.size));
      const nearPrice = Number.isFinite(targetPrice) && availableVariants.some((variant) => Math.abs(variant.unit_sell_price - targetPrice) <= targetPrice * 0.25);
      const score = matchingTags.length * 100 + (exactSize ? 20 : 0) + (nearPrice ? 10 : 0);
      return { product, matchingTags, availableVariants, score };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name));

  return { sameModelOtherColors, similarProducts: ranked.slice(0, 4).map(({ product, matchingTags, availableVariants }) => ({ product, matchingTags, availableVariants })) };
}
