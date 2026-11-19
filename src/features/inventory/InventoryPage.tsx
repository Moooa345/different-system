import { useCallback, useEffect, useMemo, useState } from 'react';
import { Boxes, ImagePlus, LoaderCircle, PackagePlus, Pencil, Search } from 'lucide-react';
import { toast } from 'sonner';
import type { Product, ProductVariant } from '../../lib/types';
import { supabase } from '../../lib/supabase';
import { ProductFormModal } from './ProductFormModal';
import { useTranslation } from '../../i18n/useTranslation';

type ProductWithVariants = Product & { variants: ProductVariant[] };
type CategoryFilter = 'all' | 'sneakers' | 'bags';

export function InventoryPage() {
  const { t, dir, lang } = useTranslation();
  const [products, setProducts] = useState<ProductWithVariants[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [editing, setEditing] = useState<ProductWithVariants | null>(null);
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

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
      return matchesCategory && matchesQuery;
    });
  }, [products, query, category, lang]);

  async function toggleActive(product: ProductWithVariants) {
    setSavingId(product.id);
    const { error } = await supabase.from('products').update({ is_active: !product.is_active }).eq('id', product.id);
    setSavingId(null);
    if (error) { toast.error(t('updateError')); return; }
    setProducts((current) => current.map((item) => item.id === product.id ? { ...item, is_active: !item.is_active } : item));
    toast.success(product.is_active ? t('productDisabled') : t('productEnabled'));
  }

  return <div dir={dir} className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div><div className="flex items-center gap-3"><div className="grid size-12 place-items-center rounded-2xl bg-rose-100 text-rose-700"><Boxes className="size-6" /></div><div><h1 className="text-2xl font-black text-stone-900">{t('inventory')}</h1><p className="mt-1 text-sm text-stone-500">{t('inventorySubtitle')}</p></div></div></div>
      <button onClick={() => setCreating(true)} className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-stone-800"><PackagePlus className="size-4" />{t('addProduct')}</button>
    </div>

    <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="relative flex-1"><Search className={`absolute top-3 size-4 text-stone-400 ${dir === 'rtl' ? 'end-3' : 'start-3'}`} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('searchPlaceholder')} className={`w-full rounded-xl border border-stone-300 py-2.5 text-sm outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100 ${dir === 'rtl' ? 'pe-10 ps-4' : 'ps-10 pe-4'}`} /></label>
        <div className="flex rounded-xl bg-stone-100 p-1">
          {([{ value: 'all', key: 'all' }, { value: 'sneakers', key: 'sneakers' }, { value: 'bags', key: 'bags' }] as const).map((option) => <button key={option.value} onClick={() => setCategory(option.value)} className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${category === option.value ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-800'}`}>{t(option.key)}</button>)}
        </div>
      </div>
    </section>

    {loading ? <div className="grid min-h-56 place-items-center text-stone-500"><div className="flex items-center gap-3"><LoaderCircle className="size-5 animate-spin" />{t('loadingInventory')}</div></div> : filtered.length === 0 ? <div className="rounded-2xl border border-dashed border-stone-300 bg-white py-16 text-center"><div className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-stone-100 text-stone-500"><Boxes /></div><p className="font-semibold text-stone-700">{t('noProducts')}</p><p className="mt-1 text-sm text-stone-500">{t('noProductsHint')}</p></div> :
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {filtered.map((product) => {
          const stock = product.variants.reduce((total, variant) => total + variant.stock_qty, 0);
          const image = product.image_url ?? product.gallery_urls[0] ?? product.variants.find((variant) => variant.image_url)?.image_url ?? product.image_urls[0];
          const low = stock < 3;
          return <article key={product.id} className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm transition hover:shadow-md">
            <div className="flex gap-4 p-4 sm:p-5">
              <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-stone-100 text-stone-400 sm:size-24">{image ? <img src={image} alt={product.name} className="size-full object-cover" /> : <ImagePlus className="size-7" />}</div>
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><div><span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-600">{product.category === 'bags' ? t('bags') : t('sneakers')}</span><h2 className="mt-2 truncate text-start font-bold text-stone-900">{product.name}</h2></div><button onClick={() => setEditing(product)} className="rounded-lg p-2 text-stone-500 hover:bg-stone-100 hover:text-stone-900" title={t('editProduct')} aria-label={`${t('editProduct')}: ${product.name}`}><Pencil className="size-4" /></button></div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-stone-500"><span>{new Intl.NumberFormat(lang).format(product.variants.length)} {t('variants')}</span><span className={`font-bold ${low ? 'text-amber-700' : 'text-stone-700'}`}>{t('stock')}: {new Intl.NumberFormat(lang).format(stock)} {low && `• ${t('lowStock')}`}</span></div>
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
