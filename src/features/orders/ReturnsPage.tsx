import { useCallback, useEffect, useMemo, useState } from 'react';
import { Barcode, ImagePlus, LoaderCircle, PackageCheck, Search } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import type { Product, ProductVariant } from '../../lib/types';
import { useTranslation } from '../../i18n/useTranslation';
import { useStaffStore } from '../../store/staffStore';
import { useAuthStore } from '../../store/authStore';

type CatalogProduct = Product & { variants: ProductVariant[] };
type ReturnRow = { id: string; order_id: string | null; product_name_snapshot: string; variant_label_snapshot: string; quantity: number; refund_amount: number; refund_method: string; reason: string | null; processed_by_name: string | null; created_at: string };
const methods = ['cash', 'instapay', 'card', 'wallet'] as const;

export function ReturnsPage() {
  const { t, dir, lang, formatCurrency } = useTranslation();
  const role = useStaffStore((state) => state.role);
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [returns, setReturns] = useState<ReturnRow[]>([]);
  const [activeShiftId, setActiveShiftId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [barcode, setBarcode] = useState('');
  const [selected, setSelected] = useState<{ product: CatalogProduct; variant: ProductVariant } | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundMethod, setRefundMethod] = useState<(typeof methods)[number]>('cash');
  const [orderId, setOrderId] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    if (!userId) { setLoading(false); return; }
    try {
      const shiftQuery = await supabase.from('shifts').select('id').eq('cashier_id', userId).eq('status', 'open').maybeSingle();
      setActiveShiftId(shiftQuery.data?.id ?? null);
      const [{ data: productRows, error: productError }, { data: variantRows, error: variantError }] = await Promise.all([
        supabase.from('products').select('*').eq('is_active', true).order('name'),
        supabase.from('product_variants').select('id,product_id,sku,color,size,image_url,unit_sell_price,stock_qty,is_active,created_at,updated_at').eq('is_active', true).order('sku'),
      ]);
      if (productError || variantError) { console.error('[ReturnsPage] Catalog query failed:', productError ?? variantError); toast.error(t('returnLoadError')); return; }
      const grouped = new Map<string, ProductVariant[]>();
      for (const row of variantRows ?? []) {
        const v = { ...row, unit_cost_price: 0 } as ProductVariant;
        grouped.set(v.product_id, [...(grouped.get(v.product_id) ?? []), v]);
      }
      setProducts((productRows ?? []).map((p) => ({ ...p, variants: grouped.get(p.id) ?? [] })));
      const { data: returnRows, error: returnError } = role === 'cashier' && shiftQuery.data?.id
        ? await supabase.from('product_returns').select('*').eq('shift_id', shiftQuery.data.id).order('created_at', { ascending: false }).limit(50)
        : role === 'cashier'
          ? { data: [], error: null }
          : await supabase.from('product_returns').select('*').order('created_at', { ascending: false }).limit(100);
      if (returnError) console.error('[ReturnsPage] Return history query failed:', returnError);
      if (returnError) toast.error(t('returnLoadError'));
      setReturns((returnRows ?? []) as ReturnRow[]);
    } catch (error) {
      console.error('[ReturnsPage] Unexpected load failure:', error);
      toast.error(t('returnLoadError'));
      setReturns([]);
    } finally {
      setLoading(false);
    }
  }, [role, t, userId]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const channel = supabase.channel('product-return-updates').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'product_returns' }, () => void refresh()).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [refresh]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLocaleLowerCase(lang);
    return products.filter((p) => !q || p.name.toLocaleLowerCase(lang).includes(q) || p.variants.some((v) => v.sku.toLocaleLowerCase(lang).includes(q)));
  }, [products, search, lang]);

  function choose(product: CatalogProduct, variant: ProductVariant) {
    setSelected({ product, variant });
    setQuantity(1);
    setRefundAmount(String(Number(variant.unit_sell_price)));
  }

  function scanSku() {
    const value = barcode.trim().toLocaleLowerCase(lang);
    if (!value) return;
    const product = products.find((p) => p.variants.some((v) => v.sku.toLocaleLowerCase(lang) === value));
    const variant = product?.variants.find((v) => v.sku.toLocaleLowerCase(lang) === value);
    if (!product || !variant) { toast.error(t('returnBarcodeNotFound')); return; }
    choose(product, variant);
    setSearch(value);
    setBarcode('');
  }

  async function submitReturn() {
    if (!selected || saving || !Number.isInteger(quantity) || quantity <= 0 || !Number.isFinite(Number(refundAmount)) || Number(refundAmount) < 0) return;
    if (role === 'cashier' && !activeShiftId) { toast.error(t('shiftRequired')); return; }
    if (orderId.trim() && !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(orderId.trim())) { toast.error(t('returnOrderIdInvalid')); return; }
    setSaving(true);
    try {
      const { error } = await supabase.rpc('process_product_return', {
        p_variant_id: selected.variant.id,
        p_quantity: quantity,
        p_refund_amount: Number(refundAmount),
        p_refund_method: refundMethod,
        p_order_id: orderId.trim() || null,
        p_reason: reason.trim() || null,
      });
      if (error) {
        console.error('[ReturnsPage] Return RPC failed:', error);
        toast.error(error.message.toLowerCase().includes('open cashier shift') ? t('shiftRequired') : t('returnSaveError'));
        return;
      }
      toast.success(t('returnSuccess'));
      setSelected(null); setOrderId(''); setReason(''); setQuantity(1); setRefundAmount('');
      await refresh();
    } catch (error) {
      console.error('[ReturnsPage] Unexpected return failure:', error);
      toast.error(t('returnSaveError'));
    } finally {
      setSaving(false);
    }
  }

  return <div dir={dir} className="space-y-6 tabular-nums">
    <header><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9A7A3D]">Different Store</p><h1 className="mt-2 text-2xl font-bold text-stone-900">{t('returnsTitle')}</h1><p className="mt-1 text-sm text-stone-500">{t('returnsSubtitle')}</p></header>
    <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-4 rounded-lg border border-stone-200 bg-white p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="relative"><Search className={`absolute top-3.5 size-4 text-stone-400 ${dir === 'rtl' ? 'end-3' : 'start-3'}`} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('returnSearch')} className={`h-11 w-full rounded-md border border-stone-300 ${dir === 'rtl' ? 'pe-10 ps-3' : 'ps-10 pe-3'} text-start text-sm`} /></label>
          <div className="flex gap-2"><label className="relative flex-1"><Barcode className={`absolute top-3.5 size-4 text-stone-400 ${dir === 'rtl' ? 'end-3' : 'start-3'}`} /><input value={barcode} onChange={(e) => setBarcode(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); scanSku(); } }} placeholder={t('returnScan')} dir="ltr" className="h-11 w-full rounded-md border border-stone-300 px-10 text-start text-sm" /></label><button type="button" onClick={scanSku} className="h-11 rounded-md border border-stone-300 px-3 text-sm font-semibold">{t('returnFind')}</button></div>
        </div>
        {loading ? <div className="grid min-h-44 place-items-center text-stone-500"><LoaderCircle className="size-5 animate-spin" /></div> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{filteredProducts.map((product) => {
          const image = product.image_url ?? product.gallery_urls?.[0] ?? product.image_urls?.[0];
          return <article key={product.id} className="overflow-hidden rounded-md border border-stone-200">
            {image ? <img src={image} alt={product.name} className="aspect-[4/5] w-full object-cover" /> : <div className="grid aspect-[4/5] place-items-center bg-stone-100 text-stone-400"><ImagePlus /></div>}
            <div className="p-3"><h2 className="truncate text-sm font-bold text-stone-900">{product.name}</h2><div className="mt-2 space-y-2">{product.variants.map((variant) => <button key={variant.id} type="button" onClick={() => choose(product, variant)} className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-md border px-2 text-start text-xs ${selected?.variant.id === variant.id ? 'border-[#B89650] bg-amber-50 text-stone-900' : 'border-stone-200 hover:bg-stone-50'}`}><span className="min-w-0 truncate">{variant.color || t('oneColor')} · {variant.size || t('pdpNoSize')} · {variant.sku}</span><span className="shrink-0 tabular-nums">{formatCurrency(Number(variant.unit_sell_price))}</span></button>)}</div></div>
          </article>;
        })}{filteredProducts.length === 0 && <p className="col-span-full p-8 text-center text-sm text-stone-500">{t('returnNoProducts')}</p>}</div>}
      </div>
      <aside className="h-fit rounded-lg border border-stone-200 bg-white p-4 sm:p-5 xl:sticky xl:top-20">
        <h2 className="flex items-center gap-2 font-bold text-stone-900"><PackageCheck className="size-5 text-[#9A7A3D]" />{t('returnDetails')}</h2>
        {selected ? <div className="mt-4 space-y-3">
          <div className="rounded-md bg-stone-50 p-3"><p className="font-semibold text-stone-800">{selected.product.name}</p><p className="mt-1 text-xs text-stone-500">{selected.variant.color || t('oneColor')} · {selected.variant.size || t('pdpNoSize')} · {selected.variant.sku}</p><p className="mt-1 text-xs text-stone-500">{t('returnStockNow')}: {new Intl.NumberFormat(lang).format(selected.variant.stock_qty)}</p></div>
          <label className="block text-xs font-semibold text-stone-600">{t('returnQuantity')}<input type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))} className="mt-1.5 h-11 w-full rounded-md border border-stone-300 px-3 text-start text-sm" /></label>
          <label className="block text-xs font-semibold text-stone-600">{t('returnRefundAmount')}<input type="number" min="0" step="0.01" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} className="mt-1.5 h-11 w-full rounded-md border border-stone-300 px-3 text-start text-sm" /></label>
          <label className="block text-xs font-semibold text-stone-600">{t('returnMethod')}<select value={refundMethod} onChange={(e) => setRefundMethod(e.target.value as (typeof methods)[number])} className="mt-1.5 h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-start text-sm">{methods.map((method) => <option key={method} value={method}>{t(({ cash: 'posCash', instapay: 'posInstaPay', card: 'posCard', wallet: 'returnWallet' })[method] as 'posCash')}</option>)}</select></label>
          <label className="block text-xs font-semibold text-stone-600">{t('returnOrderId')}<input value={orderId} onChange={(e) => setOrderId(e.target.value)} dir="ltr" placeholder={t('returnOrderIdPlaceholder')} className="mt-1.5 h-11 w-full rounded-md border border-stone-300 px-3 text-start text-sm" /></label>
          <label className="block text-xs font-semibold text-stone-600">{t('returnReason')}<textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="mt-1.5 w-full rounded-md border border-stone-300 px-3 py-2 text-start text-sm" /></label>
          <button type="button" disabled={saving || (role === 'cashier' && !activeShiftId)} onClick={() => void submitReturn()} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-stone-900 px-4 text-sm font-bold text-white disabled:opacity-50">{saving && <LoaderCircle className="size-4 animate-spin" />}{t('returnConfirm')}</button>
        </div> : <p className="mt-4 rounded-md bg-stone-50 p-4 text-sm text-stone-500">{t('returnSelectPrompt')}</p>}
      </aside>
    </section>
    <section className="overflow-hidden rounded-lg border border-stone-200 bg-white"><div className="border-b border-stone-200 p-4"><h2 className="font-bold text-stone-900">{t('returnRecent')}</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[800px] text-start text-sm"><thead className="bg-stone-50 text-xs text-stone-500"><tr>{[t('returnDate'), t('returnProduct'), t('returnQuantity'), t('returnRefundAmount'), t('returnMethod'), t('returnOrderId')].map((label) => <th key={label} className="px-4 py-3 text-start">{label}</th>)}</tr></thead><tbody className="divide-y divide-stone-100">{returns.map((row) => <tr key={row.id}><td className="px-4 py-3 tabular-nums">{new Intl.DateTimeFormat(lang, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(row.created_at))}</td><td className="px-4 py-3"><p className="font-semibold">{row.product_name_snapshot}</p><p className="text-xs text-stone-500">{row.variant_label_snapshot}</p></td><td className="px-4 py-3 tabular-nums">{new Intl.NumberFormat(lang).format(row.quantity)}</td><td className="px-4 py-3 tabular-nums">{formatCurrency(Number(row.refund_amount))}</td><td className="px-4 py-3">{t(({ cash: 'posCash', instapay: 'posInstaPay', card: 'posCard', wallet: 'returnWallet' }[row.refund_method] ?? 'posCash') as 'posCash')}</td><td className="px-4 py-3 font-mono text-xs">{row.order_id?.slice(0, 8) ?? '—'}</td></tr>)}</tbody></table>{returns.length === 0 && !loading && <p className="p-6 text-center text-sm text-stone-500">{t('returnNoRecords')}</p>}</div></section>
  </div>;
}
