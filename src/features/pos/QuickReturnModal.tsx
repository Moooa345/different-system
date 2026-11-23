import { useCallback, useEffect, useMemo, useState } from 'react';
import { Barcode, LoaderCircle, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Product, ProductVariant } from '../../lib/types';
import { supabase } from '../../lib/supabase';
import { useTranslation } from '../../i18n/useTranslation';

type CatalogProduct = Product & { variants: ProductVariant[] };
type RecentOrder = { id: string; order_number: number; customer_name: string; created_at: string };
type OrderLine = { id: string; variant_id: string | null; product_name: string; variant_sku: string; quantity: number; unit_sell_price: number };
const methodLabels: Record<'cash' | 'instapay' | 'card' | 'wallet', 'posCash' | 'posInstaPay' | 'posCard' | 'returnWallet'> = { cash: 'posCash', instapay: 'posInstaPay', card: 'posCard', wallet: 'returnWallet' };

export function QuickReturnModal({ products, shiftId, initialOrderId, onClose, onComplete }: {
  products: CatalogProduct[]; shiftId: string | null; initialOrderId?: string | null; onClose: () => void; onComplete: () => void;
}) {
  const { t, dir, lang } = useTranslation();
  const [search, setSearch] = useState('');
  const [scan, setScan] = useState('');
  const [orderId, setOrderId] = useState('');
  const [orders, setOrders] = useState<RecentOrder[]>([]);
  const [orderLines, setOrderLines] = useState<OrderLine[]>([]);
  const [selected, setSelected] = useState<{ product: CatalogProduct; variant: ProductVariant } | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [refund, setRefund] = useState('');
  const [method, setMethod] = useState<'cash' | 'instapay' | 'card' | 'wallet'>('cash');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadRecentOrders = useCallback(async () => {
    if (!shiftId) { setOrders([]); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.from('orders').select('id,order_number,customer_name,created_at').eq('shift_id', shiftId).order('created_at', { ascending: false }).limit(8);
      if (error) throw error;
      setOrders(data ?? []);
    } catch (error) {
      console.error('[QuickReturnModal] Recent orders query failed:', error);
      toast.error(t('posRecentReceiptsError'));
    } finally { setLoading(false); }
  }, [shiftId, t]);

  useEffect(() => { void loadRecentOrders(); }, [loadRecentOrders]);
  useEffect(() => {
    if (!initialOrderId) return;
    setOrderId(initialOrderId);
    setSelected(null);
    void (async () => {
      const { data, error } = await supabase.from('order_items').select('id,variant_id,product_name,variant_sku,quantity,unit_sell_price').eq('order_id', initialOrderId);
      if (error) { console.error('[QuickReturnModal] Prefilled order query failed:', error); return; }
      setOrderLines(data ?? []);
    })();
  }, [initialOrderId]);

  const matches = useMemo(() => {
    const query = search.trim().toLocaleLowerCase(lang);
    if (!query) return products;
    return products.filter((product) => product.name.toLocaleLowerCase(lang).includes(query) || product.variants.some((variant) => variant.sku.toLocaleLowerCase(lang).includes(query)));
  }, [products, search, lang]);

  async function chooseOrder(order: RecentOrder) {
    setOrderId(order.id); setOrderLines([]);
    setSelected(null);
    const { data, error } = await supabase.from('order_items').select('id,variant_id,product_name,variant_sku,quantity,unit_sell_price').eq('order_id', order.id);
    if (error) { console.error('[QuickReturnModal] Order items query failed:', error); toast.error(t('posQuickReturnError')); return; }
    setOrderLines(data ?? []);
  }

  function chooseVariant(product: CatalogProduct, variant: ProductVariant) {
    setSelected({ product, variant }); setQuantity(1); setRefund(String(Number(variant.unit_sell_price)));
  }

  async function chooseOrderLine(line: OrderLine) {
    if (!line.variant_id) return;
    let product = products.find((entry) => entry.variants.some((variant) => variant.id === line.variant_id));
    let variant = product?.variants.find((entry) => entry.id === line.variant_id);
    if (!product || !variant) {
      try {
        const { data: variantRow, error: variantError } = await supabase.from('product_variants').select('id,product_id,sku,color,size,image_url,unit_sell_price,stock_qty,is_active,created_at,updated_at').eq('id', line.variant_id).maybeSingle();
        if (variantError || !variantRow) throw variantError ?? new Error('Order variant not found');
        const { data: productRow, error: productError } = await supabase.from('products').select('id,name,description,category,brand,is_best_seller,compare_at_price,image_url,image_urls,gallery_urls,style_tags,is_active,created_at,updated_at').eq('id', variantRow.product_id).maybeSingle();
        if (productError || !productRow) throw productError ?? new Error('Order product not found');
        product = { ...productRow, variants: [] } as CatalogProduct;
        variant = { ...variantRow, unit_cost_price: 0 } as ProductVariant;
      } catch (error) {
        console.error('[QuickReturnModal] Could not load returned order item:', error);
        toast.error(t('posQuickReturnError'));
        return;
      }
    }
    chooseVariant(product, variant);
    setRefund(String(Number(line.unit_sell_price)));
  }

  function scanSku() {
    const sku = scan.trim().toLocaleLowerCase(lang);
    const product = products.find((entry) => entry.variants.some((variant) => variant.sku.toLocaleLowerCase(lang) === sku));
    const variant = product?.variants.find((entry) => entry.sku.toLocaleLowerCase(lang) === sku);
    if (!product || !variant) { toast.error(t('returnBarcodeNotFound')); return; }
    chooseVariant(product, variant); setSearch(sku); setScan('');
  }

  async function submit() {
    if (!selected || saving || quantity < 1 || !Number.isFinite(Number(refund)) || Number(refund) < 0) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc('process_product_return', {
        p_variant_id: selected.variant.id, p_quantity: quantity, p_refund_amount: Number(refund),
        p_refund_method: method, p_order_id: orderId || null, p_reason: reason.trim() || null,
      });
      if (error) {
        console.error('[QuickReturnModal] Return RPC failed:', error);
        toast.error(error.message.toLowerCase().includes('open cashier shift') ? t('shiftRequired') : t('posQuickReturnError'));
        return;
      }
      toast.success(t('returnSuccess'));
      onComplete(); onClose();
    } catch (error) {
      console.error('[QuickReturnModal] Unexpected return failure:', error);
      toast.error(t('posQuickReturnError'));
    } finally { setSaving(false); }
  }

  return <div dir={dir} role="presentation" className="fixed inset-0 z-[90] grid place-items-center bg-stone-950/60 p-3 sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="quick-return-title" className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-lg border border-stone-200 bg-white shadow-2xl">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-stone-200 bg-white px-4 py-3 sm:px-6"><div><h2 id="quick-return-title" className="text-lg font-black">{t('posQuickReturn')}</h2><p className="mt-1 text-xs text-stone-500">{t('posQuickReturnHint')}</p></div><button type="button" onClick={onClose} aria-label={t('closeMenu')} className="grid size-11 place-items-center rounded-md hover:bg-stone-100"><X className="size-5" /></button></header>
      <div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-[1fr_19rem]">
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2"><label className="relative"><Search className={`absolute top-3.5 size-4 text-stone-400 ${dir === 'rtl' ? 'end-3' : 'start-3'}`} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('returnSearch')} className={`h-11 w-full rounded-md border border-stone-300 ${dir === 'rtl' ? 'pe-10 ps-3' : 'ps-10 pe-3'} text-start text-sm`} /></label><div className="flex gap-2"><label className="relative flex-1"><Barcode className={`absolute top-3.5 size-4 text-stone-400 ${dir === 'rtl' ? 'end-3' : 'start-3'}`} /><input dir="ltr" value={scan} onChange={(event) => setScan(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); scanSku(); } }} placeholder={t('returnScan')} className="h-11 w-full rounded-md border border-stone-300 px-10 text-start text-sm" /></label><button type="button" onClick={scanSku} className="min-h-11 rounded-md border border-stone-300 px-3 text-sm font-semibold">{t('returnFind')}</button></div></div>
          {orderId && <div className="rounded-md border border-[#B89650]/40 bg-amber-50/50 p-3"><p className="mb-2 text-xs font-bold">{t('posQuickReturnOrderItems')}</p>{orderLines.length ? <div className="flex flex-wrap gap-2">{orderLines.map((line) => { return <button key={line.id} type="button" disabled={!line.variant_id} onClick={() => void chooseOrderLine(line)} className="min-h-10 rounded-md border border-amber-700/20 bg-white px-3 text-start text-xs disabled:opacity-50">{line.product_name} · {line.variant_sku} × {line.quantity}</button>; })}</div> : <p className="text-xs text-stone-500">{t('loadingInventory')}</p>}</div>}
          <div className="max-h-[42vh] space-y-2 overflow-y-auto">{matches.map((product) => <article key={product.id} className="rounded-md border border-stone-200 p-3"><h3 className="mb-2 text-sm font-bold">{product.name}</h3><div className="flex flex-wrap gap-2">{product.variants.map((variant) => <button key={variant.id} type="button" onClick={() => chooseVariant(product, variant)} className={`min-h-10 rounded-md border px-3 text-xs ${selected?.variant.id === variant.id ? 'border-[#B89650] bg-amber-50' : 'border-stone-200'}`}>{variant.color || t('oneColor')} · {variant.size || t('pdpNoSize')} · {variant.sku}</button>)}</div></article>)}{matches.length === 0 && <p className="p-6 text-center text-sm text-stone-500">{t('returnNoProducts')}</p>}</div>
        </div>
        <aside className="space-y-3 rounded-md border border-stone-200 p-3">
          <h3 className="text-sm font-bold">{t('posRecentReceipts')}</h3>
          {!shiftId ? <p className="text-xs text-stone-500">{t('shiftRequired')}</p> : loading ? <LoaderCircle className="size-5 animate-spin text-stone-500" /> : <div className="max-h-44 space-y-1 overflow-y-auto">{orders.map((order) => <button key={order.id} type="button" onClick={() => void chooseOrder(order)} className={`w-full rounded-md border p-2 text-start text-xs ${orderId === order.id ? 'border-[#B89650] bg-amber-50' : 'border-stone-200'}`}><b>#{order.order_number}</b> · {order.customer_name}</button>)}{orders.length === 0 && <p className="text-xs text-stone-500">{t('posNoRecentReceipts')}</p>}</div>}
          {selected ? <><div className="rounded-md bg-stone-50 p-3"><p className="text-sm font-bold">{selected.product.name}</p><p className="mt-1 text-xs text-stone-500">{selected.variant.color || t('oneColor')} · {selected.variant.size || t('pdpNoSize')} · {selected.variant.sku}</p></div><label className="block text-xs font-semibold">{t('returnQuantity')}<input type="number" min="1" max={selected.variant.stock_qty + (orderLines.find((line) => line.variant_id === selected.variant.id)?.quantity ?? 0)} value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))} className="mt-1 h-10 w-full rounded-md border px-3" /></label><label className="block text-xs font-semibold">{t('returnRefundAmount')}<input type="number" min="0" step="0.01" value={refund} onChange={(event) => setRefund(event.target.value)} className="mt-1 h-10 w-full rounded-md border px-3" /></label><label className="block text-xs font-semibold">{t('returnMethod')}<select value={method} onChange={(event) => setMethod(event.target.value as typeof method)} className="mt-1 h-10 w-full rounded-md border bg-white px-2">{(['cash', 'instapay', 'card', 'wallet'] as const).map((value) => <option key={value} value={value}>{t(methodLabels[value])}</option>)}</select></label><label className="block text-xs font-semibold">{t('returnReason')}<input value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 h-10 w-full rounded-md border px-3" /></label><button type="button" disabled={saving} onClick={() => void submit()} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-stone-900 px-3 text-sm font-bold text-white disabled:opacity-50">{saving && <LoaderCircle className="size-4 animate-spin" />}{t('returnConfirm')}</button></> : <p className="rounded-md bg-stone-50 p-3 text-xs text-stone-500">{t('returnSelectPrompt')}</p>}
        </aside>
      </div>
    </section>
  </div>;
}
