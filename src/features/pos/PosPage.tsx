import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Banknote, CalendarClock, CheckCircle2, CreditCard, History, LoaderCircle, Minus, PackageOpen, Plus, Printer, ReceiptText, RotateCcw, Search, ShoppingBag, Trash2, X, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { Product, ProductVariant, PaymentMethod } from '../../lib/types';
import { supabase } from '../../lib/supabase';
import { useTranslation } from '../../i18n/useTranslation';
import { usePosCart, type PosCartItem } from '../../store/usePosCart';
import { AlternativesModal } from '../../components/ui/AlternativesModal';
import type { AlternativeVariant, TaggedProduct } from '../../utils/getSimilarAlternatives';
import { formatVariantLabel } from '../../utils/formatVariantLabel';
import { useHeldPosCarts, type HeldPosCart } from '../../store/useHeldPosCarts';
import { normalizeEgyptianPhone } from '../../utils/normalizeEgyptianPhone';
import { ShiftControls } from './ShiftControls';
import { useStaffStore } from '../../store/staffStore';
import { useAuthStore } from '../../store/authStore';
import { QuickReturnModal } from './QuickReturnModal';

type CatalogProduct = Product & { variants: ProductVariant[] };
type CategoryFilter = 'all' | 'sneakers' | 'bags';
type PosPaymentMethod = Extract<PaymentMethod, 'cash' | 'instapay'>;

interface PosReceipt {
  orderId: string;
  orderNumber: string;
  createdAt: string;
  customerName: string;
  items: PosCartItem[];
  subtotal: number;
  discountAmount: number;
  total: number;
  paymentMethod: PosPaymentMethod;
  cashTendered: number | null;
  changeDue: number;
  cashierName: string;
}
type RecentReceipt = { id: string; order_number: number; customer_name: string; subtotal_egp: number; discount_amount: number; total_egp: number; created_at: string; payment_method: PaymentMethod; cashier_id: string | null };

