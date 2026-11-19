import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Minus, PackageOpen, Plus, ReceiptText, Search, ShoppingBag, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Product, ProductVariant, PaymentMethod } from '../../lib/types';
import { supabase } from '../../lib/supabase';
import { useTranslation } from '../../i18n/useTranslation';
import { usePosCart } from '../../store/usePosCart';
import { AlternativesModal } from '../../components/ui/AlternativesModal';
import type { AlternativeVariant, TaggedProduct } from '../../utils/getSimilarAlternatives';
import { formatVariantLabel } from '../../utils/formatVariantLabel';

type CatalogProduct = Product & { variants: ProductVariant[] };
type CategoryFilter = 'all' | 'sneakers' | 'bags';

export function PosPage() {
  const { t, dir, lang, formatCurrency } = useTranslation();
  const items = usePosCart((state) => state.items);
  const addItem = usePosCart((state) => state.addItem);
  const updateQty = usePosCart((state) => state.updateQty);
  const removeItem = usePosCart((state) => state.removeItem);
  const syncStock = usePosCart((state) => state.syncStock);
  const clearCart = usePosCart((state) => state.clearCart);
  const subtotal = usePosCart((state) => state.subtotal());
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [submitting, setSubmitting] = useState(false);
  const [alternativesRequest, setAlternativesRequest] = useState<{ productId: string; variantId: string } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const loadErrorMessage = t('posLoadError');

  const loadCatalog = useCallback(async (showError = true) => {
    const [{ data: productRows, error: productError }, { data: variantRows, error: variantError }] = await Promise.all([
      supabase.from('products').select('*').eq('is_active', true).order('created_at', { ascending: false }),
      supabase.from('product_variants').select('*').eq('is_active', true).order('created_at'),
    ]);
    if (productError || variantError) {
      if (showError) toast.error(loadErrorMessage);
      setLoading(false);
      return;
    }
    const grouped = new Map<string, ProductVariant[]>();
    for (const variant of variantRows ?? []) grouped.set(variant.product_id, [...(grouped.get(variant.product_id) ?? []), variant]);
    const activeProducts = productRows ?? [];
    const activeProductIds = new Set(activeProducts.map((product) => product.id));
    const activeVariants = (variantRows ?? []).filter((variant) => activeProductIds.has(variant.product_id));
    syncStock(Object.fromEntries(activeVariants.map((variant) => [variant.id, variant.stock_qty])));
    setProducts(activeProducts.map((product) => ({ ...product, variants: grouped.get(product.id) ?? [] })));
    setLoading(false);
  }, [loadErrorMessage, syncStock]);

  useEffect(() => {
    void loadCatalog();
    const channel = supabase.channel('pos-catalog-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => void loadCatalog(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_variants' }, () => void loadCatalog(false))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [loadCatalog]);

  const visibleProducts = useMemo(() => {
    const value = search.trim().toLocaleLowerCase(lang);
    return products.filter((product) => {
      if (category !== 'all' && product.category !== category) return false;
      if (!value) return true;
      return product.name.toLocaleLowerCase(lang).includes(value) || product.variants.some((variant) => variant.sku.toLocaleLowerCase(lang).includes(value));
    }).map((product) => {
      const value = search.trim().toLocaleLowerCase(lang);
      const matched = value && !product.name.toLocaleLowerCase(lang).includes(value)
        ? product.variants.filter((variant) => variant.sku.toLocaleLowerCase(lang).includes(value))
        : product.variants;
      return { ...product, variants: matched };
    });
  }, [products, search, category, lang]);

  const alternativesTarget = alternativesRequest ? products.find((product) => product.id === alternativesRequest.productId) : null;
  const requestedVariant = alternativesTarget?.variants.find((variant) => variant.id === alternativesRequest?.variantId) ?? null;
  const addAlternative = (product: TaggedProduct, variant: AlternativeVariant) => {
    const image = variant.image_url ?? product.image_url ?? product.gallery_urls[0] ?? product.image_urls[0] ?? null;
    addItem({ variantId: variant.id, productName: product.name, sku: variant.sku, color: variant.color, size: variant.size, unitPrice: variant.unit_sell_price, maxStock: variant.stock_qty, qty: 1, imageUrl: image });
    setAlternativesRequest(null);
    searchRef.current?.focus();
  };

  async function completeSale() {
    if (items.length === 0 || submitting) return;
    setSubmitting(true);
    const { data: orderId, error } = await supabase.rpc('create_order_atomic', {
      order_payload: {
        source: 'pos',
        status: 'delivered',
        shipping_fee: 0,
        cod_fee: 0,
        payment_method: paymentMethod,
        customer_name: customerName.trim() || t('posWalkInCustomer'),
        customer_phone: customerPhone.trim() || t('posPhoneNotProvided'),
      },
      items_array: items.map((item) => ({ variant_id: item.variantId, quantity: item.qty })),
    });

    if (error || !orderId) {
      setSubmitting(false);
      toast.error(t('posSaleError'));
      await loadCatalog(false);
      searchRef.current?.focus();
      return;
    }

    const { data: order } = await supabase.from('orders').select('order_number').eq('id', orderId).single();
    const orderNumber = typeof order?.order_number === 'number'
      ? new Intl.NumberFormat(lang).format(order.order_number)
      : order?.order_number ?? t('posOrderNumberUnavailable');
    toast.success(t('posSaleSuccess').replace('{order}', orderNumber));
    clearCart();
    setCustomerName('');
    setCustomerPhone('');
    setPaymentMethod('cash');
    await loadCatalog(false);
    setSubmitting(false);
    searchRef.current?.focus();
  }

  return <div dir={dir} className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_25rem]">
    <section className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-black text-stone-900">{t('posCatalogTitle')}</h1><p className="mt-1 text-sm text-stone-500">{t('posCatalogSubtitle')}</p></div>
        <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700"><span className="size-2 rounded-full bg-emerald-500" />{t('posSaleInProgress')}</span>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="relative min-w-0 flex-1"><Search className={`absolute top-3.5 size-4 text-stone-400 ${dir === 'rtl' ? 'end-3' : 'start-3'}`} /><input ref={searchRef} autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('posSearchPlaceholder')} className={`h-12 w-full rounded-xl border border-stone-300 bg-white text-sm outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100 ${dir === 'rtl' ? 'pe-10 ps-4' : 'ps-10 pe-4'}`} /></label>
        <div className="flex shrink-0 rounded-xl bg-stone-100 p-1">
          {([{ value: 'all', key: 'posAllCategories' }, { value: 'sneakers', key: 'posShoes' }, { value: 'bags', key: 'posBags' }] as const).map((option) => <button key={option.value} onClick={() => setCategory(option.value)} className={`min-h-10 rounded-lg px-3 text-sm font-semibold transition sm:px-4 ${category === option.value ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-800'}`}>{t(option.key)}</button>)}
        </div>
      </div>

      {loading ? <div className="grid min-h-64 place-items-center rounded-2xl border border-stone-200 bg-white text-sm text-stone-500">{t('posLoadingProducts')}</div> : visibleProducts.length === 0 ? <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-stone-300 bg-white text-sm text-stone-500">{t('posNoProducts')}</div> :
        <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
          {visibleProducts.map((product) => {
            const image = product.image_url ?? product.gallery_urls[0] ?? product.variants.find((variant) => variant.image_url)?.image_url ?? product.image_urls[0];
            return <article key={product.id} className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
              <div className="flex gap-3 border-b border-stone-100 p-3">
                {image ? <img src={image} alt={product.name} className="size-16 shrink-0 rounded-xl bg-stone-100 object-cover" /> : <div className="grid size-16 shrink-0 place-items-center rounded-xl bg-stone-100 text-stone-400"><ShoppingBag className="size-6" /></div>}
                <div className="min-w-0 self-center"><h2 className="truncate font-bold text-stone-900">{product.name}</h2><span className="mt-1 inline-block rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-500">{product.category === 'bags' ? t('posBags') : t('posShoes')}</span></div>
              </div>
              <div className="space-y-2 p-3">
                {product.variants.length === 0 ? <p className="py-2 text-center text-xs text-stone-400">{t('posNoVariantsAvailable')}</p> : product.variants.map((variant) => {
                  const outOfStock = variant.stock_qty === 0;
                  const inCart = items.find((item) => item.variantId === variant.id)?.qty ?? 0;
                  return <button key={variant.id} type="button" onClick={() => {
                    if (outOfStock) { setAlternativesRequest({ productId: product.id, variantId: variant.id }); return; }
                    addItem({ variantId: variant.id, productName: product.name, sku: variant.sku, color: variant.color, size: variant.size, unitPrice: variant.unit_sell_price, maxStock: variant.stock_qty, qty: 1, imageUrl: variant.image_url ?? image ?? null });
                    searchRef.current?.focus();
                  }} className={`flex min-h-14 w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-start transition ${outOfStock ? 'cursor-pointer border-stone-200 bg-stone-50 text-stone-400 hover:border-rose-300' : 'border-stone-200 hover:border-rose-300 hover:bg-rose-50/50 active:scale-[0.99]'}`}>
                    <span className="min-w-0"><span className="block truncate text-sm font-semibold">{formatVariantLabel(variant.color, variant.size, t)}</span><span className="mt-0.5 block text-xs text-stone-500">{formatCurrency(variant.unit_sell_price)} · {outOfStock ? t('posOutOfStock') : `${t('posStockRemaining')}: ${new Intl.NumberFormat(lang).format(variant.stock_qty)}`}</span></span>
                    {outOfStock && <span className="shrink-0 text-[10px] font-bold text-rose-700">{t('alternativesSee')}</span>}
                    {inCart > 0 && <span className="grid size-7 shrink-0 place-items-center rounded-full bg-rose-100 text-xs font-bold text-rose-700">{new Intl.NumberFormat(lang).format(inCart)}</span>}
                  </button>;
                })}
              </div>
            </article>;
          })}
        </div>}
    </section>

    <aside className="h-fit min-w-0 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm xl:sticky xl:top-20">
      <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4"><h2 className="flex items-center gap-2 font-bold text-stone-900"><ReceiptText className="size-5 text-rose-600" />{t('posCurrentSale')}</h2><span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-bold text-stone-600">{new Intl.NumberFormat(lang).format(items.reduce((count, item) => count + item.qty, 0))}</span></div>

      {items.length === 0 ? <div className="grid min-h-44 place-items-center px-5 text-center"><div><PackageOpen className="mx-auto size-9 text-stone-300" /><p className="mt-3 font-semibold text-stone-600">{t('posCartEmpty')}</p><p className="mt-1 text-xs text-stone-400">{t('posCartEmptyHint')}</p></div></div> : <div className="max-h-[36vh] space-y-3 overflow-y-auto p-4">
        {items.map((item) => <article key={item.variantId} className="flex gap-3 rounded-xl border border-stone-100 p-3">
          {item.imageUrl ? <img src={item.imageUrl} alt={item.productName} className="size-14 shrink-0 rounded-lg bg-stone-100 object-cover" /> : <div className="grid size-14 shrink-0 place-items-center rounded-lg bg-stone-100 text-stone-400"><ShoppingBag className="size-5" /></div>}
          <div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="truncate text-sm font-bold text-stone-800">{item.productName}</h3><p className="mt-0.5 truncate text-xs text-stone-500">{formatVariantLabel(item.color, item.size, t)} · {item.sku}</p></div><button onClick={() => removeItem(item.variantId)} aria-label={t('posRemoveItem')} title={t('posRemoveItem')} className="rounded-md p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="size-4" /></button></div>
            <div className="mt-2 flex items-center justify-between gap-2"><div className="inline-flex items-center gap-1 rounded-lg bg-stone-100 p-1"><button disabled={item.qty <= 1} onClick={() => updateQty(item.variantId, item.qty - 1)} aria-label={t('adjustmentDecrease')} className="grid size-7 place-items-center rounded-md text-stone-600 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"><Minus className="size-3.5" /></button><span aria-label={t('posQuantity')} className="min-w-6 text-center text-xs font-bold">{new Intl.NumberFormat(lang).format(item.qty)}</span><button disabled={item.qty >= item.maxStock} onClick={() => updateQty(item.variantId, item.qty + 1)} aria-label={t('adjustmentIncrease')} className="grid size-7 place-items-center rounded-md text-stone-600 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"><Plus className="size-3.5" /></button></div><span className="text-sm font-bold text-stone-800">{formatCurrency(item.unitPrice * item.qty)}</span></div>
          </div>
        </article>)}
      </div>}

      <div className="space-y-4 border-t border-stone-200 p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <label className="text-start text-xs font-semibold text-stone-600">{t('posCustomerName')} <span className="font-normal text-stone-400">({t('posOptional')})</span><input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder={t('posCustomerNamePlaceholder')} className="mt-1.5 h-10 w-full rounded-lg border border-stone-300 px-3 text-start text-sm outline-none focus:border-rose-500" /></label>
          <label className="text-start text-xs font-semibold text-stone-600">{t('posCustomerPhone')} <span className="font-normal text-stone-400">({t('posOptional')})</span><input type="tel" inputMode="tel" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder={t('posCustomerPhonePlaceholder')} className="mt-1.5 h-10 w-full rounded-lg border border-stone-300 px-3 text-start text-sm outline-none focus:border-rose-500" /></label>
        </div>

        <fieldset><legend className="mb-2 text-xs font-semibold text-stone-600">{t('posPaymentMethod')}</legend><div className="grid grid-cols-2 gap-2">{([{ value: 'cash', key: 'posCash' }, { value: 'instapay', key: 'posInstaPay' }] as const).map((option) => <button key={option.value} type="button" aria-pressed={paymentMethod === option.value} onClick={() => setPaymentMethod(option.value)} className={`min-h-11 rounded-xl border text-sm font-bold transition ${paymentMethod === option.value ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-stone-200 text-stone-600 hover:bg-stone-50'}`}>{t(option.key)}</button>)}</div></fieldset>

        <div className="space-y-2 border-t border-dashed border-stone-200 pt-3"><div className="flex justify-between text-sm text-stone-500"><span>{t('posSubtotal')}</span><span>{formatCurrency(subtotal)}</span></div><div className="flex items-center justify-between text-base font-black text-stone-900"><span>{t('posTotal')}</span><span>{formatCurrency(subtotal)}</span></div></div>
        <button disabled={items.length === 0 || submitting} onClick={() => void completeSale()} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 py-3 text-sm font-bold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300">{submitting ? t('posCompletingSale') : t('posCompleteSale')}</button>
      </div>
    </aside>
    {alternativesTarget && <AlternativesModal targetProduct={alternativesTarget} requestedVariant={requestedVariant} allActiveProducts={products} mode="pos" onClose={() => setAlternativesRequest(null)} onAdd={addAlternative} />}
  </div>;
}
