import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, CreditCard, RefreshCw, Search, ShoppingBag, Sparkles, TrendingUp, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import type { Product, ProductVariant } from '../../lib/types';
import { supabase } from '../../lib/supabase';
import { useTranslation } from '../../i18n/useTranslation';
import { useStoreCart } from '../../store/useStoreCart';
import { StorefrontHeader } from './StorefrontHeader';
import { StoreCartDrawer } from './StoreCartDrawer';
import { BrandLogo } from '../../components/layout/BrandLogo';
import { normalizeProductCategory, type ProductCategoryFilter } from '../../utils/normalizeProductCategory';
import { getAutoBestSellerIds } from '../../utils/getAutoBestSellerIds';
import { formatMonthlySoldLabel } from '../../utils/formatMonthlySoldLabel';

type StoreVariant = Pick<ProductVariant, 'id' | 'product_id' | 'sku' | 'color' | 'size' | 'image_url' | 'unit_sell_price' | 'stock_qty' | 'is_active'>;
type StoreProduct = Product & { variants: StoreVariant[] };

export function StorefrontPage() {
  const { t, dir, lang, formatCurrency } = useTranslation();
  const syncStock = useStoreCart((state) => state.syncStock);
  const updateVariantStock = useStoreCart((state) => state.updateVariantStock);
  const removeVariants = useStoreCart((state) => state.removeVariants);
  const cartItems = useStoreCart((state) => state.items);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [salesByProduct, setSalesByProduct] = useState<Record<string, { sold_last_30_days: number; total_sold: number }>>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ProductCategoryFilter>('all');
  const [brandFilter, setBrandFilter] = useState('all');
  const [sort, setSort] = useState<'newest' | 'price-asc' | 'price-desc'>('newest');
  const [cartOpen, setCartOpen] = useState(false);
  const catalogRef = useRef<StoreProduct[]>([]);
  const loadErrorMessage = t('storeLoadError');

  const loadCatalog = useCallback(async (showError = true) => {
    const [{ data: productRows, error: productError }, { data: variantRows, error: variantError }, salesResult] = await Promise.all([
      supabase.from('products').select('id, name, description, category, brand, is_best_seller, compare_at_price, image_url, image_urls, gallery_urls, style_tags, is_active, created_at, updated_at').eq('is_active', true).order('created_at', { ascending: false }),
      supabase.from('product_variants').select('id, product_id, sku, color, size, image_url, unit_sell_price, stock_qty, is_active').eq('is_active', true),
      supabase.rpc('get_storefront_product_sales_stats'),
    ]);
    if (productError || variantError) {
      if (showError) toast.error(loadErrorMessage);
      setLoading(false);
      return;
    }
    const activeProducts = productRows ?? [];
    const nextSalesByProduct = Object.fromEntries((salesResult.error ? [] : salesResult.data ?? []).map((row) => [row.product_id, { sold_last_30_days: Number(row.sold_last_30_days), total_sold: Number(row.total_sold) }]));
    setSalesByProduct(nextSalesByProduct);
    if (salesResult.error && import.meta.env.DEV) console.warn('[storefront] Sales stats unavailable; showing manual pins only.', salesResult.error);
    const activeProductIds = new Set(activeProducts.map((product) => product.id));
    const activeVariants = (variantRows ?? []).filter((variant) => activeProductIds.has(variant.product_id));
    const grouped = new Map<string, StoreVariant[]>();
    for (const variant of activeVariants) grouped.set(variant.product_id, [...(grouped.get(variant.product_id) ?? []), variant]);
    syncStock(Object.fromEntries(activeVariants.map((variant) => [variant.id, variant.stock_qty])));
    const nextProducts = activeProducts.map((product) => ({ ...product, variants: grouped.get(product.id) ?? [] }));
    catalogRef.current = nextProducts;
    setProducts(nextProducts);
    setLoading(false);
  }, [loadErrorMessage, syncStock]);

  useEffect(() => {
    void loadCatalog();
    let active = true;
    const stockChannel = supabase.channel('storefront:stock', { config: { private: true } })
      .on('broadcast', { event: 'stock_update' }, ({ payload }) => {
        const variantId = payload?.variant_id;
        const stockQty = payload?.stock_qty;
        const isActive = payload?.is_active;
        if (typeof variantId !== 'string' || !Number.isInteger(stockQty) || typeof isActive !== 'boolean') return;
        const knownVariant = catalogRef.current.some((product) => product.variants.some((variant) => variant.id === variantId));
        if (isActive && !knownVariant) { void loadCatalog(false); return; }
        const nextProducts = catalogRef.current.map((product) => ({
          ...product,
          variants: product.variants.map((variant) => variant.id === variantId
            ? { ...variant, stock_qty: stockQty as number, is_active: isActive }
            : variant),
        }));
        catalogRef.current = nextProducts;
        setProducts(nextProducts);
        updateVariantStock(variantId, stockQty as number, isActive);
      })
      .on('broadcast', { event: 'product_status' }, ({ payload }) => {
        const productId = payload?.product_id;
        const isActive = payload?.is_active;
        if (typeof productId !== 'string' || typeof isActive !== 'boolean') return;
        if (!isActive) {
          const product = catalogRef.current.find((entry) => entry.id === productId);
          if (product) removeVariants(product.variants.map((variant) => variant.id));
          catalogRef.current = catalogRef.current.filter((entry) => entry.id !== productId);
          setProducts((current) => current.filter((entry) => entry.id !== productId));
          return;
        }
        void loadCatalog(false);
      });
    const logStatus = (name: string) => (status: string, error?: Error) => {
      if (!import.meta.env.DEV) return;
      if (status === 'SUBSCRIBED') console.info(`[realtime] ${name}: ${status}`);
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.error(`[realtime] ${name}: ${status}`, error);
    };
    void supabase.realtime.setAuth().then(() => {
      if (!active) return;
      stockChannel.subscribe(logStatus('storefront stock broadcast'));
    }).catch((error: unknown) => {
      if (import.meta.env.DEV) console.error('[realtime] Could not set channel auth', error);
    });
    return () => {
      active = false;
      void supabase.removeChannel(stockChannel);
    };
  }, [loadCatalog, updateVariantStock, removeVariants]);

  const visibleProducts = useMemo(() => {
    const value = query.trim().toLocaleLowerCase(lang);
    const filtered = products.filter((product) => {
      if (category !== 'all' && normalizeProductCategory(product.category) !== category) return false;
      if (brandFilter !== 'all' && product.brand?.trim().toLocaleLowerCase() !== brandFilter.toLocaleLowerCase()) return false;
      if (!value) return true;
      return product.name.toLocaleLowerCase(lang).includes(value) || product.variants.some((variant) => variant.sku.toLocaleLowerCase(lang).includes(value));
    }).map((product) => {
      const value = query.trim().toLocaleLowerCase(lang);
      const variants = value && !product.name.toLocaleLowerCase(lang).includes(value)
        ? product.variants.filter((variant) => variant.sku.toLocaleLowerCase(lang).includes(value))
        : product.variants;
      return { ...product, variants };
    });
    if (sort === 'price-asc') return filtered.sort((a, b) => Math.min(...a.variants.map((v) => v.unit_sell_price), Infinity) - Math.min(...b.variants.map((v) => v.unit_sell_price), Infinity));
    if (sort === 'price-desc') return filtered.sort((a, b) => Math.min(...b.variants.map((v) => v.unit_sell_price), Infinity) - Math.min(...a.variants.map((v) => v.unit_sell_price), Infinity));
    return filtered;
  }, [products, query, category, brandFilter, lang, sort]);

  const brandOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const brand of ['Gucci', 'LV', 'Dior', 'Miu Miu', 'YSL', ...products.map((product) => product.brand?.trim() ?? '')]) {
      if (brand) options.set(brand.toLocaleLowerCase(), options.get(brand.toLocaleLowerCase()) ?? brand);
    }
    return [...options.values()];
  }, [products]);

  const offerProducts = visibleProducts.filter((product) => {
    const sellPrice = Math.min(...product.variants.map((variant) => variant.unit_sell_price), Infinity);
    return Number.isFinite(sellPrice) && product.compare_at_price != null && product.compare_at_price > sellPrice;
  });
  const monthlySales = useMemo(() => Object.fromEntries(Object.entries(salesByProduct).map(([id, stats]) => [id, stats.sold_last_30_days])), [salesByProduct]);
  const autoBestSellerIds = useMemo(() => getAutoBestSellerIds(products, monthlySales), [products, monthlySales]);
  const bestSellerProducts = visibleProducts
    .filter((product) => product.is_best_seller || autoBestSellerIds.has(product.id))
    .sort((a, b) => Number(b.is_best_seller) - Number(a.is_best_seller)
      || (monthlySales[b.id] ?? 0) - (monthlySales[a.id] ?? 0)
      || a.name.localeCompare(b.name));

  const cartCount = cartItems.reduce((sum, item) => sum + item.qty, 0);
  const renderProductCard = (product: StoreProduct) => {
    const prices = product.variants.map((variant) => variant.unit_sell_price);
    const startingPrice = prices.length ? Math.min(...prices) : 0;
    const compareAtPrice = product.compare_at_price;
    const isOffer = compareAtPrice != null && compareAtPrice > startingPrice;
    const discountPercent = isOffer ? Math.round(((compareAtPrice - startingPrice) / compareAtPrice) * 100) : 0;
    const image = product.image_url ?? product.gallery_urls[0] ?? product.variants.find((variant) => variant.image_url)?.image_url ?? product.image_urls[0];
    const hoverImage = product.gallery_urls.length >= 2 ? product.gallery_urls[1] : null;
    const previewColors = [...new Set(product.variants.map((variant) => variant.color?.trim() || t('oneColor')))].slice(0, 3);
    const totalStock = product.variants.reduce((sum, variant) => sum + (variant.is_active ? variant.stock_qty : 0), 0);
    const isBestSeller = product.is_best_seller || autoBestSellerIds.has(product.id);
    const monthlySoldLabel = formatMonthlySoldLabel(monthlySales[product.id] ?? 0, lang);
    return <article key={product.id} className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition duration-300 hover:-translate-y-1 dark:bg-stone-900 ${isBestSeller ? 'border-[#C8A86A]/45 hover:border-[#C8A86A] hover:shadow-[0_12px_38px_rgba(200,169,106,0.22)] dark:border-[#C8A86A]/45 dark:hover:border-[#C8A86A] dark:hover:shadow-[0_12px_38px_rgba(200,169,106,0.18)]' : 'border-stone-200 hover:shadow-lg dark:border-stone-700'} `}>
      <Link to={`/product/${product.id}`} aria-label={`${t('viewProductDetails')}: ${product.name}`} className="group relative block aspect-[4/5] overflow-hidden bg-stone-100">
        {image ? <><img src={image} alt={product.name} loading="lazy" className="absolute inset-0 size-full object-cover transition duration-500 group-hover:scale-105" />{hoverImage && <img src={hoverImage} alt="" aria-hidden="true" loading="lazy" className="absolute inset-0 size-full object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100" />}</> : <div className="grid size-full place-items-center text-stone-300"><ShoppingBag className="size-12" /></div>}
        <span className="absolute start-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-stone-600 backdrop-blur">{product.category === 'bags' ? t('posBags') : t('posShoes')}</span>
        {isBestSeller && <span className="absolute start-3 top-12 inline-flex items-center gap-1.5 rounded-md border border-[#C8A86A] bg-[#141414] px-2.5 py-1.5 text-[11px] font-bold text-[#D4AF37] shadow-sm"><Sparkles className="size-3.5" aria-hidden="true" />{t('bestSellerBadge')}</span>}
        {isOffer && <span className="absolute end-3 top-3 rounded-md bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-950 shadow-sm">{t('discountPercent').replace('{percent}', new Intl.NumberFormat(lang).format(discountPercent))}</span>}
        <span className={`absolute end-3 bottom-3 rounded-md px-2.5 py-1 text-[11px] font-bold backdrop-blur ${totalStock === 0 ? 'bg-stone-900 text-white' : totalStock <= 3 ? 'bg-amber-50/95 text-amber-800' : 'hidden'}`}>{totalStock === 0 ? t('storeSoldOut') : t('storeLowStock')}</span>
      </Link>
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2"><div className="min-w-0"><Link to={`/product/${product.id}`} className="block text-start font-bold text-stone-900 transition hover:text-rose-700"><h3 className="line-clamp-2">{product.name}</h3></Link>{product.brand && <p className="mt-1 text-xs font-medium tracking-wide text-stone-500">{product.brand}</p>}</div><div className="shrink-0 text-end">{isOffer && <p className="text-xs text-stone-500 line-through">{formatCurrency(compareAtPrice)}</p>}<p className={`text-sm font-black ${isOffer ? 'text-rose-700' : 'text-stone-900'}`}>{t('storeStartingPrice').replace('{price}', formatCurrency(startingPrice))}</p></div></div>
        {monthlySoldLabel && <p className="inline-flex items-center gap-1.5 text-[11px] font-medium text-stone-500"><TrendingUp className="size-3.5 shrink-0 text-[#8A6D35] dark:text-[#C8A86B]" aria-hidden="true" />{monthlySoldLabel}</p>}
        <div className="flex min-h-7 items-center justify-between gap-2"><div className="flex flex-wrap gap-1.5">{previewColors.map((color) => <span key={color} className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] text-stone-600">{color}</span>)}{!previewColors.length && <span className="text-xs text-stone-400">{new Intl.NumberFormat(lang).format(product.variants.length)} {t('variants')}</span>}</div><span className={`shrink-0 text-[11px] font-semibold ${totalStock > 0 ? 'text-emerald-700' : 'text-stone-400'}`}>{totalStock > 0 ? `${new Intl.NumberFormat(lang).format(totalStock)} ${t('stock')}` : t('storeOutOfStock')}</span></div>
        <Link to={`/product/${product.id}`} className="block border-t border-stone-100 pt-3 text-start text-xs font-bold text-rose-700">{t('viewProductDetails')} <span aria-hidden="true">{dir === 'rtl' ? '←' : '→'}</span></Link>
      </div>
    </article>;
  };
  return <div dir={dir} className="min-h-screen bg-stone-50 text-stone-900">
    <div className="border-b border-stone-200 bg-stone-100 px-4 py-1.5 text-center text-[11px] font-medium tracking-wide text-stone-600 sm:text-xs">{t('announcementBar')}</div>
    <StorefrontHeader cartCount={cartCount} category={category} onCategoryChange={setCategory} onOpenCart={() => setCartOpen(true)} />
    <main id="catalog" className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
      <section className="mb-8 overflow-hidden rounded-[2rem] border border-rose-100 bg-gradient-to-br from-rose-100 via-orange-50 to-stone-100 px-5 py-6 shadow-sm sm:px-9 sm:py-8">
        <div className="grid items-center gap-6 lg:grid-cols-[1fr_auto]">
          <div className="max-w-2xl"><p className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-bold text-rose-700"><span>{t('brand')}</span>{lang === 'en' && <><span aria-hidden="true" className="text-[#8A6D35] dark:text-[#C8A86B]">·</span><span lang="ar" dir="rtl" className="font-medium text-[#8A6D35] dark:text-[#C8A86B]">اختاري إطلالتك</span></>}</p><h1 className="mt-3 text-3xl font-black leading-tight tracking-tight text-stone-900 sm:text-4xl">{t('storeTagline')}</h1><p className="mt-2 text-sm leading-7 text-stone-600">{t('heroFashionLine')}</p><button type="button" onClick={() => document.getElementById('catalog-products')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-stone-900 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-stone-800">{t('shopNow')}<ArrowDown className="size-4" /></button></div>
          <div className="hidden min-w-48 rounded-3xl border border-white/60 bg-white/45 p-5 text-end backdrop-blur-sm lg:block"><span className="ms-auto grid size-14 place-items-center rounded-2xl bg-rose-100 text-rose-700"><ShoppingBag className="size-7" /></span><p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-rose-700">{t('brand')}</p><p className="mt-1 text-lg font-black text-stone-800">{t('storeCollection')}</p></div>
        </div>
        <div className="mt-6 grid gap-2 border-t border-rose-900/10 pt-4 sm:grid-cols-3">{[{ icon: Truck, text: t('trustShipping') }, { icon: CreditCard, text: t('trustPayments') }, { icon: RefreshCw, text: t('trustStock') }].map(({ icon: Icon, text }) => <div key={text} className="flex items-center gap-2 text-xs font-semibold text-stone-700"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/70 text-rose-700"><Icon className="size-4" /></span>{text}</div>)}</div>
        {lang === 'ar' && <p lang="ar" dir="rtl" className="mt-4 text-xs font-medium tracking-wide text-[#8A6D35] dark:text-[#C8A86B]">اختاري إطلالتك</p>}
      </section>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="text-xl font-black">{category === 'all' ? t('storeCollection') : category === 'bags' ? t('posBags') : t('posShoes')}</h2><p className="mt-1 text-sm text-stone-500">{t('storeCatalogHint')}</p></div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"><label className="relative w-full sm:w-64"><Search className={`absolute top-3.5 size-4 text-stone-400 ${dir === 'rtl' ? 'end-3' : 'start-3'}`} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('storeSearchPlaceholder')} className={`h-12 w-full rounded-xl border border-stone-300 bg-white text-sm outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100 ${dir === 'rtl' ? 'pe-10 ps-4' : 'ps-10 pe-4'}`} /></label><label className="flex items-center gap-2 text-xs font-semibold text-stone-600"><span className="sr-only">{t('sortLabel')}</span><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} aria-label={t('sortLabel')} className="h-12 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm sm:w-52"><option value="newest">{t('sortNewest')}</option><option value="price-asc">{t('sortPriceLow')}</option><option value="price-desc">{t('sortPriceHigh')}</option></select></label></div>
      </div>

      <section aria-label={t('brandFilterAll')} className="mb-7 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">{t('productBrand')}</h3>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[{ value: 'all', label: t('brandFilterAll') }, ...brandOptions.map((brand) => ({ value: brand, label: brand }))].map((option) => <button key={option.value} type="button" aria-pressed={brandFilter.toLocaleLowerCase() === option.value.toLocaleLowerCase()} onClick={() => setBrandFilter(option.value)} className={`min-h-10 shrink-0 rounded-full border px-4 py-2 text-xs font-semibold transition ${brandFilter.toLocaleLowerCase() === option.value.toLocaleLowerCase() ? 'border-stone-900 bg-stone-900 text-white dark:border-[#C8A86B] dark:bg-[#C8A86B] dark:text-[#141413]' : 'border-stone-200 bg-white text-stone-600 hover:border-stone-400 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300'}`}>{option.label}</button>)}
        </div>
      </section>

      {!loading && offerProducts.length > 0 && <section aria-labelledby="store-offers-title" className="mb-10 rounded-2xl border border-amber-200/70 bg-amber-50/60 p-4 sm:p-6 dark:border-amber-900/40 dark:bg-amber-950/10">
        <div className="mb-4 flex items-end justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-800 dark:text-amber-300">Different Store</p><h2 id="store-offers-title" className="mt-1 text-xl font-bold text-stone-900 dark:text-stone-100">{t('specialOffers')}</h2></div></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{offerProducts.map(renderProductCard)}</div>
      </section>}

      {!loading && bestSellerProducts.length > 0 && <section aria-labelledby="store-best-sellers-title" className="mb-10">
        <div className="mb-4"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8A6D35] dark:text-[#C8A86B]">Different Store</p><h2 id="store-best-sellers-title" className="mt-1 text-xl font-bold text-stone-900 dark:text-stone-100">{t('bestSellers')}</h2></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{bestSellerProducts.map(renderProductCard)}</div>
      </section>}

      {loading ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-label={t('storeLoading')} aria-busy="true">{Array.from({ length: 4 }, (_, index) => <div key={index} className="overflow-hidden rounded-lg border border-stone-200 bg-white"><div className="aspect-[4/5] animate-pulse bg-stone-100" /><div className="space-y-3 p-4"><div className="h-4 w-3/4 animate-pulse rounded bg-stone-100" /><div className="h-3 w-1/2 animate-pulse rounded bg-stone-100" /></div></div>)}</div> : visibleProducts.length === 0 ? <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-stone-300 bg-white text-sm text-stone-500">{t('storeNoProducts')}</div> :
        <div id="catalog-products" className="scroll-mt-24 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{visibleProducts.map(renderProductCard)}</div>}    </main>
    <footer className="border-t border-stone-200 bg-white px-4 py-6 sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col items-start gap-1.5"><a href="/" aria-label={t('brand')}><BrandLogo size="sm" /></a><p lang="ar" dir="rtl" className="text-[11px] font-medium tracking-wide text-[#8A6D35] dark:text-[#C8A86B]">اختاري إطلالتك</p></div>
        <p className="text-xs text-stone-500">© {new Date().getFullYear()} Different Store</p>
      </div>
    </footer>
    <StoreCartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
  </div>;
}
