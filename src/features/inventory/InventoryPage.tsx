import { useCallback, useEffect, useMemo, useState } from 'react';
import { Boxes, ImagePlus, LoaderCircle, PackagePlus, Pencil, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useSearchParams } from 'react-router-dom';
import type { Product, ProductVariant } from '../../lib/types';
import { supabase } from '../../lib/supabase';
import { ProductFormModal } from './ProductFormModal';
import { useTranslation } from '../../i18n/useTranslation';

type ProductWithVariants = Product & { variants: ProductVariant[] };
type CategoryFilter = 'all' | 'sneakers' | 'bags';
type HealthFilter = 'all' | 'low' | 'out';

export function InventoryPage() {
  const { t, dir, lang, formatCurrency } = useTranslation();
  const [searchParams] = useSearchParams();
  const [products, setProducts] = useState<ProductWithVariants[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [health, setHealth] = useState<HealthFilter>((searchParams.get('health') as HealthFilter) || 'all');
  const [editing, setEditing] = useState<ProductWithVariants | null>(null);
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingStockId, setSavingStockId] = useState<string | null>(null);

  const loadProducts = useCallback(async () => {
    const [{ data: productRows, error: productError }, { data: variantRows, error: variantError }] = await Promise.all([
      supabase.from('products').select('*').order('created_at', { ascending: false }),
      supabase.from('product_variants').select('*').order('created_at'),
    ]);
    if (productError || variantError) {
      toast.error(t('loadProductsError'));
      setLoading(false);
      return;
    }
    const grouped = new Map<string, ProductVariant[]>();
    for (const variant of variantRows ?? []) grouped.set(variant.product_id, [...(grouped.get(variant.product_id) ?? []), variant]);
    setProducts((productRows ?? []).map((product) => ({ ...product, variants: grouped.get(product.id) ?? [] })));
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadProducts();
    const channel = supabase.channel('inventory-product-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => void loadProducts())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_variants' }, () => void loadProducts())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [loadProducts]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase(lang);
    return products.filter((product) => {
      const matchesCategory = category === 'all' || product.category === category;
      const matchesQuery = !normalizedQuery || product.name.toLocaleLowerCase(lang).includes(normalizedQuery) || product.variants.some((variant) => variant.sku.toLocaleLowerCase(lang).includes(normalizedQuery));
      const matchesHealth = health === 'all' || product.variants.some((variant) => health === 'low' ? variant.stock_qty >= 1 && variant.stock_qty <= 3 : variant.stock_qty === 0);
      return matchesCategory && matchesQuery && matchesHealth;
    });
  }, [products, query, category, health, lang]);

  const healthCounts = useMemo(() => ({
    all: products.length,
    low: products.filter((product) => product.variants.some((variant) => variant.stock_qty >= 1 && variant.stock_qty <= 3)).length,
    out: products.filter((product) => product.variants.some((variant) => variant.stock_qty === 0)).length,
  }), [products]);

  async function toggleActive(product: ProductWithVariants) {
    setSavingId(product.id);
    const { error } = await supabase.from('products').update({ is_active: !product.is_active }).eq('id', product.id);
    setSavingId(null);
    if (error) { toast.error(t('updateError')); return; }
    setProducts((current) => current.map((item) => item.id === product.id ? { ...item, is_active: !item.is_active } : item));
    toast.success(product.is_active ? t('productDisabled') : t('productEnabled'));
  }

  async function adjustStock(variant: ProductVariant, delta: 1 | -1) {
    if (savingStockId || (delta < 0 && variant.stock_qty === 0)) return;
    setSavingStockId(variant.id);
    setProducts((current) => current.map((product) => ({ ...product, variants: product.variants.map((item) => item.id === variant.id ? { ...item, stock_qty: Math.max(0, item.stock_qty + delta) } : item) })));
    const { data, error } = await supabase.rpc('adjust_variant_stock_atomic', { p_variant_id: variant.id, p_delta: delta, p_reason: 'manual_restock' });
    if (error) {
      toast.error(error.message.toLowerCase().includes('insufficient stock') ? t('quickStockMin') : t('quickStockError'));
      await loadProducts();
    } else {
      if (typeof data === 'number') setProducts((current) => current.map((product) => ({ ...product, variants: product.variants.map((item) => item.id === variant.id ? { ...item, stock_qty: data } : item) })));
      toast.success(t('quickStockSaved'));
    }
    setSavingStockId(null);
  }

  return <div dir={dir} className="space-y-6 tabular-nums">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div><div className="flex items-center gap-3"><div className="grid size-12 place-items-center rounded-2xl bg-rose-100 text-rose-700"><Boxes className="size-6" /></div><div><h1 className="text-2xl font-black text-stone-900">{t('inventory')}</h1><p className="mt-1 text-sm text-stone-500">{t('inventorySubtitle')}</p></div></div></div>
      <button onClick={() => setCreating(true)} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-stone-900 px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-stone-800"><PackagePlus className="size-4" />{t('addProduct')}</button>
    </div>

    <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="relative flex-1"><Search className={`absolute top-3 size-4 text-stone-400 ${dir === 'rtl' ? 'end-3' : 'start-3'}`} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('searchPlaceholder')} className={`w-full rounded-xl border border-stone-300 py-2.5 text-sm outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100 ${dir === 'rtl' ? 'pe-10 ps-4' : 'ps-10 pe-4'}`} /></label>
        <div className="flex flex-wrap gap-2"><div className="flex rounded-lg bg-stone-100 p-1">
          {([{ value: 'all', key: 'all' }, { value: 'sneakers', key: 'sneakers' }, { value: 'bags', key: 'bags' }] as const).map((option) => <button key={option.value} onClick={() => setCategory(option.value)} className={`min-h-11 rounded-md px-4 py-2 text-sm font-semibold transition ${category === option.value ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-800'}`}>{t(option.key)}</button>)}
        </div><div className="flex rounded-lg bg-stone-100 p-1">{([{ value: 'all', key: 'inventoryHealthAll' }, { value: 'low', key: 'inventoryHealthLow' }, { value: 'out', key: 'inventoryHealthOut' }] as const).map((option) => <button key={option.value} type="button" onClick={() => setHealth(option.value)} aria-pressed={health === option.value} className={`min-h-11 rounded-md px-3 py-2 text-xs font-semibold transition ${health === option.value ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-800'}`}>{t(option.key)} <span className="ms-1 tabular-nums">{new Intl.NumberFormat(lang).format(healthCounts[option.value])}</span></button>)}</div></div>
      </div>
    </section>

    {loading ? <div className="grid min-h-56 place-items-center text-stone-500"><div className="flex items-center gap-3"><LoaderCircle className="size-5 animate-spin" />{t('loadingInventory')}</div></div> : filtered.length === 0 ? <div className="rounded-2xl border border-dashed border-stone-300 bg-white py-16 text-center"><div className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-stone-100 text-stone-500"><Boxes /></div><p className="font-semibold text-stone-700">{t('noProducts')}</p><p className="mt-1 text-sm text-stone-500">{t('noProductsHint')}</p></div> :
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {filtered.map((product) => {
          const stock = product.variants.reduce((total, variant) => total + variant.stock_qty, 0);
          const image = product.image_url ?? product.gallery_urls[0] ?? product.variants.find((variant) => variant.image_url)?.image_url ?? product.image_urls[0];
          const out = stock === 0;
          const low = stock > 0 && stock <= 3;
          return <article key={product.id} className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm transition hover:shadow-md">
            <div className="flex gap-4 p-4 sm:p-5">
              <div className="grid aspect-[4/5] w-20 shrink-0 place-items-center overflow-hidden rounded-lg bg-stone-100 text-stone-400 sm:w-24">{image ? <img src={image} alt={product.name} className="size-full object-cover" /> : <ImagePlus className="size-7" />}</div>
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><div><div className="flex flex-wrap items-center gap-1.5"><span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-600">{product.category === 'bags' ? t('bags') : t('sneakers')}</span>{product.brand && <span className="rounded-full border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-600">{product.brand}</span>}{product.is_best_seller && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">{t('bestSellers')}</span>}</div><h2 className="mt-2 truncate text-start font-bold text-stone-900">{product.name}</h2>{product.compare_at_price != null && product.compare_at_price > Math.min(...product.variants.map((variant) => variant.unit_sell_price), Infinity) && <p className="mt-1 text-xs font-medium text-emerald-700">{t('offerActive')}</p>}</div><button onClick={() => setEditing(product)} className="rounded-lg p-2 text-stone-500 hover:bg-stone-100 hover:text-stone-900" title={t('editProduct')} aria-label={`${t('editProduct')}: ${product.name}`}><Pencil className="size-4" /></button></div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-stone-500"><span>{new Intl.NumberFormat(lang).format(product.variants.length)} {t('variants')}</span><span className={`rounded-full px-2.5 py-1 font-bold ${out ? 'bg-red-50 text-red-700' : low ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>{t('stock')}: {new Intl.NumberFormat(lang).format(stock)} · {out ? t('opsOutOfStock') : low ? t('lowStock') : t('posStockInStock')}</span></div>
                <div className="mt-4 space-y-2">{product.variants.map((variant) => <div key={variant.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-2"><div className="min-w-0"><p className="truncate text-xs font-semibold text-stone-700">{variant.color?.trim() || t('oneColor')} · {variant.size?.trim() || t('pdpNoSize')} · {variant.sku}</p><p className="mt-0.5 text-[11px] text-stone-500">{formatCurrency(Number(variant.unit_sell_price))}</p></div><div className="flex items-center gap-1.5"><span className={`min-w-8 text-center text-xs font-black ${variant.stock_qty === 0 ? 'text-red-700' : variant.stock_qty <= 3 ? 'text-amber-800' : 'text-emerald-700'}`}>{new Intl.NumberFormat(lang).format(variant.stock_qty)}</span><button type="button" disabled={Boolean(savingStockId) || variant.stock_qty === 0} onClick={() => void adjustStock(variant, -1)} aria-label={`${t('adjustmentDecrease')}: ${variant.sku}`} className="grid size-11 place-items-center rounded-md border border-stone-200 bg-white text-sm font-black text-stone-700 disabled:cursor-not-allowed disabled:opacity-40">−</button><button type="button" disabled={Boolean(savingStockId)} onClick={() => void adjustStock(variant, 1)} aria-label={`${t('adjustmentIncrease')}: ${variant.sku}`} className="grid size-11 place-items-center rounded-md border border-stone-200 bg-white text-sm font-black text-stone-700 disabled:cursor-wait disabled:opacity-50">{savingStockId === variant.id ? <LoaderCircle className="size-4 animate-spin" /> : '+'}</button></div></div>)}</div>
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-stone-100 px-4 py-3 sm:px-5">
              <span className={`inline-flex items-center gap-2 text-xs font-semibold ${product.is_active ? 'text-emerald-700' : 'text-stone-500'}`}><span className={`size-2 rounded-full ${product.is_active ? 'bg-emerald-500' : 'bg-stone-400'}`} />{product.is_active ? t('active') : t('inactive')}</span>
              <button disabled={savingId === product.id} onClick={() => void toggleActive(product)} className="text-xs font-bold text-rose-700 hover:text-rose-900 disabled:opacity-50">{savingId === product.id ? t('updating') : product.is_active ? t('disableProduct') : t('enableProduct')}</button>
            </div>
          </article>;
        })}
      </div>}
    <p className="text-center text-xs text-stone-400">{t('productCount')}: {new Intl.NumberFormat(lang).format(filtered.length)} {t('of')} {new Intl.NumberFormat(lang).format(products.length)}</p>
    {(creating || editing) && <ProductFormModal product={editing} variants={editing?.variants ?? []} onClose={() => { setCreating(false); setEditing(null); }} onSaved={loadProducts} />}
  </div>;
}