export function PosPage() {
  const { t, dir, lang, formatCurrency } = useTranslation();
  const staffRole = useStaffStore((state) => state.role);
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const userEmail = useAuthStore((state) => state.user?.email ?? '');
  const [shiftOpen, setShiftOpen] = useState(false);
  const [shiftId, setShiftId] = useState<string | null>(null);
  const items = usePosCart((state) => state.items);
  const addItem = usePosCart((state) => state.addItem);
  const updateQty = usePosCart((state) => state.updateQty);
  const removeItem = usePosCart((state) => state.removeItem);
  const syncStock = usePosCart((state) => state.syncStock);
  const clearCart = usePosCart((state) => state.clearCart);
  const restoreItems = usePosCart((state) => state.restoreItems);
  const subtotal = usePosCart((state) => state.subtotal());
  const allHeldCarts = useHeldPosCarts((state) => state.carts);
  const heldCarts = useMemo(() => allHeldCarts.filter((cart) => cart.cashierId === userId), [allHeldCarts, userId]);
  const holdCart = useHeldPosCarts((state) => state.holdCart);
  const removeHeldCart = useHeldPosCarts((state) => state.removeHeldCart);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PosPaymentMethod>('cash');
  const [submitting, setSubmitting] = useState(false);
  const [alternativesRequest, setAlternativesRequest] = useState<{ productId: string; variantId: string } | null>(null);
  const [heldCartsOpen, setHeldCartsOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [cashTendered, setCashTendered] = useState('');
  const [discountMode, setDiscountMode] = useState<'amount' | 'final'>('amount');
  const [discountInput, setDiscountInput] = useState('');
  const [receipt, setReceipt] = useState<PosReceipt | null>(null);
  const [receiptPhone, setReceiptPhone] = useState('');
  const [receiptPhoneTouched, setReceiptPhoneTouched] = useState(false);
  const [quickReturnOpen, setQuickReturnOpen] = useState(false);
  const [quickReturnOrderId, setQuickReturnOrderId] = useState<string | null>(null);
  const [receiptsOpen, setReceiptsOpen] = useState(false);
  const [recentReceipts, setRecentReceipts] = useState<RecentReceipt[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const saleSubmittingRef = useRef(false);
  const loadErrorMessage = t('posLoadError');

  const loadCatalog = useCallback(async (showError = true) => {
    const [{ data: productRows, error: productError }, { data: variantRows, error: variantError }] = await Promise.all([
      supabase.from('products').select('*').eq('is_active', true).order('created_at', { ascending: false }),
      supabase.from('product_variants').select('id,product_id,sku,color,size,image_url,unit_sell_price,stock_qty,is_active,created_at,updated_at').eq('is_active', true).order('created_at'),
    ]);
    if (productError || variantError) {
      if (showError) toast.error(loadErrorMessage);
      setLoading(false);
      return;
    }
    const grouped = new Map<string, ProductVariant[]>();
    for (const row of variantRows ?? []) {
      const variant = { ...row, unit_cost_price: 0 } as ProductVariant;
      grouped.set(variant.product_id, [...(grouped.get(variant.product_id) ?? []), variant]);
    }
    const activeProducts = productRows ?? [];
    const activeProductIds = new Set(activeProducts.map((product) => product.id));
    const activeVariants = [...grouped.values()].flat().filter((variant) => activeProductIds.has(variant.product_id));
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

  useEffect(() => {
    clearCart();
    setCustomerName('');
    setCustomerPhone('');
    setCashTendered('');
    setDiscountInput('');
    setCheckoutOpen(false);
  }, [userId, clearCart]);

  const refreshShift = useCallback(async () => {
    if (!userId) { setShiftOpen(false); setShiftId(null); return; }
    const { data, error } = await supabase.from('shifts').select('id').eq('cashier_id', userId).eq('status', 'open').maybeSingle();
    if (error) console.error('[PosPage] Active shift query failed:', error);
    setShiftOpen(Boolean(data));
    setShiftId(data?.id ?? null);
  }, [userId]);
  useEffect(() => {
    void refreshShift();
    window.addEventListener('different-store-shift-updated', refreshShift);
    return () => window.removeEventListener('different-store-shift-updated', refreshShift);
  }, [refreshShift]);
  const canSell = staffRole !== 'cashier' || shiftOpen;

  const loadRecentReceipts = useCallback(async () => {
    if (!shiftId) { setRecentReceipts([]); return; }
    const { data, error } = await supabase.from('orders').select('id,order_number,customer_name,subtotal_egp,discount_amount,total_egp,created_at,payment_method,cashier_id').eq('shift_id', shiftId).eq('channel', 'pos').order('created_at', { ascending: false }).limit(25);
    if (error) { console.error('[PosPage] Recent receipts query failed:', error); toast.error(t('posRecentReceiptsError')); setRecentReceipts([]); return; }
    setRecentReceipts(data ?? []);
  }, [shiftId, t]);

  useEffect(() => { if (receiptsOpen) void loadRecentReceipts(); }, [receiptsOpen, loadRecentReceipts]);

  async function reprintReceipt(order: RecentReceipt) {
    const { data: orderItems, error } = await supabase.from('order_items').select('id,variant_id,product_name,variant_sku,quantity,unit_sell_price').eq('order_id', order.id);
    if (error) { console.error('[PosPage] Receipt items query failed:', error); toast.error(t('posRecentReceiptsError')); return; }
    const receiptItems: PosCartItem[] = (orderItems ?? []).map((item) => {
      const variant = products.flatMap((product) => product.variants).find((entry) => entry.id === item.variant_id);
      return { variantId: item.variant_id ?? item.id, productName: item.product_name, sku: item.variant_sku, color: variant?.color ?? null, size: variant?.size ?? null, unitPrice: Number(item.unit_sell_price), maxStock: Math.max(item.quantity, variant?.stock_qty ?? 0), qty: item.quantity, imageUrl: variant?.image_url ?? null };
    });
    setReceipt({ orderId: order.id, orderNumber: String(order.order_number), createdAt: order.created_at, customerName: order.customer_name, items: receiptItems, subtotal: Number(order.subtotal_egp), discountAmount: Number(order.discount_amount ?? 0), total: Number(order.total_egp), paymentMethod: order.payment_method === 'instapay' ? 'instapay' : 'cash', cashTendered: null, changeDue: 0, cashierName: userEmail || t('posReceiptCashier') });
    setReceiptPhone(''); setReceiptPhoneTouched(false); setReceiptsOpen(false);
  }

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
  const parsedTendered = cashTendered === '' ? 0 : Number(cashTendered);
  const effectiveTendered = Number.isFinite(parsedTendered) ? parsedTendered : 0;
  const parsedDiscount = discountInput.trim() === '' ? (discountMode === 'final' ? subtotal : 0) : Number(discountInput);
  const discountInputValid = Number.isFinite(parsedDiscount) && parsedDiscount >= 0 && (discountMode === 'amount' ? parsedDiscount <= subtotal : parsedDiscount <= subtotal);
  const discountAmount = discountInputValid ? (discountMode === 'amount' ? parsedDiscount : subtotal - parsedDiscount) : 0;
  const posTotal = subtotal - discountAmount;
  const changeDue = Math.max(0, effectiveTendered - posTotal);
  const amountShort = Math.max(0, posTotal - effectiveTendered);

  function parkCurrentCart() {
    if (items.length === 0) return;
    if (!userId) return;
    holdCart({ cashierId: userId, items: items.map((item) => ({ ...item })), customerName, customerPhone, paymentMethod, itemCount: items.reduce((count, item) => count + item.qty, 0), total: posTotal, discountMode, discountInput });
    clearCart();
    setCustomerName('');
    setCustomerPhone('');
    setPaymentMethod('cash');
    setCashTendered('');
    setDiscountInput('');
    toast.success(t('posHeldSaved'));
  }

  function resumeHeldCart(cart: HeldPosCart) {
    if (items.length > 0) {
      toast.error(t('posHeldCartRequiresEmpty'));
      return;
    }
    let changed = false;
    const availableItems = cart.items.flatMap((item) => {
      const variant = products.flatMap((product) => product.variants).find((entry) => entry.id === item.variantId && entry.is_active);
      if (!variant || variant.stock_qty < 1) { changed = true; return []; }
      if (item.qty > variant.stock_qty) changed = true;
      const product = products.find((entry) => entry.id === variant.product_id);
      return [{ ...item, productName: product?.name ?? item.productName, color: variant.color, size: variant.size, unitPrice: variant.unit_sell_price, maxStock: variant.stock_qty, qty: Math.min(item.qty, variant.stock_qty) }];
    });
    restoreItems(availableItems);
    setCustomerName(cart.customerName);
    setCustomerPhone(cart.customerPhone);
    setPaymentMethod(cart.paymentMethod);
    setDiscountMode(cart.discountMode ?? 'amount');
    setDiscountInput(cart.discountInput ?? '');
    removeHeldCart(cart.id);
    setHeldCartsOpen(false);
    if (changed) toast.warning(t('posHeldStockChanged'));
    else toast.success(t('posHeldRestored'));
    searchRef.current?.focus();
  }
  const addAlternative = (product: TaggedProduct, variant: AlternativeVariant) => {
    if (!canSell) { toast.error(t('shiftRequired')); return; }
    const image = variant.image_url ?? product.image_url ?? product.gallery_urls[0] ?? product.image_urls[0] ?? null;
    addItem({ variantId: variant.id, productName: product.name, sku: variant.sku, color: variant.color, size: variant.size, unitPrice: variant.unit_sell_price, maxStock: variant.stock_qty, qty: 1, imageUrl: image });
    setAlternativesRequest(null);
    searchRef.current?.focus();
  };

  async function completeSale() {
    if (items.length === 0 || !canSell || !discountInputValid || submitting || saleSubmittingRef.current || (paymentMethod === 'cash' && effectiveTendered < posTotal)) return;
    saleSubmittingRef.current = true;
    setSubmitting(true);
    const receiptItems = items.map((item) => ({ ...item }));
    try {
      const { data: orderId, error } = await supabase.rpc('create_order_atomic', {
        order_payload: {
          source: 'pos',
          status: 'delivered',
          shipping_fee: 0,
          cod_fee: 0,
          discount_amount: discountAmount,
          payment_method: paymentMethod,
          customer_name: customerName.trim() || t('posWalkInCustomer'),
          customer_phone: customerPhone.trim() || t('posPhoneNotProvided'),
        },
        items_array: items.map((item) => ({ variant_id: item.variantId, quantity: item.qty })),
      });

      if (error || !orderId) {
        toast.error(t('posSaleError'));
        await loadCatalog(false);
        return;
      }

      const { data: order } = await supabase.rpc('get_pos_receipt', { p_order_id: orderId });
      const { data: cashier } = userId ? await supabase.from('staff_accounts').select('display_name').eq('user_id', userId).maybeSingle() : { data: null };
      const orderNumber = typeof order?.order_number === 'number'
        ? new Intl.NumberFormat(lang).format(order.order_number)
        : order?.order_number ?? t('posOrderNumberUnavailable');
      setReceipt({ orderId, orderNumber: String(orderNumber), createdAt: order?.created_at ?? new Date().toISOString(), customerName: customerName.trim() || t('posWalkInCustomer'), items: receiptItems, subtotal, discountAmount, total: posTotal, paymentMethod, cashTendered: paymentMethod === 'cash' ? effectiveTendered : null, changeDue: paymentMethod === 'cash' ? changeDue : 0, cashierName: cashier?.display_name || userEmail || t('posReceiptCashier') });
      setReceiptPhone(normalizeEgyptianPhone(customerPhone) ?? '');
      setReceiptPhoneTouched(false);
      toast.success(t('posSaleReceiptOpened').replace('{order}', String(orderNumber)));
      clearCart();
      setCustomerName('');
      setCustomerPhone('');
      setPaymentMethod('cash');
      setCashTendered('');
      setDiscountInput('');
      setCheckoutOpen(false);
      await loadCatalog(false);
    } catch {
      toast.error(t('posSaleError'));
      await loadCatalog(false);
    } finally {
      saleSubmittingRef.current = false;
      setSubmitting(false);
    }
  }

  function startNewSale() {
    setReceipt(null);
    setDiscountInput('');
    setSearch('');
    setReceiptPhone('');
    searchRef.current?.focus();
  }

  function sendReceiptToWhatsApp() {
    const normalizedPhone = normalizeEgyptianPhone(receiptPhone);
    if (!receipt || !normalizedPhone) { toast.error(t('posReceiptPhoneInvalid')); setReceiptPhoneTouched(true); return; }
    const message = [t('posReceiptMessageIntro'), `${t('posReceiptOrder')}: ${receipt.orderNumber}`, `${t('posReceiptCustomer')}: ${receipt.customerName}`, `${t('posReceiptDate')}: ${new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(receipt.createdAt))}`, `${t('posReceiptItems')}:`, ...receipt.items.map((item) => `• ${item.productName} (${formatVariantLabel(item.color, item.size, t)}) × ${item.qty} — ${formatCurrency(item.unitPrice * item.qty)}`), `${t('posReceiptPayment')}: ${t(receipt.paymentMethod === 'cash' ? 'posReceiptCash' : 'posReceiptInstaPay')}`, ...(receipt.cashTendered !== null ? [`${t('posReceiptTendered')}: ${formatCurrency(receipt.cashTendered)}`, `${t('posReceiptChange')}: ${formatCurrency(receipt.changeDue)}`] : []), `${t('posReceiptTotal')}: ${formatCurrency(receipt.total)}`].join('\n');
    window.open(`https://wa.me/20${normalizedPhone.slice(1)}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing = target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '');
      if ((event.key === '/' && !editing) || event.key === 'F2') {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
  if (event.key === 'Escape') {
        if (alternativesRequest) setAlternativesRequest(null);
        else if (checkoutOpen) setCheckoutOpen(false);
        else if (heldCartsOpen) setHeldCartsOpen(false);
        else if (receipt) startNewSale();
        else if (search) setSearch('');
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && items.length > 0 && !receipt) {
        event.preventDefault();
        setCheckoutOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [alternativesRequest, checkoutOpen, heldCartsOpen, items.length, receipt, search]);

  return <div dir={dir} className="grid min-w-0 gap-5 tabular-nums xl:grid-cols-[minmax(0,1fr)_25rem]">
    <section className="min-w-0 space-y-5">
      <ShiftControls />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-black text-stone-900">{t('posCatalogTitle')}</h1><p className="mt-1 text-sm text-stone-500">{t('posCatalogSubtitle')}</p></div>
        <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => { setQuickReturnOrderId(null); setQuickReturnOpen(true); }} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-amber-700/30 bg-amber-50 px-3 text-sm font-bold text-amber-900"><RotateCcw className="size-4" />{t('posQuickReturn')}</button><button type="button" onClick={() => setReceiptsOpen(true)} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-stone-300 bg-white px-3 text-sm font-semibold text-stone-700"><History className="size-4" />{t('posRecentReceipts')}</button><span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700"><span className="size-2 rounded-full bg-emerald-500" />{t('posSaleInProgress')}</span></div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex min-w-0 flex-1 items-center gap-2"><label className="relative min-w-0 flex-1"><Search className={`absolute top-3.5 size-4 text-stone-400 ${dir === 'rtl' ? 'end-3' : 'start-3'}`} /><input ref={searchRef} autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('posSearchPlaceholder')} className={`h-12 w-full rounded-lg border border-stone-300 bg-white text-sm outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100 ${dir === 'rtl' ? 'pe-10 ps-4' : 'ps-10 pe-4'}`} /></label><span className="hidden items-center rounded-md border border-stone-200 bg-white px-2 py-1 text-[10px] text-stone-400 lg:inline-flex">{t('posFocusSearchHint')}</span></div>
        <div className="flex shrink-0 rounded-xl bg-stone-100 p-1">
          {([{ value: 'all', key: 'posAllCategories' }, { value: 'sneakers', key: 'posShoes' }, { value: 'bags', key: 'posBags' }] as const).map((option) => <button key={option.value} onClick={() => setCategory(option.value)} className={`min-h-11 rounded-lg px-3 text-sm font-semibold transition sm:px-4 ${category === option.value ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-800'}`}>{t(option.key)}</button>)}
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
                  const outOfStock = variant.stock_qty === 0 || !variant.is_active;
                  const lowStock = !outOfStock && variant.stock_qty <= 3;
                  const inCart = items.find((item) => item.variantId === variant.id)?.qty ?? 0;
                  return <button key={variant.id} type="button" onClick={() => {
                    if (!canSell) { toast.error(t('shiftRequired')); return; }
                    if (outOfStock) { setAlternativesRequest({ productId: product.id, variantId: variant.id }); return; }
                    addItem({ variantId: variant.id, productName: product.name, sku: variant.sku, color: variant.color, size: variant.size, unitPrice: variant.unit_sell_price, maxStock: variant.stock_qty, qty: 1, imageUrl: variant.image_url ?? image ?? null });
                    searchRef.current?.focus();
                  }} aria-disabled={outOfStock} className={`flex min-h-14 w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-start transition ${outOfStock ? 'cursor-pointer border-stone-200 bg-stone-50 text-stone-400 hover:border-rose-300' : 'border-stone-200 hover:border-rose-300 hover:bg-rose-50/50 active:scale-[0.99]'}`}>
                    <span className="min-w-0"><span className="block truncate text-sm font-semibold">{formatVariantLabel(variant.color, variant.size, t)}</span><span className="mt-0.5 block text-xs text-stone-500">{formatCurrency(variant.unit_sell_price)} · {t('posStockRemaining')}: {new Intl.NumberFormat(lang).format(variant.stock_qty)}</span></span>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${outOfStock ? 'bg-red-50 text-red-700' : lowStock ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>{outOfStock ? t('posStockSoldOut') : lowStock ? t('posStockLow') : t('posStockInStock')}</span>
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
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 px-5 py-4"><h2 className="flex items-center gap-2 font-bold text-stone-900"><ReceiptText className="size-5 text-rose-600" />{t('posCurrentSale')}</h2><div className="flex items-center gap-2"><button type="button" onClick={() => setHeldCartsOpen(true)} className="min-h-11 rounded-lg border border-stone-200 px-3 text-xs font-semibold text-stone-600 hover:bg-stone-50">{t('posHeldCarts').replace('{count}', new Intl.NumberFormat(lang).format(heldCarts.length))}</button><span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-bold text-stone-600">{new Intl.NumberFormat(lang).format(items.reduce((count, item) => count + item.qty, 0))}</span></div></div>

      {items.length === 0 ? <div className="grid min-h-44 place-items-center px-5 text-center"><div><PackageOpen className="mx-auto size-9 text-stone-300" /><p className="mt-3 font-semibold text-stone-600">{t('posCartEmpty')}</p><p className="mt-1 text-xs text-stone-400">{t('posCartEmptyHint')}</p></div></div> : <div className="max-h-[36vh] space-y-3 overflow-y-auto p-4">
        {items.map((item) => <article key={item.variantId} className="flex gap-3 rounded-xl border border-stone-100 p-3">
          {item.imageUrl ? <img src={item.imageUrl} alt={item.productName} className="size-14 shrink-0 rounded-lg bg-stone-100 object-cover" /> : <div className="grid size-14 shrink-0 place-items-center rounded-lg bg-stone-100 text-stone-400"><ShoppingBag className="size-5" /></div>}
          <div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="truncate text-sm font-bold text-stone-800">{item.productName}</h3><p className="mt-0.5 truncate text-xs text-stone-500">{formatVariantLabel(item.color, item.size, t)} · {item.sku}</p></div><button onClick={() => removeItem(item.variantId)} aria-label={t('posRemoveItem')} title={t('posRemoveItem')} className="grid size-11 shrink-0 place-items-center rounded-md text-stone-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="size-4" /></button></div>
            <div className="mt-2 flex items-center justify-between gap-2"><div className="inline-flex items-center gap-1 rounded-lg bg-stone-100 p-1"><button disabled={item.qty <= 1} onClick={() => updateQty(item.variantId, item.qty - 1)} aria-label={t('adjustmentDecrease')} className="grid size-11 place-items-center rounded-md text-stone-600 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"><Minus className="size-4" /></button><span aria-label={t('posQuantity')} className="min-w-7 text-center text-sm font-bold">{new Intl.NumberFormat(lang).format(item.qty)}</span><button disabled={item.qty >= item.maxStock} onClick={() => updateQty(item.variantId, item.qty + 1)} aria-label={t('adjustmentIncrease')} className="grid size-11 place-items-center rounded-md text-stone-600 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"><Plus className="size-4" /></button></div><span className="text-sm font-bold text-stone-800">{formatCurrency(item.unitPrice * item.qty)}</span></div>
          </div>
        </article>)}
      </div>}

      <div className="space-y-4 border-t border-stone-200 p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <label className="text-start text-xs font-semibold text-stone-600">{t('posCustomerName')} <span className="font-normal text-stone-400">({t('posOptional')})</span><input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder={t('posCustomerNamePlaceholder')} className="mt-1.5 h-10 w-full rounded-lg border border-stone-300 px-3 text-start text-sm outline-none focus:border-rose-500" /></label>
          <label className="text-start text-xs font-semibold text-stone-600">{t('posCustomerPhone')} <span className="font-normal text-stone-400">({t('posOptional')})</span><input type="tel" inputMode="tel" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder={t('posCustomerPhonePlaceholder')} className="mt-1.5 h-10 w-full rounded-lg border border-stone-300 px-3 text-start text-sm outline-none focus:border-rose-500" /></label>
        </div>

        <div className="space-y-3 border-t border-dashed border-stone-200 pt-3"><div className="flex gap-2"><button type="button" aria-pressed={discountMode === 'amount'} onClick={() => setDiscountMode('amount')} className={`min-h-10 flex-1 rounded-md border px-2 text-xs font-semibold ${discountMode === 'amount' ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 text-stone-600'}`}>{t('posDiscountAmount')}</button><button type="button" aria-pressed={discountMode === 'final'} onClick={() => setDiscountMode('final')} className={`min-h-10 flex-1 rounded-md border px-2 text-xs font-semibold ${discountMode === 'final' ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 text-stone-600'}`}>{t('posFinalPrice')}</button></div><label className="block text-xs font-semibold text-stone-600">{t('posDiscount')}<input type="number" min="0" max={subtotal} step="0.01" value={discountInput} onChange={(event) => setDiscountInput(event.target.value)} placeholder="0" className="mt-1 h-11 w-full rounded-lg border border-stone-300 px-3 text-start tabular-nums" /></label>{!discountInputValid && <p role="alert" className="text-xs font-semibold text-red-700">{t('posDiscountInvalid')}</p>}<div className="flex justify-between text-sm text-stone-500"><span>{t('posSubtotal')}</span><span>{formatCurrency(subtotal)}</span></div>{discountAmount > 0 && <div className="flex justify-between text-sm text-rose-700"><span>{t('posReceiptDiscount')}</span><span>− {formatCurrency(discountAmount)}</span></div>}<div className="flex items-center justify-between text-base font-black text-stone-900"><span>{t('posTotal')}</span><span>{formatCurrency(posTotal)}</span></div></div>
        <button type="button" disabled={!canSell || items.length === 0 || !discountInputValid || submitting} onClick={() => { setCashTendered(''); setCheckoutOpen(true); }} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-stone-900 px-4 py-3 text-sm font-bold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300">{t('posCompleteSale')}</button>
        <div className="flex items-center justify-between gap-2"><button type="button" disabled={items.length === 0 || submitting} onClick={parkCurrentCart} className="min-h-11 flex-1 rounded-lg border border-stone-200 px-3 text-xs font-semibold text-stone-600 transition hover:bg-stone-50 disabled:opacity-40">{t('posHoldCart')}</button><span className="hidden items-center rounded-md border border-stone-200 bg-white px-2 py-1 text-[10px] text-stone-400 lg:inline-flex">{t('posCheckoutHint')}</span></div>
      </div>
    </aside>
    {alternativesTarget && <AlternativesModal targetProduct={alternativesTarget} requestedVariant={requestedVariant} allActiveProducts={products} mode="pos" onClose={() => setAlternativesRequest(null)} onAdd={addAlternative} />}
    {heldCartsOpen && <div dir={dir} role="presentation" className="fixed inset-0 z-[70] grid place-items-center bg-stone-950/50 p-3 sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) setHeldCartsOpen(false); }}><section role="dialog" aria-modal="true" aria-labelledby="held-carts-title" className="dialog-panel max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-stone-200 bg-white shadow-2xl"><header className="sticky top-0 flex items-center justify-between border-b border-stone-200 bg-white px-5 py-4"><h2 id="held-carts-title" className="text-lg font-black">{t('posHeldCarts').replace('{count}', new Intl.NumberFormat(lang).format(heldCarts.length))}</h2><button type="button" onClick={() => setHeldCartsOpen(false)} aria-label={t('closeMenu')} className="grid size-11 place-items-center rounded-md text-stone-500 hover:bg-stone-100"><X className="size-5" /></button></header>{heldCarts.length === 0 ? <p className="p-10 text-center text-sm text-stone-500">{t('posHeldEmpty')}</p> : <div className="space-y-3 p-4 sm:p-5">{heldCarts.map((cart) => <article key={cart.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-stone-200 p-4"><div className="min-w-0"><p className="font-bold text-stone-900">{cart.customerName || t('posWalkInCustomer')}</p><p className="mt-1 flex items-center gap-1.5 text-xs text-stone-500"><CalendarClock className="size-3.5" />{t('posHeldAt')}: {new Intl.DateTimeFormat(lang, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(cart.createdAt))}</p><p className="mt-1 text-xs text-stone-500">{t('posHeldItems')}: {new Intl.NumberFormat(lang).format(cart.itemCount)} · {t('posHeldTotal')}: {formatCurrency(cart.total)}</p></div><div className="flex items-center gap-2"><button type="button" disabled={items.length > 0} title={items.length > 0 ? t('posHeldCartRequiresEmpty') : undefined} onClick={() => resumeHeldCart(cart)} className="min-h-11 rounded-lg bg-stone-900 px-3 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">{t('posHeldResume')}</button><button type="button" onClick={() => removeHeldCart(cart.id)} className="min-h-11 rounded-lg border border-stone-200 px-3 text-xs font-semibold text-red-700 hover:bg-red-50">{t('posHeldDiscard')}</button></div></article>)}</div>}</section></div>}
    {checkoutOpen && <div dir={dir} role="presentation" className="fixed inset-0 z-[75] grid place-items-center bg-stone-950/55 p-3 sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) setCheckoutOpen(false); }}><section role="dialog" aria-modal="true" aria-labelledby="pos-confirm-title" className="dialog-panel max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-lg border border-stone-200 bg-white p-5 shadow-2xl sm:p-7"><header className="mb-5 flex items-center justify-between gap-3"><h2 id="pos-confirm-title" className="text-xl font-black text-stone-900">{t('posConfirmTitle')}</h2><button type="button" disabled={submitting} onClick={() => setCheckoutOpen(false)} aria-label={t('closeMenu')} className="grid size-11 place-items-center rounded-md text-stone-500 hover:bg-stone-100"><X className="size-5" /></button></header><div className="mb-5 space-y-2 border-b border-stone-100 pb-4"><div className="flex justify-between text-sm text-stone-500"><span>{t('posSubtotal')}</span><span>{formatCurrency(subtotal)}</span></div>{discountAmount > 0 && <div className="flex justify-between text-sm text-rose-700"><span>{t('posReceiptDiscount')}</span><span>− {formatCurrency(discountAmount)}</span></div>}<div className="flex items-center justify-between text-lg"><span className="font-semibold text-stone-600">{t('posTotal')}</span><span className="text-2xl font-black text-stone-900">{formatCurrency(posTotal)}</span></div>{!discountInputValid && <p role="alert" className="text-xs font-semibold text-red-700">{t('posDiscountInvalid')}</p>}</div><fieldset><legend className="mb-3 text-sm font-bold text-stone-700">{t('posPaymentMethod')}</legend><div className="grid grid-cols-3 gap-2"><button type="button" aria-pressed={paymentMethod === 'cash'} onClick={() => { setPaymentMethod('cash'); setCashTendered(''); }} className={`flex min-h-12 items-center justify-center gap-2 rounded-lg border px-2 text-sm font-bold ${paymentMethod === 'cash' ? 'border-rose-400 bg-rose-50 text-rose-800' : 'border-stone-200 text-stone-600 hover:bg-stone-50'}`}><Banknote className="size-4" />{t('posCash')}</button><button type="button" aria-pressed={paymentMethod === 'instapay'} onClick={() => setPaymentMethod('instapay')} className={`flex min-h-12 items-center justify-center gap-2 rounded-lg border px-2 text-sm font-bold ${paymentMethod === 'instapay' ? 'border-rose-400 bg-rose-50 text-rose-800' : 'border-stone-200 text-stone-600 hover:bg-stone-50'}`}>{t('posInstaPay')}</button><button type="button" disabled title={t('posCardUnavailable')} className="flex min-h-12 cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-stone-200 px-2 text-sm font-bold text-stone-400 opacity-60"><CreditCard className="size-4" />{t('posCard')}</button></div><p className="mt-2 text-xs text-stone-500">{t('posCardUnavailable')}</p></fieldset>{paymentMethod === 'cash' && <section className="mt-5 rounded-lg border border-stone-200 bg-stone-50 p-4"><label className="block text-sm font-semibold text-stone-700">{t('posCashTendered')}<input type="number" inputMode="decimal" min="0" step="0.01" value={cashTendered} onChange={(event) => setCashTendered(event.target.value)} className="mt-2 h-12 w-full rounded-lg border border-stone-300 bg-white px-3 text-start text-lg font-bold outline-none focus:border-rose-500" /></label><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => setCashTendered(posTotal.toFixed(2))} className="min-h-11 rounded-md border border-stone-300 bg-white px-3 text-xs font-bold">{t('posExactAmount')}</button>{[200, 500, 1000, 2000].map((amount) => <button key={amount} type="button" onClick={() => setCashTendered(String(amount))} className="min-h-11 rounded-md border border-stone-300 bg-white px-3 text-xs font-semibold">{formatCurrency(amount)}</button>)}</div><div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-stone-200 pt-3"><span className="font-semibold text-stone-700">{t('posChangeDue')}</span><span className="text-2xl font-black text-emerald-700">{formatCurrency(changeDue)}</span></div>{cashTendered !== '' && effectiveTendered < posTotal && <p role="alert" className="mt-2 text-sm font-semibold text-red-700">{t('posAmountShort')}: {formatCurrency(amountShort)}</p>}</section>}<div className="mt-6 grid gap-2 sm:grid-cols-2"><button type="button" disabled={submitting || items.length === 0 || !discountInputValid || (paymentMethod === 'cash' && effectiveTendered < posTotal)} onClick={() => void completeSale()} className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-stone-900 px-4 py-3 text-sm font-bold text-white hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-50">{submitting && <LoaderCircle className="size-4 animate-spin" />}{submitting ? t('posCompletingSale') : t('posConfirmSale')}</button><button type="button" disabled={submitting} onClick={() => setCheckoutOpen(false)} className="min-h-12 rounded-lg border border-stone-200 px-4 py-3 text-sm font-semibold text-stone-600 hover:bg-stone-50">{t('posBackToSale')}</button></div></section></div>}
    {quickReturnOpen && <QuickReturnModal products={products} shiftId={shiftId} initialOrderId={quickReturnOrderId} onClose={() => setQuickReturnOpen(false)} onComplete={() => { void loadCatalog(false); if (receiptsOpen) void loadRecentReceipts(); }} />}
    {receiptsOpen && <div dir={dir} role="presentation" className="fixed inset-0 z-[85] flex justify-end bg-stone-950/50" onMouseDown={(event) => { if (event.target === event.currentTarget) setReceiptsOpen(false); }}><section role="dialog" aria-modal="true" aria-labelledby="recent-receipts-title" className="h-full w-full max-w-xl overflow-y-auto bg-white p-4 shadow-2xl sm:p-6"><header className="sticky top-0 z-10 flex items-center justify-between border-b border-stone-200 bg-white py-3"><h2 id="recent-receipts-title" className="text-lg font-black">{t('posRecentReceipts')}</h2><button type="button" onClick={() => setReceiptsOpen(false)} aria-label={t('closeMenu')} className="grid size-11 place-items-center rounded-md hover:bg-stone-100"><X /></button></header>{!shiftId ? <p className="p-8 text-center text-sm text-stone-500">{t('shiftRequired')}</p> : recentReceipts.length === 0 ? <p className="p-8 text-center text-sm text-stone-500">{t('posNoRecentReceipts')}</p> : <div className="divide-y divide-stone-100">{recentReceipts.map((order) => <article key={order.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="font-bold">#{order.order_number} · {order.customer_name}</p><p className="mt-1 text-xs text-stone-500">{new Intl.DateTimeFormat(lang, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(order.created_at))} · {formatCurrency(Number(order.total_egp))}</p></div><div className="flex gap-2"><button type="button" onClick={() => void reprintReceipt(order)} className="inline-flex min-h-10 items-center gap-1 rounded-md border border-stone-300 px-3 text-xs font-bold"><Printer className="size-4" />{t('posReprintReceipt')}</button><button type="button" onClick={() => { setQuickReturnOrderId(order.id); setReceiptsOpen(false); setQuickReturnOpen(true); }} className="inline-flex min-h-10 items-center gap-1 rounded-md border border-amber-700/30 bg-amber-50 px-3 text-xs font-bold text-amber-900"><RotateCcw className="size-4" />{t('posReceiptReturn')}</button></div></article>)}</div>}</section></div>}    {receipt && <div dir={dir} role="presentation" className="fixed inset-0 z-[80] grid place-items-center bg-stone-950/55 p-3 sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) startNewSale(); }}><section id="pos-receipt-print" role="dialog" aria-modal="true" aria-labelledby="pos-receipt-title" className="dialog-panel max-h-[94vh] w-full max-w-md overflow-y-auto rounded-lg border border-stone-200 bg-white p-5 shadow-2xl"><header className="mb-4 flex items-start justify-between gap-3 border-b border-dashed border-stone-300 pb-4"><div className="text-start"><img src="/logo-mark-transparent.png" alt="" className="mb-1 size-9 object-contain [filter:grayscale(1)_brightness(0.45)]" /><p className="text-lg font-black tracking-wide text-stone-900">Different Store<span className="text-rose-700">.</span></p><h2 id="pos-receipt-title" className="mt-1 text-sm font-bold text-stone-700">{t('posReceiptTitle')}</h2></div><button type="button" onClick={startNewSale} aria-label={t('closeMenu')} className="receipt-actions grid size-11 place-items-center rounded-md text-stone-500 hover:bg-stone-100"><X className="size-5" /></button></header><div className="space-y-2 border-b border-dashed border-stone-300 pb-4 text-xs"><div className="flex justify-between gap-3"><span className="text-stone-500">{t('posReceiptOrder')}</span><b dir="ltr">{receipt.orderNumber}</b></div><div className="flex justify-between gap-3"><span className="text-stone-500">{t('posReceiptDate')}</span><span>{new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(receipt.createdAt))}</span></div><div className="flex justify-between gap-3"><span className="text-stone-500">{t('posReceiptCustomer')}</span><span>{receipt.customerName}</span></div><div className="flex justify-between gap-3"><span className="text-stone-500">{t('posReceiptCashier')}</span><span>{receipt.cashierName}</span></div></div><div className="space-y-3 border-b border-dashed border-stone-300 py-4">{receipt.items.map((item, index) => <div key={`${item.variantId}-${index}`} className="flex justify-between gap-3 text-xs"><div className="min-w-0"><p className="font-bold text-stone-800">{item.productName}</p><p className="mt-0.5 text-stone-500">{formatVariantLabel(item.color, item.size, t)} · {item.sku} · {t('posQuantity')}: {new Intl.NumberFormat(lang).format(item.qty)}</p></div><b className="shrink-0">{formatCurrency(item.unitPrice * item.qty)}</b></div>)}</div><div className="space-y-2 py-4 text-sm"><div className="flex justify-between"><span>{t('posReceiptPayment')}</span><b>{t(receipt.paymentMethod === 'cash' ? 'posReceiptCash' : 'posReceiptInstaPay')}</b></div>{receipt.cashTendered !== null && <><div className="flex justify-between"><span>{t('posReceiptTendered')}</span><span>{formatCurrency(receipt.cashTendered)}</span></div><div className="flex justify-between"><span>{t('posReceiptChange')}</span><span>{formatCurrency(receipt.changeDue)}</span></div></>}<div className="flex justify-between"><span>{t('posSubtotal')}</span><span>{formatCurrency(receipt.subtotal)}</span></div><div className="flex justify-between"><span>{t('posReceiptDiscount')}</span><span>− {formatCurrency(receipt.discountAmount)}</span></div><div className="flex justify-between border-t border-stone-300 pt-3 text-base font-black"><span>{t('posReceiptTotal')}</span><span>{formatCurrency(receipt.total)}</span></div></div><p className="border-t border-dashed border-stone-300 py-3 text-center text-xs text-stone-600">{t('posReceiptThanks')}</p><div className="receipt-actions mt-2 space-y-3 border-t border-stone-100 pt-4"><label className="block text-start text-xs font-semibold text-stone-600">{t('posReceiptWhatsAppPhone')}<input type="tel" inputMode="tel" dir="ltr" value={receiptPhone} onChange={(event) => setReceiptPhone(event.target.value)} onBlur={() => setReceiptPhoneTouched(true)} placeholder={t('posCustomerPhonePlaceholder')} className="mt-1.5 h-11 w-full rounded-lg border border-stone-300 px-3 text-start text-sm" />{receiptPhoneTouched && receiptPhone.trim() !== '' && !normalizeEgyptianPhone(receiptPhone) && <span className="mt-1 block text-xs text-red-700">{t('posReceiptPhoneInvalid')}</span>}</label><button type="button" onClick={sendReceiptToWhatsApp} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-emerald-700/30 bg-emerald-50 px-3 text-sm font-bold text-emerald-800 hover:bg-emerald-100"><MessageCircle className="size-4" />{t('posReceiptWhatsApp')}</button><div className="grid gap-2 sm:grid-cols-2"><button type="button" onClick={() => window.print()} className="flex min-h-12 items-center justify-center gap-2 rounded-lg border border-stone-200 px-3 text-sm font-semibold text-stone-700 hover:bg-stone-50"><Printer className="size-4" />{t('posPrintReceipt')}</button><button type="button" onClick={startNewSale} className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-stone-900 px-3 text-sm font-bold text-white hover:bg-stone-800"><CheckCircle2 className="size-4" />{t('posReceiptNewSale')}</button></div></div></section></div>}
  </div>;
}
