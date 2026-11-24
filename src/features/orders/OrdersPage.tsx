import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Eye, MessageCircle, Plus, Printer, X } from 'lucide-react';
import { toast } from 'sonner';
import { Link, useSearchParams } from 'react-router-dom';
import type { Order, OrderItem, OrderStatus, ProductReturn, ProductVariant, ShippingZone } from '../../lib/types';
import { supabase } from '../../lib/supabase';
import { useTranslation } from '../../i18n/useTranslation';
import { formatVariantLabel } from '../../utils/formatVariantLabel';
import { normalizeEgyptianPhone } from '../../utils/normalizeEgyptianPhone';

type OrderRow = Order & { items: OrderItem[]; zoneName: string; variantMeta: Record<string, Pick<ProductVariant, 'color' | 'size'>> };
const statuses: OrderStatus[] = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'];
const statusKey: Record<OrderStatus, 'statusPending' | 'statusConfirmed' | 'statusProcessing' | 'statusShipped' | 'statusDelivered' | 'statusCancelled' | 'statusReturned'> = {
  pending: 'statusPending', confirmed: 'statusConfirmed', processing: 'statusProcessing', shipped: 'statusShipped', delivered: 'statusDelivered', cancelled: 'statusCancelled', returned: 'statusReturned',
};

async function fetchAllReturns() {
  const allRows: ProductReturn[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from('product_returns').select('*').order('created_at', { ascending: false }).range(offset, offset + pageSize - 1);
    if (error) return { data: null, error };
    const page = (data ?? []) as ProductReturn[];
    allRows.push(...page);
    if (page.length < pageSize) return { data: allRows, error: null };
  }
}

