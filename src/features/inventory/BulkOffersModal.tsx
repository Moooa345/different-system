import { useMemo, useState } from 'react';
import { LoaderCircle, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Product, ProductVariant } from '../../lib/types';
import { supabase } from '../../lib/supabase';
import { useTranslation } from '../../i18n/useTranslation';

type ProductWithVariants = Product & { variants: ProductVariant[] };
type DiscountMode = 'fixed' | 'percent' | 'amount';

interface BulkOffersModalProps {
  products: ProductWithVariants[];
  onClose: () => void;
  onApplied: () => Promise<void>;
}

function currentPrice(product: ProductWithVariants) {
  const prices = product.variants.map((variant) => variant.unit_sell_price);
  return prices.length ? Math.min(...prices) : null;
}

function uniformVariantPrice(product: ProductWithVariants) {
  const prices = product.variants.map((variant) => variant.unit_sell_price);
  return prices.length > 0 && prices.every((price) => Math.abs(price - prices[0]) < 0.01);
}

export function BulkOffersModal({ products, onClose, onApplied }: BulkOffersModalProps) {
  const { t, dir, lang, formatCurrency } = useTranslation();
  const [category, setCategory] = useState<'all' | 'bags' | 'sneakers'>('all');
  const [brand, setBrand] = useState('all');
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [mode, setMode] = useState<'apply' | 'restore'>('apply');
  const [discountMode, setDiscountMode] = useState<DiscountMode>('percent');
  const [discountValue, setDiscountValue] = useState('20');
  const [busy, setBusy] = useState(false);

  const brands = useMemo(() => [...new Set(products.map((product) => product.brand?.trim()).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b)), [products]);
  const filteredProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase(lang);
    return products.filter((product) => {
      if (category !== 'all' && product.category !== category) return false;
      if (brand !== 'all' && product.brand?.toLocaleLowerCase() !== brand.toLocaleLowerCase()) return false;
      if (!normalizedQuery) return true;
      return product.name.toLocaleLowerCase(lang).includes(normalizedQuery) || product.variants.some((variant) => variant.sku.toLocaleLowerCase(lang).includes(normalizedQuery));
    });
  }, [products, category, brand, query, lang]);

  const activeOffers = useMemo(() => products.filter((product) => {
    const price = currentPrice(product);
    return product.compare_at_price != null && price != null && product.compare_at_price > price;
  }), [products]);
  const activeOfferIds = new Set(activeOffers.map((product) => product.id));
  const selectedProducts = products.filter((product) => selectedIds.includes(product.id) && (mode === 'apply' || activeOfferIds.has(product.id)));
  const amount = Number(discountValue);
  const previewRows = selectedProducts.map((product) => {
    const price = currentPrice(product);
    const original = product.compare_at_price ?? price;
    const rawNewPrice = price == null ? NaN : discountMode === 'fixed'
      ? amount
      : discountMode === 'percent'
        ? price * (1 - amount / 100)
        : price - amount;
    const newPrice = Number.isFinite(rawNewPrice) ? Math.round(rawNewPrice) : NaN;
    const canApply = uniformVariantPrice(product) && price != null && original != null && Number.isFinite(amount)
      && (discountMode !== 'percent' || (amount > 0 && amount < 100))
      && (discountMode === 'fixed' || discountMode === 'percent' || amount > 0)
      && newPrice > 0 && newPrice < original;
    const discountPercent = original && Number.isFinite(newPrice) ? Math.round((1 - newPrice / original) * 100) : 0;
    return { product, price, original, newPrice, discountPercent, canApply };
  });
  const validCount = previewRows.filter((row) => row.canApply).length;

  function toggleProduct(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((selected) => selected !== id) : [...current, id]);
  }

  function selectAllFiltered() {
    const selectable = mode === 'apply' ? filteredProducts : filteredProducts.filter((product) => activeOfferIds.has(product.id));
    setSelectedIds((current) => [...new Set([...current, ...selectable.map((product) => product.id)])]);
  }

  async function restoreSelected() {
    if (!selectedProducts.length) { toast.error(t('bulkNothingSelected')); return; }
    setBusy(true);
    let success = 0;
    let failed = 0;
    try {
      for (const product of selectedProducts) {
        if (!uniformVariantPrice(product) || product.compare_at_price == null || !product.variants.length) { failed += 1; continue; }
        const beforePrices = product.variants.map((variant) => ({ id: variant.id, price: variant.unit_sell_price }));
        const variantResult = await supabase.from('product_variants').update({ unit_sell_price: product.compare_at_price }).in('id', beforePrices.map((variant) => variant.id));
        if (variantResult.error) { failed += 1; continue; }
        const productResult = await supabase.from('products').update({ compare_at_price: null }).eq('id', product.id);
        if (productResult.error) {
          await Promise.all(beforePrices.map((variant) => supabase.from('product_variants').update({ unit_sell_price: variant.price }).eq('id', variant.id)));
          failed += 1;
          continue;
        }
        success += 1;
      }
      await onApplied();
      if (failed) toast.error(t('bulkPartialFailure').replace('{success}', String(success)).replace('{failed}', String(failed)));
      else toast.success(t('bulkRestored').replace('{count}', String(success)));
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function applySelected() {
    if (!selectedProducts.length) { toast.error(t('bulkNothingSelected')); return; }
    if (validCount === 0) { toast.error(t('bulkNoValidPrices')); return; }
    setBusy(true);
    let success = 0;
    let failed = previewRows.length - validCount;
    try {
      for (const row of previewRows) {
        if (!row.canApply || row.price == null || row.original == null) continue;
        const beforePrices = row.product.variants.map((variant) => ({ id: variant.id, price: variant.unit_sell_price }));
        const variantResult = await supabase.from('product_variants').update({ unit_sell_price: row.newPrice }).in('id', beforePrices.map((variant) => variant.id));
        if (variantResult.error) { failed += 1; continue; }
        const productResult = await supabase.from('products').update({ compare_at_price: row.original }).eq('id', row.product.id);
        if (productResult.error) {
          await Promise.all(beforePrices.map((variant) => supabase.from('product_variants').update({ unit_sell_price: variant.price }).eq('id', variant.id)));
          failed += 1;
          continue;
        }
        success += 1;
      }
      await onApplied();
      if (failed) toast.error(t('bulkPartialFailure').replace('{success}', String(success)).replace('{failed}', String(failed)));
      else toast.success(t('bulkApplied').replace('{count}', String(success)));
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const number = (value: number) => new Intl.NumberFormat(lang, { maximumFractionDigits: 0 }).format(value);

  return <div dir={dir} className="fixed inset-0 z-[70] grid place-items-center bg-stone-950/60 p-3 sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="bulk-offers-title" className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl dark:border-stone-700 dark:bg-stone-900">
      <header className="flex items-center justify-between gap-3 border-b border-stone-200 px-5 py-4 dark:border-stone-700"><div><h2 id="bulk-offers-title" className="text-lg font-bold text-stone-900 dark:text-stone-100">{t('bulkOffers')}</h2><p className="mt-1 text-xs text-stone-500">{t('bulkOffersHint')}</p></div><button type="button" disabled={busy} onClick={onClose} aria-label={t('closeMenu')} className="grid size-10 place-items-center rounded-lg text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"><X className="size-5" /></button></header>
      <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
        <div className="flex flex-wrap gap-2"><button type="button" onClick={() => { setMode('apply'); setSelectedIds([]); }} className={`min-h-10 rounded-lg px-4 py-2 text-sm font-semibold ${mode === 'apply' ? 'bg-stone-900 text-white dark:bg-[#C8A86B] dark:text-[#141413]' : 'border border-stone-200 text-stone-600 dark:border-stone-700 dark:text-stone-300'}`}>{t('applyOffers')}</button><button type="button" onClick={() => { setMode('restore'); setSelectedIds([]); }} className={`min-h-10 rounded-lg px-4 py-2 text-sm font-semibold ${mode === 'restore' ? 'bg-stone-900 text-white dark:bg-[#C8A86B] dark:text-[#141413]' : 'border border-stone-200 text-stone-600 dark:border-stone-700 dark:text-stone-300'}`}>{t('activeOffers')} ({activeOffers.length})</button></div>
        <p className="rounded-lg bg-stone-50 px-3 py-2 text-xs leading-5 text-stone-600 dark:bg-stone-800 dark:text-stone-300">{t('bulkPriceConsistency')}</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_2fr]"><label className="text-xs font-semibold text-stone-600 dark:text-stone-300">{t('bulkCategory')}<select value={category} onChange={(event) => setCategory(event.target.value as typeof category)} className="mt-1.5 h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm dark:border-stone-700 dark:bg-stone-950"><option value="all">{t('all')}</option><option value="bags">{t('bags')}</option><option value="sneakers">{t('sneakers')}</option></select></label><label className="text-xs font-semibold text-stone-600 dark:text-stone-300">{t('bulkBrand')}<select value={brand} onChange={(event) => setBrand(event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm dark:border-stone-700 dark:bg-stone-950"><option value="all">{t('brandFilterAll')}</option>{brands.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label className="text-xs font-semibold text-stone-600 dark:text-stone-300">{t('searchPlaceholder')}<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('bulkSearch')} className="mt-1.5 h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-start text-sm dark:border-stone-700 dark:bg-stone-950" /></label></div>
        <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={selectAllFiltered} className="min-h-10 rounded-lg border border-stone-300 px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800">{t('selectAllFiltered')} ({mode === 'apply' ? filteredProducts.length : filteredProducts.filter((product) => activeOfferIds.has(product.id)).length})</button>{mode === 'restore' && <button type="button" onClick={() => { setCategory('all'); setBrand('all'); setQuery(''); setSelectedIds(activeOffers.map((product) => product.id)); }} className="min-h-10 rounded-lg border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-200 dark:hover:bg-amber-950/30">{t('selectAllActiveOffers')}</button>}<button type="button" onClick={() => setSelectedIds([])} className="min-h-10 rounded-lg px-3 py-2 text-xs font-semibold text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800">{t('clearSelection')}</button><span className="ms-auto text-xs font-semibold text-stone-500">{t('selectedCount').replace('{count}', number(selectedProducts.length))}</span></div>
        <div className="max-h-56 overflow-y-auto rounded-xl border border-stone-200 dark:border-stone-700"><div className="divide-y divide-stone-100 dark:divide-stone-800">{(mode === 'apply' ? filteredProducts : filteredProducts.filter((product) => activeOfferIds.has(product.id))).map((product) => <label key={product.id} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm hover:bg-stone-50 dark:hover:bg-stone-800"><input type="checkbox" checked={selectedIds.includes(product.id)} onChange={() => toggleProduct(product.id)} className="size-4 accent-amber-600" /><span className="min-w-0 flex-1 truncate font-medium text-stone-800 dark:text-stone-100">{product.name}<span className="ms-2 text-xs font-normal text-stone-500">{product.brand ?? ''}</span></span><span className="text-xs tabular-nums text-stone-500">{formatCurrency(currentPrice(product) ?? 0)}</span></label>)}{(mode === 'apply' ? filteredProducts.length : filteredProducts.filter((product) => activeOfferIds.has(product.id)).length) === 0 && <p className="p-5 text-center text-sm text-stone-500">{mode === 'restore' ? t('bulkNoActiveOffers') : t('storeNoProducts')}</p>}</div></div>
        {mode === 'apply' ? <section className="space-y-3"><div className="grid gap-3 sm:grid-cols-[1fr_1fr]"><label className="text-xs font-semibold text-stone-600 dark:text-stone-300">{t('discountMode')}<select value={discountMode} onChange={(event) => setDiscountMode(event.target.value as DiscountMode)} className="mt-1.5 h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm dark:border-stone-700 dark:bg-stone-950"><option value="fixed">{t('fixedSalePrice')}</option><option value="percent">{t('percentageOff')}</option><option value="amount">{t('fixedAmountOff')}</option></select></label><label className="text-xs font-semibold text-stone-600 dark:text-stone-300">{t('discountValue')} ({discountMode === 'percent' ? '%' : t('currencyEgp')})<input type="number" min="0" step="1" value={discountValue} onChange={(event) => setDiscountValue(event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm tabular-nums dark:border-stone-700 dark:bg-stone-950" /></label></div><div><h3 className="mb-2 text-sm font-bold text-stone-800 dark:text-stone-100">{t('bulkPreview')} · {number(previewRows.length)}</h3><div className="max-h-48 overflow-y-auto rounded-xl border border-stone-200 dark:border-stone-700"><table className="w-full min-w-[480px] text-start text-xs"><thead className="sticky top-0 bg-stone-50 text-stone-500 dark:bg-stone-800"><tr><th className="p-2.5">{t('item')}</th><th className="p-2.5">{t('originalPrice')}</th><th className="p-2.5">{t('newSalePrice')}</th><th className="p-2.5">{t('discountLabel')}</th></tr></thead><tbody className="divide-y divide-stone-100 dark:divide-stone-800">{previewRows.map((row) => <tr key={row.product.id} className={row.canApply ? '' : 'opacity-50'}><td className="max-w-44 truncate p-2.5 font-medium">{row.product.name}</td><td className="p-2.5 tabular-nums">{formatCurrency(row.original ?? 0)}</td><td className="p-2.5 tabular-nums">{Number.isFinite(row.newPrice) ? formatCurrency(row.newPrice) : '—'}</td><td className="p-2.5 tabular-nums">{row.canApply ? `${number(row.discountPercent)}%` : '—'}</td></tr>)}</tbody></table>{previewRows.length === 0 && <p className="p-5 text-center text-sm text-stone-500">{t('bulkNothingSelected')}</p>}</div></div></section> : <section><h3 className="mb-2 text-sm font-bold text-stone-800 dark:text-stone-100">{t('bulkPreview')} · {number(selectedProducts.length)}</h3><div className="max-h-48 overflow-y-auto rounded-xl border border-stone-200 dark:border-stone-700">{selectedProducts.map((product) => <div key={product.id} className="flex items-center justify-between gap-3 border-b border-stone-100 px-3 py-2.5 text-xs last:border-0 dark:border-stone-800"><span className="truncate">{product.name}</span><span className="shrink-0 tabular-nums">{formatCurrency(currentPrice(product) ?? 0)} → {formatCurrency(product.compare_at_price ?? 0)}</span></div>)}{selectedProducts.length === 0 && <p className="p-5 text-center text-sm text-stone-500">{t('bulkNoActiveOffers')}</p>}</div></section>}
      </div>
      <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-stone-200 px-4 py-3 dark:border-stone-700"><button type="button" disabled={busy} onClick={onClose} className="min-h-11 rounded-lg border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 dark:border-stone-700 dark:text-stone-200">{t('cancel')}</button>{mode === 'apply' ? <button type="button" disabled={busy || validCount === 0} onClick={() => void applySelected()} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-stone-900 px-5 py-2 text-sm font-bold text-white disabled:opacity-50 dark:bg-[#C8A86B] dark:text-[#141413]">{busy && <LoaderCircle className="size-4 animate-spin" />}{t('applyOffers')} ({number(validCount)})</button> : <button type="button" disabled={busy || selectedProducts.length === 0} onClick={() => void restoreSelected()} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-stone-900 px-5 py-2 text-sm font-bold text-white disabled:opacity-50 dark:bg-[#C8A86B] dark:text-[#141413]">{busy && <LoaderCircle className="size-4 animate-spin" />}{t('restoreOriginalPrices')}</button>}</footer>
    </section>
  </div>;
}
