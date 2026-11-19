import { X } from 'lucide-react';
import { useTranslation } from '../../i18n/useTranslation';
import { getSimilarAlternatives, type AlternativeVariant, type TaggedProduct } from '../../utils/getSimilarAlternatives';
import { formatVariantLabel } from '../../utils/formatVariantLabel';

interface AlternativesModalProps {
  targetProduct: TaggedProduct;
  requestedVariant: AlternativeVariant | null;
  allActiveProducts: TaggedProduct[];
  mode: 'storefront' | 'pos';
  onClose: () => void;
  onAdd: (product: TaggedProduct, variant: AlternativeVariant) => void;
}

export function AlternativesModal({ targetProduct, requestedVariant, allActiveProducts, mode, onClose, onAdd }: AlternativesModalProps) {
  const { t, dir, formatCurrency } = useTranslation();
  const alternatives = getSimilarAlternatives(targetProduct, requestedVariant, allActiveProducts);
  const AddButton = ({ product, variant }: { product: TaggedProduct; variant: AlternativeVariant }) => <button type="button" onClick={() => onAdd(product, variant)} className="rounded-lg bg-stone-900 px-3 py-2 text-xs font-bold text-white hover:bg-stone-700">{t(mode === 'pos' ? 'alternativesAddSale' : 'alternativesAddCart')}</button>;
  const VariantLine = ({ product, variant }: { product: TaggedProduct; variant: AlternativeVariant }) => <div key={variant.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-stone-50 px-3 py-2"><span className="text-xs text-stone-600">{formatVariantLabel(variant.color, variant.size, t)} · {variant.sku} · {formatCurrency(variant.unit_sell_price)}</span><AddButton product={product} variant={variant} /></div>;

  return <div dir={dir} className="fixed inset-0 z-[70] grid place-items-center bg-stone-950/40 p-3 sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="alternatives-title" className="dialog-panel max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
      <header className="sticky top-0 z-10 flex items-start justify-between border-b border-stone-100 bg-white px-5 py-4"><div><h2 id="alternatives-title" className="text-lg font-black">{t(mode === 'pos' ? 'alternativesTitlePos' : 'alternativesTitleStore')}</h2><p className="mt-1 text-sm text-stone-500">{targetProduct.name}{requestedVariant ? ` · ${formatVariantLabel(requestedVariant.color, requestedVariant.size, t, ' / ')}` : ''}</p></div><button type="button" onClick={onClose} aria-label={t('closeMenu')} className="rounded-lg p-2 text-stone-500 hover:bg-stone-100"><X className="size-5" /></button></header>
      <div className="space-y-6 p-5">
        {alternatives.sameModelOtherColors.length > 0 && <section><h3 className="mb-3 text-sm font-bold text-rose-800">{t('alternativesSameModel')}</h3><div className="grid gap-2 sm:grid-cols-2">{alternatives.sameModelOtherColors.map((variant) => <VariantLine key={variant.id} product={targetProduct} variant={variant} />)}</div></section>}
        {alternatives.similarProducts.length > 0 && <section><h3 className="mb-3 text-sm font-bold text-stone-800">{t('alternativesSimilar')}</h3><div className="grid gap-3 sm:grid-cols-2">{alternatives.similarProducts.map(({ product, matchingTags, availableVariants }) => {
          const image = product.image_url ?? product.gallery_urls[0] ?? availableVariants.find((variant) => variant.image_url)?.image_url ?? product.image_urls[0];
          const lowestPrice = Math.min(...availableVariants.map((variant) => variant.unit_sell_price));
          return <article key={product.id} className="overflow-hidden rounded-xl border border-stone-200"><div className="flex gap-3 p-3">{image ? <img src={image} alt={product.name} className="size-16 shrink-0 rounded-lg bg-stone-100 object-cover" /> : <div className="size-16 shrink-0 rounded-lg bg-stone-100" />}<div className="min-w-0"><h4 className="truncate text-sm font-bold">{product.name}</h4><p className="mt-1 text-xs text-rose-700">{t('storeStartingPrice').replace('{price}', formatCurrency(lowestPrice))}</p>{matchingTags.length > 0 && <p className="mt-1 truncate text-[11px] text-stone-500">{t('alternativesMatchingTags')}: {matchingTags.join('، ')}</p>}</div></div><div className="space-y-2 border-t border-stone-100 p-3"><p className="text-[11px] font-semibold text-stone-500">{t('alternativesSizes')}: {[...new Set(availableVariants.map((variant) => variant.size).filter(Boolean))].join(' · ') || '—'}</p>{availableVariants.map((variant) => <VariantLine key={variant.id} product={product} variant={variant} />)}</div></article>;
        })}</div></section>}
        {alternatives.sameModelOtherColors.length === 0 && alternatives.similarProducts.length === 0 && <p className="py-8 text-center text-sm text-stone-500">{t('alternativesNoMatches')}</p>}
      </div>
    </section>
  </div>;
}