export function OrdersPage() {
  const { t, dir, lang, formatCurrency } = useTranslation();
  const [searchParams] = useSearchParams();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [returns, setReturns] = useState<ProductReturn[]>([]);
  const [returnProductNames, setReturnProductNames] = useState<Record<string, string>>({});
  const [returnVariantMeta, setReturnVariantMeta] = useState<Record<string, Pick<ProductVariant, 'sku' | 'color' | 'size'>>>({});
  const [zones, setZones] = useState<ShippingZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [source, setSource] = useState(searchParams.get('source') ?? 'all');
  const [status, setStatus] = useState(searchParams.get('status') ?? 'all');
  const [selected, setSelected] = useState<string[]>([]);
  const [detail, setDetail] = useState<OrderRow | null>(null);
  const [tab, setTab] = useState<'orders' | 'zones'>('orders');
  const [zoneDraft, setZoneDraft] = useState<Partial<ShippingZone> | null>(null);
  const [printOrder, setPrintOrder] = useState<OrderRow | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    const [{ data: rows, error }, { data: zoneRows }, { data: itemRows }, { data: returnRows, error: returnError }, { data: productRows }] = await Promise.all([
      supabase.from('orders').select('*').order('created_at', { ascending: false }),
      supabase.from('shipping_zones').select('*'),
      supabase.from('order_items').select('*'),
      fetchAllReturns(),
      supabase.from('products').select('id,name'),
    ]);
    if (error) { toast.error(t('ordersLoadError')); setLoading(false); return; }
    if (returnError) console.error('[OrdersPage] Return ledger query failed:', returnError);
    const allReturns = returnError ? [] : (returnRows ?? []) as ProductReturn[];
    setReturns(allReturns);
    setReturnProductNames(Object.fromEntries((productRows ?? []).map((product) => [product.id, product.name])));
    const variantIds = [...new Set([
      ...(itemRows ?? []).map((item) => item.variant_id),
      ...allReturns.map((row) => row.variant_id),
    ].filter((id): id is string => Boolean(id)))];
    const variants = variantIds.length ? await supabase.from('product_variants').select('id,sku,color,size').in('id', variantIds) : { data: [] };
    const zonesList = zoneRows ?? [];
    const zoneMap = new Map(zonesList.map((zone) => [zone.id, zone.name]));
    const variantMap = Object.fromEntries((variants.data ?? []).map((variant) => [variant.id, { sku: variant.sku, color: variant.color, size: variant.size }]));
    setReturnVariantMeta(variantMap);
    setZones(zonesList);
    setOrders((rows ?? []).map((order) => ({ ...order, items: (itemRows ?? []).filter((item) => item.order_id === order.id), zoneName: zoneMap.get(order.shipping_zone_id ?? '') ?? '', variantMeta: variantMap })));
    setLoading(false);
  }, [lang, t]);

  useEffect(() => { void loadOrders(); }, [loadOrders]);
  useEffect(() => {
    const refresh = () => { void loadOrders(); };
    const channel = supabase.channel('admin-order-returns')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_returns' }, refresh)
      .subscribe((state) => { if (import.meta.env.DEV && state === 'CHANNEL_ERROR') console.error('[OrdersPage] Return realtime channel failed'); });
    window.addEventListener('different-store-return-processed', refresh);
    window.addEventListener('focus', refresh);
    return () => { window.removeEventListener('different-store-return-processed', refresh); window.removeEventListener('focus', refresh); void supabase.removeChannel(channel); };
  }, [loadOrders]);
  useEffect(() => {
    if (!printOrder) return;
    const timer = window.setTimeout(() => window.print(), 100);
    const clearPrint = () => setPrintOrder(null);
    window.addEventListener('afterprint', clearPrint, { once: true });
    return () => { window.clearTimeout(timer); window.removeEventListener('afterprint', clearPrint); };
  }, [printOrder]);

  const returnedOrderIds = useMemo(() => new Set(returns.flatMap((row) => row.order_id ? [row.order_id] : [])), [returns]);
  const isReturnedOrder = (order: OrderRow) => order.status === 'returned' || returnedOrderIds.has(order.id);
  const filtered = useMemo(() => orders.filter((order) => {
    if (source !== 'all' && order.channel !== source) return false;
    if (status === 'confirmed-processing' && !['confirmed', 'processing'].includes(order.status)) return false;
    if (status === 'returned' && !isReturnedOrder(order)) return false;
    if (status !== 'all' && status !== 'confirmed-processing' && status !== 'returned' && order.status !== status) return false;
    const needle = query.trim().toLocaleLowerCase(lang);
    return !needle || [String(order.order_number), order.id, order.customer_name, order.customer_phone].some((value) => value.toLocaleLowerCase(lang).includes(needle));
  }), [orders, returnedOrderIds, source, status, query, lang]);

  const statusCounts = useMemo(() => {
    const base = source === 'all' ? orders : orders.filter((order) => order.channel === source);
    return {
      all: base.length,
      pending: base.filter((order) => order.status === 'pending').length,
      'confirmed-processing': base.filter((order) => order.status === 'confirmed' || order.status === 'processing').length,
      shipped: base.filter((order) => order.status === 'shipped').length,
      delivered: base.filter((order) => order.status === 'delivered').length,
      cancelled: base.filter((order) => order.status === 'cancelled').length,
      returned: base.filter(isReturnedOrder).length + (source === 'storefront' ? 0 : returns.filter((row) => !row.order_id).length),
    };
  }, [orders, returns, source, returnedOrderIds]);

  async function exportShipping() {
    const chosen = selected.length ? orders.filter((order) => selected.includes(order.id)) : filtered.filter((order) => order.channel === 'storefront' && ['pending', 'confirmed'].includes(order.status));
    if (!chosen.length) { toast.error(t('exportError')); return; }
    const data = chosen.map((order) => ({
      [t('courierOrderNumber')]: order.order_number,
      [t('courierCustomerName')]: order.customer_name,
      [t('courierPhone')]: order.customer_phone,
      [t('courierGovernorate')]: localizedZoneName(order.zoneName),
      [t('courierAddress')]: order.shipping_address ?? '',
      [t('courierCod')]: order.payment_method === 'cod' ? Number(order.total_egp) : 0,
      [t('courierItems')]: order.items.map((item) => `${item.product_name} (${formatVariantLabel(order.variantMeta[item.variant_id ?? '']?.color, order.variantMeta[item.variant_id ?? '']?.size, t, '/')}) x${item.quantity}`).join('، '),
      [t('courierNotes')]: order.notes ?? '',
    }));
    try {
      const XLSX = await import('xlsx');
      const sheet = XLSX.utils.json_to_sheet(data);
      sheet['!cols'] = Object.keys(data[0]).map((key) => ({ wch: Math.max(key.length + 2, 18) }));
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, t('shippingSheet').slice(0, 31));
      XLSX.writeFile(book, `shipping-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success(t('exportSuccess'));
    } catch {
      toast.error(t('exportError'));
    }
  }

  async function changeStatus(order: OrderRow, next: string) {
    const { error } = await supabase.rpc('update_order_status_atomic', { p_order_id: order.id, p_new_status: next });
    if (error) { toast.error(t('orderUpdateError')); return; }
    toast.success(t('statusUpdated')); await loadOrders();
    if (detail?.id === order.id) setDetail((current) => current ? { ...current, status: next as OrderStatus } : current);
  }

  async function cancelOrder(order: OrderRow) {
    if (!window.confirm(t('confirmCancelOrder'))) return;
    const { error } = await supabase.rpc('cancel_order_atomic', { p_order_id: order.id });
    if (error) { toast.error(t('cancelOrderError')); return; }
    toast.success(t('orderCancelled')); setDetail(null); await loadOrders();
  }

  async function saveZone(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!zoneDraft) return;
    const payload = { name: zoneDraft.name?.trim() ?? '', fee_egp: Number(zoneDraft.fee_egp), cod_fee_egp: Number(zoneDraft.cod_fee_egp ?? 0), is_active: zoneDraft.is_active ?? true };
    const result = zoneDraft.id ? await supabase.from('shipping_zones').update(payload).eq('id', zoneDraft.id) : await supabase.from('shipping_zones').insert(payload);
    if (result.error) { toast.error(t('zoneSaveError')); return; }
    toast.success(t('zoneSaved')); setZoneDraft(null); await loadOrders();
  }

  const statusLabel = (value: OrderStatus) => t(statusKey[value]);
  const statusTone = (value: OrderStatus) => value === 'pending' ? 'bg-amber-50 text-amber-800' : ['confirmed', 'processing'].includes(value) ? 'bg-sky-50 text-sky-700' : value === 'shipped' ? 'bg-indigo-50 text-indigo-700' : value === 'delivered' ? 'bg-emerald-50 text-emerald-700' : ['cancelled', 'returned'].includes(value) ? 'bg-red-50 text-red-700' : 'bg-stone-100 text-stone-600';
  const quickStatusFilters = [
    { value: 'all', key: 'filterAll' }, { value: 'pending', key: 'statusPending' }, { value: 'confirmed-processing', key: 'filterConfirmedProcessing' },
    { value: 'shipped', key: 'filterShipped' }, { value: 'delivered', key: 'filterDelivered' }, { value: 'cancelled', key: 'filterCancelled' }, { value: 'returned', key: 'filterReturned' },
  ] as const;
  function notifyWhatsApp(order: OrderRow) {
    const phone = normalizeEgyptianPhone(order.customer_phone);
    if (!phone) return;
    const key = ['confirmed', 'processing'].includes(order.status) ? 'orderWhatsAppConfirmed' : order.status === 'shipped' ? 'orderWhatsAppShipped' : 'orderWhatsAppUpdate';
    const message = t(key).replace('{customer}', order.customer_name).replace('{order}', String(order.order_number)).replace('{total}', formatCurrency(Number(order.total_egp))).replace('{status}', statusLabel(order.status));
    window.open(`https://wa.me/20${phone.slice(1)}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  }
  const localizedZoneName = (name: string) => {
    const keys = { 'القاهرة': 'zoneCairo', 'الجيزة': 'zoneGiza', 'الإسكندرية': 'zoneAlexandria', 'الدلتا والقناة': 'zoneDelta', 'صعيد مصر': 'zoneUpperEgypt' } as const;
    const key = keys[name as keyof typeof keys];
    return key ? t(key) : name;
  };
  const returnedQuantity = (orderId: string, variantId: string | null) => returns.filter((row) => row.order_id === orderId && row.variant_id === variantId).reduce((sum, row) => sum + Number(row.quantity), 0);
  const returnSummary = (order: OrderRow) => {
    const linked = returns.filter((row) => row.order_id === order.id);
    const refunded = linked.reduce((sum, row) => sum + Number(row.refund_amount || 0), 0);
    const returnedUnits = linked.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
    const orderedUnits = order.items.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
    const fullyReturned = order.status === 'returned' || (returnedUnits > 0 && orderedUnits > 0 && returnedUnits >= orderedUnits);
    return { linked, refunded, returnedUnits, fullyReturned, netTotal: Math.max(0, Number(order.total_egp) - refunded) };
  };
  const paymentLabel = (method: string) => method === 'cod' ? t('storeCod') : method === 'instapay' ? t('storeInstaPay') : t('posCash');
  const localizedReturnValue = (value: string | null, kind: 'color' | 'size') => {
    const raw = value?.trim() ?? '';
    if (lang !== 'ar' || !raw) return raw || t(kind === 'color' ? 'oneColor' : 'pdpNoSize');
    const dictionary: Record<string, string> = kind === 'color' ? {
      black: 'أسود', 'obsidian black': 'أسود أوبسيديان', beige: 'بيج', 'warm beige': 'بيج دافئ', espresso: 'بني إسبريسو', brown: 'بني', camel: 'جملي', burgundy: 'عنابي', cashmere: 'كشمير', ivory: 'أبيض عاجي', white: 'أبيض', champagne: 'شامبين', red: 'أحمر', blue: 'أزرق', green: 'أخضر', gray: 'رمادي', grey: 'رمادي', gold: 'ذهبي', silver: 'فضي',
    } : { 'one size': t('pdpNoSize'), 'one-size': t('pdpNoSize'), 'universal size': t('pdpNoSize') };
    return dictionary[raw.toLocaleLowerCase('en')] ?? raw;
  };
  const localizedReturnVariant = (row: ProductReturn) => {
    const variant = returnVariantMeta[row.variant_id ?? ''];
    if (lang !== 'ar') return row.variant_label_snapshot;
    if (variant) return [localizedReturnValue(variant.color, 'color'), localizedReturnValue(variant.size, 'size'), variant.sku].filter(Boolean).join(' · ');
    const [color, size, ...rest] = row.variant_label_snapshot.split(' · ');
    return [localizedReturnValue(color, 'color'), localizedReturnValue(size, 'size'), ...rest].filter(Boolean).join(' · ');
  };
  return <section dir={dir} className="space-y-5 tabular-nums">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-black">{t('ordersTitle')}</h1><p className="mt-1 text-sm text-stone-500">{t('ordersSubtitle')}</p></div><div className="flex gap-2"><button onClick={() => setTab(tab === 'orders' ? 'zones' : 'orders')} className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold">{t('shippingZones')}</button>{tab === 'orders' && <button onClick={exportShipping} className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2 text-sm font-bold text-white"><Download className="size-4" />{t('exportShipping')}</button>}</div></div>
    {tab === 'orders' ? <>
      <div className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4"><div className="grid gap-3 md:grid-cols-[1fr_auto]"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('orderSearch')} className="h-11 rounded-lg border border-stone-300 px-3 text-start text-sm" /><select value={source} onChange={(e) => setSource(e.target.value)} className="h-11 rounded-lg border border-stone-300 px-3 text-start text-sm"><option value="all">{t('sourceAll')}</option><option value="storefront">{t('sourceOnline')}</option><option value="pos">{t('sourcePos')}</option></select></div><div className="flex gap-2 overflow-x-auto pb-1">{quickStatusFilters.map((filter) => <button key={filter.value} type="button" onClick={() => setStatus(filter.value)} aria-pressed={status === filter.value} className={`min-h-11 shrink-0 rounded-lg border px-3 text-xs font-semibold transition ${status === filter.value ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'}`}>{t(filter.key)} <span className="ms-1 tabular-nums opacity-75">{new Intl.NumberFormat(lang).format(statusCounts[filter.value])}</span></button>)}</div></div>
      <section className={`overflow-hidden rounded-xl border bg-white ${status === 'returned' ? 'border-[#C8A86A] ring-1 ring-[#C8A86A]/20' : 'border-stone-200'}`}><header className="flex items-center justify-between border-b border-stone-100 px-4 py-3"><h2 className="font-bold">{t('ordersReturnsLedger')}</h2><span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800 tabular-nums">{new Intl.NumberFormat(lang).format(returns.length)}</span></header>{returns.length ? <div className="max-h-64 divide-y divide-stone-100 overflow-y-auto">{returns.map((row) => <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"><div><p className="font-semibold">{lang === 'ar' && row.product_id ? returnProductNames[row.product_id] ?? row.product_name_snapshot : row.product_name_snapshot} <span className="ms-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700">{t('ordersReturnedItems')} ×{row.quantity}</span></p><p className="mt-1 text-xs text-stone-500">{localizedReturnVariant(row)} · {row.order_id ? `${t('orderNumber')} #${orders.find((order) => order.id === row.order_id)?.order_number ?? row.order_id.slice(0, 8)}` : t('walkInReturnNoReceipt')} · {new Intl.DateTimeFormat(lang, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(row.created_at))}</p></div><b className="tabular-nums">− {formatCurrency(Number(row.refund_amount))}</b></div>)}</div> : <p className="p-5 text-center text-sm text-stone-500">{t('returnNoRecords')}</p>}</section>
      {(status !== 'returned' || filtered.length > 0) && <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white"><table className="w-full min-w-[980px] text-start text-sm"><thead className="bg-stone-50 text-xs text-stone-500"><tr><th className="p-3"><input type="checkbox" checked={filtered.length > 0 && filtered.every((o) => selected.includes(o.id))} onChange={(e) => setSelected(e.target.checked ? [...new Set([...selected, ...filtered.map((o) => o.id)])] : selected.filter((id) => !filtered.some((o) => o.id === id)))} aria-label={t('selectedOrders')} /></th><th className="p-3">{t('orderNumber')}</th><th className="p-3">{t('customer')}</th><th className="p-3">{t('source')}</th><th className="p-3">{t('status')}</th><th className="p-3">{t('date')}</th><th className="p-3">{t('total')}</th><th className="p-3"></th></tr></thead><tbody className="divide-y divide-stone-100">{filtered.map((order) => { const summary = returnSummary(order); return <tr key={order.id} className="hover:bg-stone-50"><td className="p-3"><input type="checkbox" checked={selected.includes(order.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, order.id] : selected.filter((id) => id !== order.id))} aria-label={`${t('orderNumber')} ${order.order_number}`} /></td><td className="p-3 font-bold">#{order.order_number}</td><td className="p-3"><div className="font-semibold">{order.customer_name}</div><div dir="ltr" className="text-xs text-stone-500">{order.customer_phone}</div></td><td className="p-3">{t(order.channel === 'pos' ? 'sourcePos' : 'sourceOnline')}</td><td className="p-3"><div className="flex flex-wrap gap-1"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone(order.status)}`}>{statusLabel(order.status)}</span>{summary.returnedUnits > 0 && <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">{t(summary.fullyReturned ? 'ordersReturnedFull' : 'ordersReturnedPartial')}</span>}</div></td><td className="p-3 text-xs tabular-nums">{new Intl.DateTimeFormat(lang, { dateStyle: 'medium' }).format(new Date(order.created_at))}</td><td className="p-3 font-semibold tabular-nums">{summary.refunded > 0 ? <><span className="block text-xs font-normal text-stone-500 line-through">{formatCurrency(Number(order.total_egp))}</span><span>{formatCurrency(summary.netTotal)}</span></> : formatCurrency(Number(order.total_egp))}</td><td className="p-3"><div className="flex items-center gap-1"><button onClick={() => setDetail(order)} className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 py-1 text-rose-700 hover:bg-rose-50"><Eye className="size-4" />{t('details')}</button>{normalizeEgyptianPhone(order.customer_phone) && <button type="button" onClick={() => notifyWhatsApp(order)} aria-label={t('notifyWhatsApp')} title={t('notifyWhatsApp')} className="grid size-10 place-items-center rounded-lg text-emerald-700 hover:bg-emerald-50"><MessageCircle className="size-4" /></button>}{order.channel === 'storefront' && <button type="button" onClick={() => setPrintOrder(order)} aria-label={t('printPackingSlip')} title={t('printPackingSlip')} className="grid size-10 place-items-center rounded-lg text-stone-600 hover:bg-stone-100"><Printer className="size-4" /></button>}</div></td></tr>; })}</tbody></table>{!loading && !filtered.length && <div className="p-10 text-center text-sm text-stone-500">{t('noOrders')}</div>}{loading && <div className="p-8 text-center text-sm text-stone-500">{t('loadingInventory')}</div>}</div>}
    </> : <div className="space-y-4 rounded-2xl border border-stone-200 bg-white p-4"><div className="flex justify-between"><h2 className="text-lg font-bold">{t('shippingZones')}</h2><button onClick={() => setZoneDraft({ fee_egp: 0, cod_fee_egp: 0, is_active: true })} className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-3 py-2 text-sm font-bold text-white"><Plus className="size-4" />{t('addZone')}</button></div><div className="divide-y divide-stone-100">{zones.map((zone) => <div key={zone.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-semibold">{zone.name}</p><p className="text-xs text-stone-500">{t('shippingFee')}: {formatCurrency(Number(zone.fee_egp))} · {t('codFee')}: {formatCurrency(Number(zone.cod_fee_egp))}</p></div><div className="flex gap-2"><button onClick={() => void supabase.from('shipping_zones').update({ is_active: !zone.is_active }).eq('id', zone.id).then(({ error }) => error ? toast.error(t('zoneSaveError')) : void loadOrders())} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${zone.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-100 text-stone-500'}`}>{zone.is_active ? t('active') : t('inactive')}</button><button onClick={() => setZoneDraft(zone)} className="rounded-lg border px-3 py-1.5 text-xs font-bold">{t('edit')}</button></div></div>)}</div></div>}
    {zoneDraft && <div className="fixed inset-0 z-[60] grid place-items-center bg-stone-950/40 p-4"><form onSubmit={(e) => void saveZone(e)} className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6"><div className="flex justify-between"><h2 className="text-lg font-bold">{zoneDraft.id ? t('edit') : t('addZone')}</h2><button type="button" onClick={() => setZoneDraft(null)}><X className="size-5" /></button></div><label className="block text-start text-sm">{t('zoneName')}<input required value={zoneDraft.name ?? ''} onChange={(e) => setZoneDraft({ ...zoneDraft, name: e.target.value })} placeholder={t('zoneNamePlaceholder')} className="mt-1 w-full rounded-lg border px-3 py-2" /></label><div className="grid grid-cols-2 gap-3"><label className="text-start text-sm">{t('shippingFee')}<input required min="0" step="0.01" type="number" value={zoneDraft.fee_egp ?? 0} onChange={(e) => setZoneDraft({ ...zoneDraft, fee_egp: Number(e.target.value) })} className="mt-1 w-full rounded-lg border px-3 py-2" /></label><label className="text-start text-sm">{t('codFee')}<input required min="0" step="0.01" type="number" value={zoneDraft.cod_fee_egp ?? 0} onChange={(e) => setZoneDraft({ ...zoneDraft, cod_fee_egp: Number(e.target.value) })} className="mt-1 w-full rounded-lg border px-3 py-2" /></label></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={zoneDraft.is_active ?? true} onChange={(e) => setZoneDraft({ ...zoneDraft, is_active: e.target.checked })} />{t('zoneActive')}</label><button className="w-full rounded-xl bg-rose-700 px-4 py-3 font-bold text-white">{t('save')}</button></form></div>}
    {detail && <div className="fixed inset-0 z-50 flex justify-end bg-stone-950/40" onClick={() => setDetail(null)}><aside dir={dir} onClick={(e) => e.stopPropagation()} className="h-full w-full max-w-xl overflow-y-auto bg-white p-5 shadow-2xl sm:p-7"><div className="flex items-start justify-between"><div><h2 className="text-xl font-black">{t('orderDetails')} · #{detail.order_number}</h2><div className="mt-2 flex flex-wrap gap-1"><p className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone(detail.status)}`}>{statusLabel(detail.status)}</p>{returnSummary(detail).returnedUnits > 0 && <p className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">{t(returnSummary(detail).fullyReturned ? 'ordersReturnedFull' : 'ordersReturnedPartial')}</p>}</div></div><button onClick={() => setDetail(null)} className="grid size-10 place-items-center rounded-lg hover:bg-stone-100"><X /></button></div><section className="mt-6 rounded-lg bg-stone-50 p-4"><h3 className="font-bold">{t('customerDetails')}</h3><p className="mt-2">{detail.customer_name} · <span dir="ltr">{detail.customer_phone}</span></p><p className="mt-1 text-sm text-stone-600">{detail.shipping_address || '—'}</p><p className="text-sm text-stone-600">{localizedZoneName(detail.zoneName)}</p>{detail.notes && <p className="mt-2 text-sm">{t('notes')}: {detail.notes}</p>}<p className="mt-2 text-sm">{t('paymentMethod')}: {paymentLabel(detail.payment_method)}</p></section><div className="mt-4 flex flex-wrap gap-2">{normalizeEgyptianPhone(detail.customer_phone) && <button type="button" onClick={() => notifyWhatsApp(detail)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-emerald-700/30 bg-emerald-50 px-3 text-sm font-semibold text-emerald-800"><MessageCircle className="size-4" />{t('notifyWhatsApp')}</button>}{detail.channel === 'storefront' && <button type="button" onClick={() => setPrintOrder(detail)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-stone-200 px-3 text-sm font-semibold text-stone-700 hover:bg-stone-50"><Printer className="size-4" />{t('printPackingSlip')}</button>}</div><h3 className="mt-6 font-bold">{t('items')}</h3><div className="mt-2 divide-y divide-stone-100">{detail.items.map((item) => <div key={item.id} className="flex justify-between gap-3 py-3"><div><p className="font-semibold">{item.product_name}{returnedQuantity(detail.id, item.variant_id) > 0 && <span className="ms-2 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">{t('ordersReturnedItems')} ×{returnedQuantity(detail.id, item.variant_id)}</span>}</p><p className="text-xs text-stone-500">{item.variant_sku} · {formatVariantLabel(detail.variantMeta[item.variant_id ?? '']?.color, detail.variantMeta[item.variant_id ?? '']?.size, t, ' / ')}</p><p className="text-xs">{t('quantity')}: {item.quantity} × {formatCurrency(Number(item.unit_sell_price))}</p></div><b className="tabular-nums">{formatCurrency(Number(item.line_total_egp))}</b></div>)}</div><div className="mt-4 space-y-2 border-t pt-4 text-sm"><p className="flex justify-between"><span>{t('shippingFee')}</span><b>{formatCurrency(Number(detail.shipping_fee_egp))}</b></p><p className="flex justify-between"><span>{t('codFee')}</span><b>{formatCurrency(Number(detail.cod_fee_egp))}</b></p><p className="flex justify-between"><span>{t('ordersRefundedAmount')}</span><b className="text-rose-700">− {formatCurrency(returnSummary(detail).refunded)}</b></p><p className="flex justify-between text-base font-black"><span>{t('ordersNetTotal')}</span><b>{formatCurrency(returnSummary(detail).netTotal)}</b></p></div><div className="mt-6"><label className="block text-sm font-semibold">{t('updateStatus')}<select value={detail.status} onChange={(e) => void changeStatus(detail, e.target.value)} className="mt-2 h-11 w-full rounded-lg border px-3">{statuses.filter((value) => value === detail.status || (detail.status === 'pending' && ['confirmed', 'processing', 'shipped', 'delivered'].includes(value)) || (detail.status === 'confirmed' && ['processing', 'shipped', 'delivered'].includes(value)) || (detail.status === 'processing' && ['shipped', 'delivered'].includes(value)) || (detail.status === 'shipped' && value === 'delivered')).map((value) => <option key={value} value={value}>{statusLabel(value)}</option>)}</select></label>{!['cancelled', 'returned'].includes(detail.status) && <button onClick={() => void cancelOrder(detail)} className="mt-4 w-full rounded-lg border border-red-200 bg-red-50 px-4 py-3 font-bold text-red-700">{t('cancelOrder')}</button>}</div><Link to="/admin/orders" className="sr-only">{t('orders')}</Link></aside></div>}
    {printOrder && <div id="shipping-slip-print" dir={dir} className="rounded-lg bg-white p-5 text-stone-900"><header className="border-b border-dashed border-stone-400 pb-3 text-center"><p className="text-xl font-black">Different Store</p><h1 className="mt-1 text-sm font-bold">{t('packingSlipTitle')}</h1></header><div className="space-y-2 border-b border-dashed border-stone-400 py-3 text-sm"><p className="flex justify-between gap-2"><span>{t('orderNumber')}</span><b dir="ltr">#{printOrder.order_number}</b></p><p className="flex justify-between gap-2"><span>{t('customer')}</span><b>{printOrder.customer_name}</b></p><p className="flex justify-between gap-2"><span>{t('phone')}</span><b dir="ltr">{printOrder.customer_phone}</b></p><p><b>{t('governorate')}:</b> {localizedZoneName(printOrder.zoneName)}</p><p><b>{t('address')}:</b> {printOrder.shipping_address || '—'}</p></div><div className="space-y-2 border-b border-dashed border-stone-400 py-3 text-sm">{printOrder.items.map((item) => <div key={item.id} className="flex justify-between gap-2"><span>{item.product_name} · {item.variant_sku} · {formatVariantLabel(printOrder.variantMeta[item.variant_id ?? '']?.color, printOrder.variantMeta[item.variant_id ?? '']?.size, t)} × {item.quantity}</span><span>{item.quantity}</span></div>)}</div><p className="flex justify-between gap-2 pt-3 text-base font-black"><span>{t('packingSlipCod')}</span><span>{formatCurrency(printOrder.payment_method === 'cod' ? Number(printOrder.total_egp) : 0)}</span></p></div>}
  </section>;
}
