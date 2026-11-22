import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, CreditCard, Expand, Minus, Plus, RefreshCw, ShoppingBag, Truck, X, ZoomIn, ZoomOut } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { Product } from '../../lib/types';
import { supabase } from '../../lib/supabase';
import { useTranslation } from '../../i18n/useTranslation';
import { useStoreCart } from '../../store/useStoreCart';
import { StorefrontHeader } from './StorefrontHeader';
import { StoreCartDrawer } from './StoreCartDrawer';
import { AlternativesModal } from '../../components/ui/AlternativesModal';
import { type AlternativeVariant, type TaggedProduct } from '../../utils/getSimilarAlternatives';

type ProductPageData = Product & { variants: AlternativeVariant[] };
const NO_COLOR = '__no_color__';
const PRODUCT_COLUMNS = 'id, name, description, category, brand, is_best_seller, compare_at_price, image_url, image_urls, gallery_urls, style_tags, is_active, created_at, updated_at';
const VARIANT_COLUMNS = 'id, product_id, sku, color, size, image_url, unit_sell_price, stock_qty, is_active';

export function ProductDetailsPage() {
  const { id = '' } = useParams();
  const { t, dir, lang, formatCurrency } = useTranslation();
  const addItem = useStoreCart((state) => state.addItem);
  const updateVariantStock = useStoreCart((state) => state.updateVariantStock);
  const removeVariants = useStoreCart((state) => state.removeVariants);
  const cartItems = useStoreCart((state) => state.items);
  const [product, setProduct] = useState<ProductPageData | null>(null);
  const [allProducts, setAllProducts] = useState<TaggedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedColor, setSelectedColor] = useState(NO_COLOR);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false);
  const [stickyAddVisible, setStickyAddVisible] = useState(false);
  const mainAddButtonRef = useRef<HTMLButtonElement>(null);
  const catalogRef = useRef<TaggedProduct[]>([]);
  const variantsRef = useRef<AlternativeVariant[]>([]);

  const loadCatalog = useCallback(async () => {
    const [{ data: productRows, error: productsError }, { data: variantRows, error: variantsError }] = await Promise.all([
      supabase.from('products').select(PRODUCT_COLUMNS).eq('is_active', true).order('created_at', { ascending: false }),
      supabase.from('product_variants').select(VARIANT_COLUMNS).eq('is_active', true),
    ]);
    if (productsError || variantsError) {
      setLoading(false);
      setProduct(null);
      return;
    }
    const rows = productRows ?? [];
    const activeProductIds = new Set(rows.map((row) => row.id));
    const activeVariants = (variantRows ?? []).filter((variant) => activeProductIds.has(variant.product_id));
    const grouped = new Map<string, AlternativeVariant[]>();
    for (const variant of activeVariants) grouped.set(variant.product_id, [...(grouped.get(variant.product_id) ?? []), variant]);
    const nextCatalog: ProductPageData[] = rows.map((row) => ({ ...row, variants: grouped.get(row.id) ?? [] }));
    catalogRef.current = nextCatalog;
    setAllProducts(nextCatalog);
    const nextProduct = nextCatalog.find((row) => row.id === id) ?? null;
    setLoading(false);
    if (!nextProduct) {
      variantsRef.current = [];
      setProduct(null);
      setShowAlternatives(false);
      return;
    }
    variantsRef.current = nextProduct.variants;
    setProduct(nextProduct);
    nextProduct.variants.forEach((variant) => updateVariantStock(variant.id, variant.stock_qty, variant.is_active));
    const firstColor = nextProduct.variants.find((variant) => variant.stock_qty > 0)?.color?.trim()
      || nextProduct.variants[0]?.color?.trim() || null;
    const colorKey = firstColor ?? NO_COLOR;
    setSelectedColor(colorKey);
    setSelectedVariantId(null);
    setQuantity(1);
    setActiveImage(nextProduct.image_url ?? nextProduct.gallery_urls[0]
      ?? nextProduct.variants.find((variant) => (variant.color?.trim() || NO_COLOR) === colorKey && variant.image_url)?.image_url
      ?? nextProduct.variants.find((variant) => variant.image_url)?.image_url ?? nextProduct.image_urls.find(Boolean) ?? null);
  }, [id, updateVariantStock]);

  useEffect(() => {
    void loadCatalog();
    let active = true;
    const channel = supabase.channel('storefront:stock', { config: { private: true } })
      .on('broadcast', { event: 'stock_update' }, ({ payload }) => {
        const variantId = payload?.variant_id;
        const stockQty = payload?.stock_qty;
        const isActive = payload?.is_active;
        if (typeof variantId !== 'string' || !Number.isInteger(stockQty) || typeof isActive !== 'boolean') return;
        const known = variantsRef.current.some((variant) => variant.id === variantId);
        if (isActive && !known) { void loadCatalog(); return; }
        variantsRef.current = variantsRef.current.map((variant) => variant.id === variantId
          ? { ...variant, stock_qty: stockQty as number, is_active: isActive }
          : variant);
        catalogRef.current = catalogRef.current.map((entry) => ({
          ...entry,
          variants: entry.variants.map((variant) => variant.id === variantId
            ? { ...variant, stock_qty: stockQty as number, is_active: isActive }
            : variant),
        }));
        setAllProducts(catalogRef.current);
        setProduct((current) => current ? { ...current, variants: current.variants.map((variant) => variant.id === variantId
          ? { ...variant, stock_qty: stockQty as number, is_active: isActive }
          : variant) } : current);
        updateVariantStock(variantId, stockQty as number, isActive);
      })
      .on('broadcast', { event: 'product_status' }, ({ payload }) => {
        if (payload?.product_id !== id || typeof payload?.is_active !== 'boolean') return;
        if (!payload.is_active) {
          removeVariants(variantsRef.current.map((variant) => variant.id));
          variantsRef.current = [];
          catalogRef.current = catalogRef.current.filter((entry) => entry.id !== id);
          setAllProducts(catalogRef.current);
          setProduct(null);
          setShowAlternatives(false);
          setLoading(false);
        } else {
          void loadCatalog();
        }
      });
    const logStatus = (status: string, error?: Error) => {
      if (!import.meta.env.DEV) return;
      if (status === 'SUBSCRIBED') console.info(`[realtime] product detail stock: ${status}`);
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.error(`[realtime] product detail stock: ${status}`, error);
    };
    void supabase.realtime.setAuth().then(() => {
      if (active) channel.subscribe(logStatus);
    }).catch((error: unknown) => { if (import.meta.env.DEV) console.error('[realtime] Could not set channel auth', error); });
    return () => { active = false; void supabase.removeChannel(channel); };
  }, [id, loadCatalog, updateVariantStock, removeVariants]);

  const images = useMemo(() => product ? [...new Set([
    product.image_url,
    ...product.gallery_urls,
    ...product.variants.map((variant) => variant.image_url),
    ...product.image_urls,
  ].filter((image): image is string => Boolean(image)))] : [], [product]);
  const colorOptions = useMemo(() => product ? [...new Set(product.variants.map((variant) => variant.color?.trim() || NO_COLOR))] : [], [product]);
  const colorVariants = product?.variants.filter((variant) => (variant.color?.trim() || NO_COLOR) === selectedColor) ?? [];
  const selectedVariant = product?.variants.find((variant) => variant.id === selectedVariantId) ?? null;
  const colorPrice = colorVariants.length ? Math.min(...colorVariants.map((variant) => variant.unit_sell_price)) : 0;
  const price = selectedVariant?.unit_sell_price ?? colorPrice;
  const unavailable = !selectedVariant || !selectedVariant.is_active || selectedVariant.stock_qty < 1;
  const lowStock = selectedVariant && selectedVariant.is_active && selectedVariant.stock_qty > 0 && selectedVariant.stock_qty <= 3;
  const cartCount = cartItems.reduce((sum, item) => sum + item.qty, 0);
  const imageIndex = activeImage ? images.indexOf(activeImage) : -1;
  const PreviousImage = dir === 'rtl' ? ChevronRight : ChevronLeft;
  const NextImage = dir === 'rtl' ? ChevronLeft : ChevronRight;
  const related = product ? allProducts.filter((entry) => entry.id !== product.id && entry.category === product.category && entry.variants.some((variant) => variant.is_active && variant.stock_qty > 0)).slice(0, 4) : [];

  const moveImage = useCallback((delta: number) => {
    setActiveImage((current) => {
      if (!images.length) return current;
      const index = Math.max(images.indexOf(current ?? ''), 0);
      return images[(index + delta + images.length) % images.length];
    });
    setZoomed(false);
  }, [images]);

  useEffect(() => {
    if (!lightboxOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setLightboxOpen(false); setZoomed(false); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); moveImage(dir === 'rtl' ? 1 : -1); }
      if (event.key === 'ArrowRight') { event.preventDefault(); moveImage(dir === 'rtl' ? -1 : 1); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', handleKeyDown); };
  }, [lightboxOpen, dir, moveImage]);

  useEffect(() => {
    if (selectedVariant) setQuantity((current) => Math.max(1, Math.min(current, Math.max(1, selectedVariant.stock_qty))));
  }, [selectedVariant?.id, selectedVariant?.stock_qty]);

  useEffect(() => {
    const target = mainAddButtonRef.current;
    if (!target || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => {
      setStickyAddVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [product]);

  function chooseColor(color: string) {
    setSelectedColor(color);
    setSelectedVariantId(null);
    setQuantity(1);
    const colorImage = product?.variants.find((variant) => (variant.color?.trim() || NO_COLOR) === color && variant.image_url)?.image_url;
    if (colorImage) setActiveImage(colorImage);
  }

  function addToCart() {
    if (!product || !selectedVariant || unavailable) return;
    addItem({ variantId: selectedVariant.id, productName: product.name, sku: selectedVariant.sku, color: selectedVariant.color, size: selectedVariant.size, unitPrice: selectedVariant.unit_sell_price, maxStock: selectedVariant.stock_qty, qty: quantity, imageUrl: selectedVariant.image_url ?? activeImage });
    toast.success(t('pdpAddedToCart'));
  }

  const header = <StorefrontHeader cartCount={cartCount} category="all" onCategoryChange={() => undefined} onOpenCart={() => setCartOpen(true)} showNavigation={false} />;
  if (loading) return <div dir={dir} className="min-h-screen bg-stone-50">{header}<div className="grid min-h-[60vh] place-items-center text-sm text-stone-500">{t('storeLoading')}</div><StoreCartDrawer open={cartOpen} onClose={() => setCartOpen(false)} /></div>;
  if (!product) return <div dir={dir} className="min-h-screen bg-stone-50">{header}<main className="mx-auto grid min-h-[65vh] max-w-2xl place-items-center px-4 py-12"><section className="w-full rounded-3xl border border-stone-200 bg-white p-8 text-center"><ShoppingBag className="mx-auto size-10 text-stone-300" /><h1 className="mt-4 text-xl font-black text-stone-900">{t('pdpNotFound')}</h1><Link to="/" className="mt-5 inline-flex rounded-xl bg-stone-900 px-5 py-3 text-sm font-bold text-white">{t('pdpBackToShop')}</Link></section></main><StoreCartDrawer open={cartOpen} onClose={() => setCartOpen(false)} /></div>;

  return <div dir={dir} className="min-h-screen bg-stone-50 text-stone-900">
    {header}
    <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-8">
      <Link to="/" className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-stone-500 transition hover:text-stone-900"><span aria-hidden="true">{dir === 'rtl' ? '→' : '←'}</span>{t('pdpBackToShop')}</Link>
      <div className="mt-4 grid items-start gap-7 lg:grid-cols-[minmax(0,1.05fr)_minmax(22rem,.95fr)] lg:gap-10">
        <section aria-label={t('pdpGallery')} className="min-w-0">
          <div className="group relative aspect-[4/5] overflow-hidden rounded-3xl border border-stone-200 bg-stone-100 sm:aspect-square lg:aspect-[4/5]">
            {activeImage ? <button type="button" onClick={() => { setZoomed(false); setLightboxOpen(true); }} aria-label={t('lightboxOpen')} className="absolute inset-0 size-full cursor-zoom-in"><img src={activeImage} alt={product.name} className="size-full object-cover transition duration-500 group-hover:scale-[1.02]" /><span className="absolute bottom-4 end-4 grid size-10 place-items-center rounded-full bg-white/90 text-stone-800 opacity-0 shadow transition group-hover:opacity-100"><Expand className="size-4" /></span></button> : <div className="grid size-full place-items-center text-stone-300"><ShoppingBag className="size-16" /></div>}
            {images.length > 1 && <><button type="button" onClick={() => moveImage(-1)} aria-label={t('previous')} className="absolute start-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-stone-800 shadow-md"><PreviousImage className="size-5" /></button><button type="button" onClick={() => moveImage(1)} aria-label={t('next')} className="absolute end-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-stone-800 shadow-md"><NextImage className="size-5" /></button></>}
            <span className="absolute start-4 top-4 rounded-full bg-white/90 px-3 py-1.5 text-xs font-bold text-stone-700 backdrop-blur">{product.category === 'bags' ? t('posBags') : t('posShoes')}</span>
          </div>
          {images.length > 1 && <div className="mt-3 flex gap-2 overflow-x-auto pb-1">{images.map((image, index) => <button key={image} type="button" onClick={() => { setActiveImage(image); setZoomed(false); }} aria-label={`${t('pdpGallery')} ${index + 1}`} aria-pressed={image === activeImage} className={`size-20 shrink-0 overflow-hidden rounded-xl border-2 transition ${image === activeImage ? 'border-rose-500' : 'border-stone-200 opacity-75 hover:opacity-100'}`}><img src={image} alt="" className="size-full object-cover" /></button>)}</div>}
        </section>

        <section className="min-w-0 space-y-6 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:p-7 lg:sticky lg:top-24">
          <div><span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700">{product.category === 'bags' ? t('posBags') : t('posShoes')}</span><h1 className="mt-3 text-2xl font-black leading-tight text-stone-900 sm:text-3xl">{product.name}</h1><p className="mt-2 text-2xl font-black text-rose-700">{formatCurrency(price)}</p></div>
          {colorOptions.length > 0 && <fieldset><legend className="mb-3 text-sm font-bold text-stone-800">{t('pdpChooseColor')}</legend><div className="flex flex-wrap gap-2">{colorOptions.map((color) => <button key={color} type="button" onClick={() => chooseColor(color)} aria-pressed={selectedColor === color} className={`min-h-10 rounded-xl border px-4 py-2 text-sm font-semibold transition ${selectedColor === color ? 'border-rose-500 bg-rose-50 text-rose-800' : 'border-stone-200 text-stone-600 hover:border-stone-400'}`}>{color === NO_COLOR ? t('oneColor') : color}</button>)}</div></fieldset>}
          <fieldset><div className="mb-3 flex items-center justify-between gap-3"><legend className="text-sm font-bold text-stone-800">{t('pdpChooseSize')}</legend><button type="button" onClick={() => setSizeGuideOpen(true)} className="text-xs font-semibold text-rose-700 underline underline-offset-4">{t('pdpSizeGuide')}</button></div>{colorVariants.length ? <div className="flex flex-wrap gap-2">{colorVariants.map((variant) => {
            const selected = selectedVariantId === variant.id;
            const out = !variant.is_active || variant.stock_qty < 1;
            return <button key={variant.id} type="button" onClick={() => { setSelectedVariantId(variant.id); setQuantity(1); }} aria-pressed={selected} className={`min-h-11 min-w-14 rounded-xl border px-3 py-2 text-sm font-bold transition ${selected ? 'border-stone-900 bg-stone-900 text-white' : out ? 'border-stone-200 bg-stone-50 text-stone-400 line-through hover:border-rose-300' : 'border-stone-200 text-stone-700 hover:border-rose-400 hover:bg-rose-50'}`}>{variant.size?.trim() || t('pdpNoSize')}</button>;
          })}</div> : <p className="text-sm text-stone-500">{t('posNoVariantsAvailable')}</p>}</fieldset>
          {selectedVariant && <div className={`rounded-xl px-4 py-3 text-sm ${unavailable ? 'bg-stone-100 text-stone-600' : lowStock ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-bold">{unavailable ? t('storeOutOfStock') : lowStock ? t('pdpScarcity').replace('{count}', new Intl.NumberFormat(lang).format(selectedVariant.stock_qty)) : t('pdpInStock')}</span><span className="text-xs">{t('pdpSelectedSku')}: <b dir="ltr">{selectedVariant.sku}</b></span></div>
            {unavailable && <button type="button" onClick={() => setShowAlternatives(true)} className="mt-2 text-start text-xs font-bold text-rose-700 underline underline-offset-4">{t('pdpViewAlternatives')}</button>}
          </div>}
          <div className="flex flex-wrap items-center justify-between gap-4 border-y border-stone-100 py-4"><span className="text-sm font-semibold text-stone-700">{t('pdpQuantity')}</span><div className="inline-flex items-center gap-2 rounded-xl bg-stone-100 p-1"><button type="button" disabled={!selectedVariant || quantity <= 1} onClick={() => setQuantity((value) => Math.max(1, value - 1))} aria-label={t('adjustmentDecrease')} className="grid size-9 place-items-center rounded-lg text-stone-600 disabled:opacity-40"><Minus className="size-4" /></button><span className="min-w-8 text-center text-sm font-bold">{new Intl.NumberFormat(lang).format(quantity)}</span><button type="button" disabled={!selectedVariant || unavailable || quantity >= selectedVariant.stock_qty} onClick={() => selectedVariant && setQuantity((value) => Math.min(selectedVariant.stock_qty, value + 1))} aria-label={t('adjustmentIncrease')} className="grid size-9 place-items-center rounded-lg text-stone-600 disabled:opacity-40"><Plus className="size-4" /></button></div></div>
          <button ref={mainAddButtonRef} type="button" onClick={addToCart} disabled={unavailable} className="min-h-13 w-full rounded-xl bg-stone-900 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300">{t('pdpAddToCart')}</button>
          <div className="grid grid-cols-3 gap-2 border-y border-stone-100 py-3 text-center text-[10px] font-medium text-stone-600 sm:text-xs">{[{ icon: CreditCard, label: t('pdpTrustCod') }, { icon: RefreshCw, label: t('pdpTrustExchange') }, { icon: Truck, label: t('pdpTrustShipping') }].map(({ icon: Icon, label }) => <div key={label} className="flex flex-col items-center gap-1.5"><Icon className="size-4 text-rose-700" /><span>{label}</span></div>)}</div>
          <div className="divide-y divide-stone-200 border-y border-stone-200">
            <details className="group py-3"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-bold text-stone-800 marker:hidden">{t('pdpInfoCare')}<ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" /></summary><p className="whitespace-pre-line pt-3 text-sm leading-7 text-stone-600">{product.description || '—'}<br />{t('pdpCareNote')}</p></details>
            <details className="group py-3"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-bold text-stone-800 marker:hidden">{t('pdpInfoShipping')}<ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" /></summary><p className="pt-3 text-sm leading-7 text-stone-600">{t('pdpDeliveryPolicy')}</p></details>
            <details className="group py-3"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-bold text-stone-800 marker:hidden">{t('pdpInfoReturns')}<ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" /></summary><p className="pt-3 text-sm leading-7 text-stone-600">{t('pdpReturnPolicy')}</p></details>
          </div>
          {!!product.style_tags.length && <div><h2 className="mb-2 text-sm font-bold text-stone-800">{t('pdpStyleTags')}</h2><div className="flex flex-wrap gap-2">{product.style_tags.map((tag) => <span key={tag} className="rounded-full bg-stone-100 px-3 py-1.5 text-xs font-medium text-stone-600">{tag}</span>)}</div></div>}
        </section>
      </div>

      {related.length > 0 && <section className="mt-12"><h2 className="text-xl font-black">{t('pdpRelated')}</h2><div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{related.map((alternative) => {
        const availableVariants = alternative.variants.filter((variant) => variant.is_active && variant.stock_qty > 0);
        const image = alternative.image_url ?? alternative.gallery_urls[0] ?? availableVariants.find((variant) => variant.image_url)?.image_url ?? alternative.image_urls[0];
        const priceFrom = Math.min(...availableVariants.map((variant) => variant.unit_sell_price));
        const hoverImage = alternative.gallery_urls.length >= 2 ? alternative.gallery_urls[1] : null;
        return <Link key={alternative.id} to={`/product/${alternative.id}`} className="group overflow-hidden rounded-lg border border-stone-200 bg-white transition hover:shadow-lg"><div className="relative aspect-[4/5] overflow-hidden bg-stone-100">{image ? <img src={image} alt={alternative.name} className="absolute inset-0 size-full object-cover transition duration-500 group-hover:scale-105" /> : <div className="grid size-full place-items-center text-stone-300"><ShoppingBag className="size-10" /></div>}{hoverImage && <img src={hoverImage} alt="" aria-hidden="true" className="absolute inset-0 size-full object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100" />}</div><div className="space-y-2 p-3"><h3 className="line-clamp-1 text-sm font-bold text-stone-900">{alternative.name}</h3><p className="text-sm font-black text-rose-700">{t('storeStartingPrice').replace('{price}', formatCurrency(priceFrom))}</p></div></Link>;
      })}</div></section>}
    </main>
    <StoreCartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    {stickyAddVisible && <div dir={dir} className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white/95 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] shadow-2xl backdrop-blur md:hidden"><div className="mx-auto flex max-w-7xl items-center gap-3"><div className="min-w-0 flex-1"><p className="font-bold">{formatCurrency(price)}</p><p className="truncate text-xs text-stone-500">{selectedVariant ? `${selectedVariant.color?.trim() || t('oneColor')} · ${selectedVariant.size?.trim() || t('pdpNoSize')}` : t('pdpChooseSize')}</p></div><button type="button" onClick={addToCart} disabled={unavailable} className="min-h-11 rounded-lg bg-stone-900 px-5 py-2 text-sm font-bold text-white disabled:opacity-50">{t('pdpMobileAdd')}</button></div></div>}
    {sizeGuideOpen && <div dir={dir} role="presentation" className="fixed inset-0 z-[80] grid place-items-center bg-stone-950/55 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setSizeGuideOpen(false); }}><section role="dialog" aria-modal="true" aria-labelledby="size-guide-title" className="dialog-panel max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg border border-stone-200 bg-white p-5 shadow-2xl sm:p-6"><header className="mb-4 flex items-center justify-between gap-3"><h2 id="size-guide-title" className="text-lg font-black">{product.category === 'bags' ? t('pdpSizeGuideBags') : t('pdpSizeGuideShoes')}</h2><button type="button" onClick={() => setSizeGuideOpen(false)} aria-label={t('lightboxClose')} className="grid size-9 place-items-center rounded-md text-stone-500 hover:bg-stone-100"><X className="size-5" /></button></header>{product.category === 'bags' ? <div className="overflow-x-auto"><table className="w-full text-start text-sm"><thead className="border-b border-stone-200 text-stone-500"><tr><th className="p-3">{t('size')}</th><th className="p-3">{t('pdpBagDimensions')}</th></tr></thead><tbody className="divide-y divide-stone-100">{[[t('pdpBagMini'), '18 × 13 × 7 cm'], [t('pdpBagMedium'), '25 × 18 × 10 cm'], [t('pdpBagLarge'), '32 × 25 × 14 cm']].map(([label, dimensions]) => <tr key={label}><td className="p-3 font-semibold">{label}</td><td dir="ltr" className="p-3 text-start">{dimensions}</td></tr>)}</tbody></table></div> : <div className="overflow-x-auto"><table className="w-full text-start text-sm"><thead className="border-b border-stone-200 text-stone-500"><tr><th className="p-3">{t('pdpSizeGuideEu')}</th><th className="p-3">{t('pdpSizeGuideCm')}</th></tr></thead><tbody className="divide-y divide-stone-100">{[['36', '23'], ['37', '23.5'], ['38', '24.3'], ['39', '25'], ['40', '25.7'], ['41', '26.3']].map(([eu, cm]) => <tr key={eu}><td className="p-3 font-semibold">{eu}</td><td className="p-3">{cm}</td></tr>)}</tbody></table></div>}<p className="mt-4 text-xs text-stone-500">{t('pdpSizeGuideNote')}</p></section></div>}
    {lightboxOpen && activeImage && <div dir={dir} role="dialog" aria-modal="true" aria-label={t('pdpGallery')} className="fixed inset-0 z-[90] flex flex-col bg-stone-950/95 text-white" onMouseDown={(event) => { if (event.target === event.currentTarget) { setLightboxOpen(false); setZoomed(false); } }}>
      <header className="flex shrink-0 items-center justify-between gap-3 px-4 py-3 sm:px-6"><button type="button" onClick={() => { setLightboxOpen(false); setZoomed(false); }} aria-label={t('lightboxClose')} className="grid size-11 place-items-center rounded-full border border-[rgba(255,255,255,0.4)] bg-neutral-900/90 text-white shadow-lg transition-colors hover:bg-neutral-800"><X className="size-5 text-white" /></button><span dir="ltr" className="text-sm font-semibold text-white/80">{imageIndex + 1} / {images.length}</span><span className="sr-only" aria-live="polite">{zoomed ? t('lightboxZoomed') : ''}</span><button type="button" onClick={() => setZoomed((value) => !value)} aria-label={zoomed ? t('lightboxZoomOut') : t('lightboxZoomIn')} className="grid size-11 place-items-center rounded-full border border-[rgba(255,255,255,0.4)] bg-neutral-900/90 text-white shadow-lg transition-colors hover:bg-neutral-800">{zoomed ? <ZoomOut className="size-5 text-white" /> : <ZoomIn className="size-5 text-white" />}</button></header>
      <div className={`relative flex min-h-0 flex-1 ${zoomed ? 'overflow-auto' : 'items-center justify-center overflow-hidden'}`}>
        {images.length > 1 && <button type="button" onClick={() => moveImage(-1)} aria-label={t('previous')} className="absolute start-3 top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full border border-[rgba(255,255,255,0.4)] bg-neutral-900/90 text-white shadow-lg backdrop-blur transition-colors hover:bg-neutral-800 sm:start-6"><PreviousImage className="size-5 text-white" /></button>}
        <img src={activeImage} alt={product.name} onClick={() => setZoomed((value) => !value)} className={`transition-all duration-300 ${zoomed ? 'w-[200%] max-w-none cursor-zoom-out object-contain' : 'max-h-full max-w-full cursor-zoom-in object-contain'}`} />
        {images.length > 1 && <button type="button" onClick={() => moveImage(1)} aria-label={t('next')} className="absolute end-3 top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full border border-[rgba(255,255,255,0.4)] bg-neutral-900/90 text-white shadow-lg backdrop-blur transition-colors hover:bg-neutral-800 sm:end-6"><NextImage className="size-5 text-white" /></button>}
      </div>
      {images.length > 1 && <nav aria-label={t('pdpGallery')} className="flex shrink-0 justify-center gap-2 overflow-x-auto px-4 py-3">{images.map((image, index) => <button key={image} type="button" onClick={() => { setActiveImage(image); setZoomed(false); }} aria-label={`${t('pdpGallery')} ${index + 1}`} aria-current={image === activeImage} className={`size-14 shrink-0 overflow-hidden rounded-lg border-2 ${image === activeImage ? 'border-white' : 'border-white/20 opacity-60 hover:opacity-100'}`}><img src={image} alt="" className="size-full object-cover" /></button>)}</nav>}
    </div>}
    {showAlternatives && <AlternativesModal targetProduct={product} requestedVariant={selectedVariant} allActiveProducts={allProducts} mode="storefront" onClose={() => setShowAlternatives(false)} onAdd={(target, variant) => { addItem({ variantId: variant.id, productName: target.name, sku: variant.sku, color: variant.color, size: variant.size, unitPrice: variant.unit_sell_price, maxStock: variant.stock_qty, qty: 1, imageUrl: variant.image_url ?? target.image_url ?? target.gallery_urls[0] ?? target.image_urls[0] ?? null }); setShowAlternatives(false); }} />}
  </div>;
}
