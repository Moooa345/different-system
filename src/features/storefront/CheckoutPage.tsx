import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ChevronRight, Copy, LoaderCircle, MessageCircle, ShieldCheck, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import type { Json, PaymentMethod, ProductVariant, ShippingZone } from '../../lib/types';
import { supabase } from '../../lib/supabase';
import { useTranslation } from '../../i18n/useTranslation';
import { useStoreCart } from '../../store/useStoreCart';
import { StorefrontHeader } from './StorefrontHeader';
import { formatVariantLabel } from '../../utils/formatVariantLabel';
import { STORE_WHATSAPP_NUMBER } from '../../config/constants';

interface ReceiptSummary {
  orderId: string;
  orderNumber: string;
  customerName: string;
  zoneName: string;
  items: Array<{ productName: string; color: string | null; size: string | null; qty: number }>;
  subtotal: number;
  shipping: number;
  codFee: number;
  total: number;
}

const normalizeEgyptianPhone = (phone: string) => {
  const compact = phone.replace(/[\s()\-]/g, '');
  const local = compact.startsWith('+20') ? `0${compact.slice(3)}` : compact.startsWith('0020') ? `0${compact.slice(4)}` : compact;
  return /^01[0125]\d{8}$/.test(local) ? local : null;
};

export function CheckoutPage() {
  const { t, dir, lang, formatCurrency } = useTranslation();
  const items = useStoreCart((state) => state.items);
  const syncStock = useStoreCart((state) => state.syncStock);
  const clearCart = useStoreCart((state) => state.clearCart);
  const subtotal = useStoreCart((state) => state.subtotal());
  const [zones, setZones] = useState<ShippingZone[]>([]);
  const [zoneId, setZoneId] = useState('');
  const [zonesLoading, setZonesLoading] = useState(true);
  const [zoneError, setZoneError] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cod');
  const [submitting, setSubmitting] = useState(false);
  const submitLock = useRef(false);
  const [confirmation, setConfirmation] = useState<ReceiptSummary | null>(null);
  const zonesErrorText = t('storeZonesError');
  const cartKey = items.map((item) => item.variantId).sort().join(',');

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data, error } = await supabase.from('shipping_zones').select('*').eq('is_active', true).order('name');
      if (!active) return;
      setZonesLoading(false);
      if (error) {
        setZoneError(true);
        toast.error(zonesErrorText);
        return;
      }
      const activeZones = data ?? [];
      setZones(activeZones);
      setZoneId((current) => current || activeZones[0]?.id || '');
    })();
    return () => { active = false; };
  }, [zonesErrorText]);

  useEffect(() => {
    if (!cartKey) return;
    const ids = cartKey.split(',');
    let active = true;
    void (async () => {
      const { data: variants } = await supabase.from('product_variants').select('id, product_id, stock_qty, is_active').in('id', ids);
      if (!active || !variants) return;
      const productIds = [...new Set(variants.map((variant) => variant.product_id))];
      const { data: products } = await supabase.from('products').select('id').eq('is_active', true).in('id', productIds);
      if (!active || !products) return;
      const activeProducts = new Set(products.map((product) => product.id));
      const currentStock: Record<string, number> = {};
      for (const variant of variants as Pick<ProductVariant, 'id' | 'product_id' | 'stock_qty' | 'is_active'>[]) {
        if (variant.is_active && activeProducts.has(variant.product_id)) currentStock[variant.id] = variant.stock_qty;
      }
      syncStock(currentStock);
    })();
    return () => { active = false; };
  }, [cartKey, syncStock]);

  const selectedZone = zones.find((zone) => zone.id === zoneId);
  const shipping = selectedZone?.fee_egp ?? 0;
  const codFee = selectedZone?.cod_fee_egp ?? 0;
  const total = subtotal + shipping + (paymentMethod === 'cod' ? codFee : 0);
  const localizedZoneName = (name: string) => {
    const keys = { 'القاهرة': 'zoneCairo', 'الجيزة': 'zoneGiza', 'الإسكندرية': 'zoneAlexandria', 'الدلتا والقناة': 'zoneDelta', 'صعيد مصر': 'zoneUpperEgypt' } as const;
    const key = keys[name as keyof typeof keys];
    return key ? t(key) : name;
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitAttempted(true);
    if (items.length === 0) return;
    if (!customerName.trim() || !phone.trim() || !address.trim()) {
      toast.error(t('storeCheckoutRequired'));
      return;
    }
    const normalizedPhone = normalizeEgyptianPhone(phone.trim());
    if (!normalizedPhone) {
      toast.error(t('storePhoneInvalid'));
      return;
    }
    if (!selectedZone) {
      toast.error(t('storeZoneRequired'));
      return;
    }

    if (submitLock.current) return;
    submitLock.current = true;
    setSubmitting(true);
    try {
      const { data: orderId, error } = await supabase.rpc('create_order_atomic', {
        order_payload: {
          source: 'online',
          status: 'pending',
          customer_name: customerName.trim(),
          customer_phone: normalizedPhone,
          shipping_address: address.trim(),
          shipping_zone_id: selectedZone.id,
          payment_method: paymentMethod,
          notes: notes.trim() || null,
        },
        items_array: items.map((item) => ({ variant_id: item.variantId, quantity: item.qty })),
      });
      if (error || !orderId) {
        toast.error(t('storeCheckoutError'));
        setSubmitting(false);
        return;
      }

      const localSummary: ReceiptSummary = {
        orderId,
        orderNumber: orderId,
        customerName: customerName.trim(),
        zoneName: localizedZoneName(selectedZone.name),
        items: items.map(({ productName, color, size, qty }) => ({ productName, color, size, qty })),
        subtotal, shipping, codFee: paymentMethod === 'cod' ? codFee : 0, total,
      };
      let finalSummary = localSummary;
      const { data: receiptData } = await supabase.rpc('get_public_order_number', { p_order_id: orderId });
      if (receiptData && typeof receiptData === 'object' && !Array.isArray(receiptData)) {
        const receipt = receiptData as { order_number?: Json; subtotal_egp?: Json; shipping_fee_egp?: Json; cod_fee_egp?: Json; total_egp?: Json };
        const number = receipt.order_number;
        finalSummary = {
          ...localSummary,
          orderNumber: number === undefined || number === null ? localSummary.orderNumber : new Intl.NumberFormat(lang).format(Number(number)),
          subtotal: Number(receipt.subtotal_egp ?? localSummary.subtotal),
          shipping: Number(receipt.shipping_fee_egp ?? localSummary.shipping),
          codFee: Number(receipt.cod_fee_egp ?? localSummary.codFee),
          total: Number(receipt.total_egp ?? localSummary.total),
        };
      }
      clearCart();
      setConfirmation(finalSummary);
      toast.success(t('storeOrderSuccess'));
    } catch {
      toast.error(t('storeCheckoutError'));
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }

  const cartCount = items.reduce((sum, item) => sum + item.qty, 0);
  const emptyCategory: 'all' = 'all';
  const phoneError = (phoneTouched || submitAttempted) && !normalizeEgyptianPhone(phone.trim());
  const whatsappMessage = confirmation ? [
    t('storeWhatsAppIntro'),
    `${t('storeWhatsAppOrder')}: ${confirmation.orderNumber}`,
    `${t('storeWhatsAppCustomer')}: ${confirmation.customerName}`,
    `${t('storeWhatsAppItems')}:`,
    ...confirmation.items.map((item) => `• ${item.productName} (${formatVariantLabel(item.color, item.size, t)}) × ${item.qty}`),
    `${t('storeWhatsAppZone')}: ${confirmation.zoneName}`,
    `${t('storeWhatsAppTotal')}: ${formatCurrency(confirmation.total)}`,
  ].join('\n') : '';
  const whatsappUrl = `https://wa.me/${STORE_WHATSAPP_NUMBER}?text=${encodeURIComponent(whatsappMessage)}`;

  async function copyOrderReference() {
    if (!confirmation) return;
    try {
      await navigator.clipboard.writeText(confirmation.orderNumber);
      toast.success(t('storeCopiedOrder'));
    } catch {
      toast.error(t('storeCopyFailed'));
    }
  }

  if (confirmation) {
    return <div dir={dir} className="min-h-screen bg-stone-50">
      <StorefrontHeader cartCount={0} category={emptyCategory} onCategoryChange={() => undefined} onOpenCart={() => undefined} showNavigation={false} showCart={false} />
      <main className="mx-auto grid min-h-[75vh] max-w-xl place-items-center px-4 py-10">
        <section className="w-full rounded-3xl border border-stone-200 bg-white p-7 text-center shadow-sm sm:p-10">
          <div className="mx-auto grid size-16 place-items-center rounded-full bg-emerald-50 text-emerald-600"><CheckCircle2 className="size-9" /></div>
          <h1 className="mt-5 text-2xl font-black text-stone-900">{t('storeConfirmation')}</h1>
          <p className="mt-2 text-sm text-stone-500">{t('storeConfirmationMessage')}</p>
          <div className="my-6 rounded-lg border border-stone-200 bg-stone-50 p-4 text-start">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 pb-3 text-sm"><div><span className="block text-xs text-stone-500">{t('storeOrderNumber')}</span><span className="font-bold text-stone-900" dir="ltr">{confirmation.orderNumber}</span></div><button type="button" onClick={() => void copyOrderReference()} aria-label={t('storeCopyOrder')} className="inline-flex items-center gap-1.5 rounded-md border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100"><Copy className="size-3.5" />{t('storeCopyOrder')}</button></div>
            <div className="mt-3 space-y-2 border-b border-stone-200 pb-3 text-sm">{confirmation.items.map((item, index) => <div key={`${item.productName}-${index}`} className="flex justify-between gap-3"><span className="min-w-0 text-stone-700">{item.productName} <span className="text-xs text-stone-500">({formatVariantLabel(item.color, item.size, t)} × {new Intl.NumberFormat(lang).format(item.qty)})</span></span></div>)}<div className="flex justify-between gap-3 pt-1 text-xs"><span className="text-stone-500">{t('storeShippingZone')}</span><span className="font-medium">{confirmation.zoneName}</span></div></div>
            <div className="mt-3 space-y-2 text-sm"><div className="flex justify-between"><span className="text-stone-500">{t('storeSubtotal')}</span><span>{formatCurrency(confirmation.subtotal)}</span></div><div className="flex justify-between"><span className="text-stone-500">{t('storeShipping')}</span><span>{formatCurrency(confirmation.shipping)}</span></div>{confirmation.codFee > 0 && <div className="flex justify-between"><span className="text-stone-500">{t('storeCodFee')}</span><span>{formatCurrency(confirmation.codFee)}</span></div>}<div className="flex justify-between border-t border-stone-200 pt-3 font-black"><span>{t('storeGrandTotal')}</span><span>{formatCurrency(confirmation.total)}</span></div></div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2"><a href={whatsappUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-emerald-700/30 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 hover:bg-emerald-100"><MessageCircle className="size-4" />{t('storeConfirmWhatsApp')}</a><Link to="/" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-stone-900 px-4 py-3 text-sm font-bold text-white hover:bg-stone-800">{t('storeBackToShop')}<ChevronRight className={`size-4 ${dir === 'rtl' ? 'rotate-180' : ''}`} /></Link></div>
        </section>
      </main>
    </div>;
  }

  return <div dir={dir} className="min-h-screen bg-stone-50">
    <StorefrontHeader cartCount={cartCount} category={emptyCategory} onCategoryChange={() => undefined} onOpenCart={() => undefined} showNavigation={false} showCart={false} />
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-6"><Link to="/" className="text-sm font-semibold text-stone-500 hover:text-stone-800">{t('storeBackToShop')}</Link><h1 className="mt-3 text-2xl font-black text-stone-900">{t('storeCheckout')}</h1><p className="mt-1 text-sm text-stone-500">{t('storeCheckoutSubtitle')}</p></div>
      {items.length === 0 ? <section className="rounded-2xl border border-stone-200 bg-white p-8 text-center"><ShoppingBag className="mx-auto size-9 text-stone-300" /><p className="mt-3 font-bold text-stone-700">{t('storeEmptyCart')}</p><Link to="/" className="mt-4 inline-flex rounded-xl bg-stone-900 px-5 py-3 text-sm font-bold text-white">{t('storeBackToShop')}</Link></section> :
        <form noValidate onSubmit={(event) => void handleSubmit(event)} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <section className="space-y-5 rounded-2xl border border-stone-200 bg-white p-5 sm:p-7">
            <div className="space-y-4">
              <h2 className="border-b border-stone-100 pb-3 text-base font-black text-stone-900">{t('checkoutStepContact')}</h2>
              <label className="block text-start text-sm font-semibold text-stone-700">{t('storeCustomerName')} <span className="text-rose-600" title={t('required')}>*</span><input required aria-required="true" autoComplete="name" value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder={t('storeNamePlaceholder')} className="mt-2 h-12 w-full rounded-lg border border-stone-300 px-4 text-start outline-none focus:border-rose-500" /></label>
              <label className="block text-start text-sm font-semibold text-stone-700">{t('storePhone')} <span className="text-rose-600" title={t('required')}>*</span><input required aria-required="true" aria-invalid={phoneError} aria-describedby={phoneError ? 'checkout-phone-error' : undefined} type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} onBlur={() => setPhoneTouched(true)} placeholder={t('storePhonePlaceholder')} dir="ltr" className={`mt-2 h-12 w-full rounded-lg border px-4 text-start outline-none focus:border-rose-500 ${phoneError ? 'border-red-600' : 'border-stone-300'}`} />{phoneError && <span id="checkout-phone-error" className="mt-1.5 block text-xs font-medium text-red-700">{t('phoneInlineInvalid')}</span>}</label>
              <label className="block text-start text-sm font-semibold text-stone-700">{t('storeAddress')} <span className="text-rose-600" title={t('required')}>*</span><textarea required aria-required="true" autoComplete="street-address" rows={3} value={address} onChange={(event) => setAddress(event.target.value)} placeholder={t('storeAddressPlaceholder')} className="mt-2 w-full rounded-lg border border-stone-300 px-4 py-3 text-start outline-none focus:border-rose-500" /></label>
              <label className="block text-start text-sm font-semibold text-stone-700">{t('storeNotes')} <span className="font-normal text-stone-400">({t('storeNotesOptional')})</span><textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={t('storeNotesPlaceholder')} className="mt-2 w-full rounded-lg border border-stone-300 px-4 py-3 text-start outline-none focus:border-rose-500" /></label>
            </div>
            <div className="border-t border-stone-100 pt-5">
              <h2 className="mb-3 text-base font-black text-stone-900">{t('checkoutStepZone')}</h2>
              <label className="block text-start text-sm font-semibold text-stone-700">{t('storeShippingZone')} <span className="text-rose-600" title={t('required')}>*</span><select required aria-required="true" disabled={zonesLoading || zones.length === 0} value={zoneId} onChange={(event) => setZoneId(event.target.value)} className="mt-2 h-12 w-full rounded-lg border border-stone-300 bg-white px-4 text-start outline-none focus:border-rose-500"><option value="">{zonesLoading ? t('storeZonesLoading') : t('storeSelectZone')}</option>{zones.map((zone) => <option key={zone.id} value={zone.id}>{localizedZoneName(zone.name)} · {formatCurrency(zone.fee_egp)}</option>)}</select></label>
              {zoneError && <p className="mt-2 text-xs text-red-600">{t('storeZonesError')}</p>}
            </div>
            <fieldset className="border-t border-stone-100 pt-5"><legend className="mb-3 text-base font-black text-stone-900">{t('checkoutStepPayment')}</legend><div className="grid gap-3 sm:grid-cols-2">{([{ value: 'cod', key: 'storeCod' }, { value: 'instapay', key: 'storeInstaPay' }] as const).map((option) => <button key={option.value} type="button" aria-pressed={paymentMethod === option.value} onClick={() => setPaymentMethod(option.value)} className={`min-h-12 rounded-lg border px-4 text-sm font-bold transition ${paymentMethod === option.value ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-stone-200 text-stone-600 hover:bg-stone-50'}`}>{t(option.key)}{option.value === 'cod' && codFee > 0 ? ` · ${formatCurrency(codFee)}` : ''}</button>)}</div>{paymentMethod === 'cod' && <p className="mt-2 text-xs leading-5 text-stone-500">{t('storeCodReassurance')}</p>}</fieldset>
          </section>

          <aside className="h-fit rounded-2xl border border-stone-200 bg-white p-5 shadow-sm lg:sticky lg:top-20">
            <h2 className="font-bold text-stone-900">{t('storeOrderSummary')}</h2>
            <div className="my-4 max-h-48 space-y-3 overflow-y-auto border-b border-stone-100 pb-4">{items.map((item) => <div key={item.variantId} className="flex items-start justify-between gap-3 text-sm"><div className="min-w-0"><p className="truncate font-semibold text-stone-700">{item.productName}</p><p className="mt-0.5 text-xs text-stone-400">{formatVariantLabel(item.color, item.size, t)} · {t('storeQuantity')}: {new Intl.NumberFormat(lang).format(item.qty)}</p></div><span className="shrink-0 font-semibold">{formatCurrency(item.unitPrice * item.qty)}</span></div>)}</div>
            <div className="space-y-3 text-sm"><div className="flex justify-between gap-3"><span className="text-stone-500">{t('storeSubtotal')}</span><span>{formatCurrency(subtotal)}</span></div><div className="flex justify-between gap-3"><span className="text-stone-500">{t('storeShipping')}</span><span>{formatCurrency(shipping)}</span></div>{paymentMethod === 'cod' && codFee > 0 && <div className="flex justify-between gap-3"><span className="text-stone-500">{t('storeCodFee')}</span><span>{formatCurrency(codFee)}</span></div>}<div className="flex justify-between gap-3 border-t border-stone-200 pt-3 text-base font-black"><span>{t('storeGrandTotal')}</span><span>{formatCurrency(total)}</span></div></div>
            <button type="submit" disabled={submitting || zonesLoading || zoneError || !selectedZone} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 py-3 text-sm font-bold text-white hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300">{submitting && <LoaderCircle className="size-4 animate-spin" />}{submitting ? t('storeSubmitting') : t('storePlaceOrder')}</button>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-stone-500"><ShieldCheck className="size-4 shrink-0" />{t('storeTrustAfterArrival')}</p>
          </aside>
        </form>}
    </main>
  </div>;
}
