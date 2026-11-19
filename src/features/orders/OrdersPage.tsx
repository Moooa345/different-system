import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Eye, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import type { Order, OrderItem, OrderStatus, ProductVariant, ShippingZone } from '../../lib/types';
import { supabase } from '../../lib/supabase';
import { useTranslation } from '../../i18n/useTranslation';
import { formatVariantLabel } from '../../utils/formatVariantLabel';

type OrderRow = Order & { items: OrderItem[]; zoneName: string; variantMeta: Record<string, Pick<ProductVariant, 'color' | 'size'>> };
const statuses: OrderStatus[] = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'];
const statusKey: Record<OrderStatus, 'statusPending' | 'statusConfirmed' | 'statusProcessing' | 'statusShipped' | 'statusDelivered' | 'statusCancelled' | 'statusReturned'> = {
  pending: 'statusPending', confirmed: 'statusConfirmed', processing: 'statusProcessing', shipped: 'statusShipped', delivered: 'statusDelivered', cancelled: 'statusCancelled', returned: 'statusReturned',
};

export function OrdersPage() {
  const { t, dir, lang, formatCurrency } = useTranslation();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [zones, setZones] = useState<ShippingZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('all');
  const [status, setStatus] = useState('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [detail, setDetail] = useState<OrderRow | null>(null);
  const [tab, setTab] = useState<'orders' | 'zones'>('orders');
  const [zoneDraft, setZoneDraft] = useState<Partial<ShippingZone> | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    const [{ data: rows, error }, { data: zoneRows }, { data: itemRows }] = await Promise.all([
      supabase.from('orders').select('*').order('created_at', { ascending: false }),
      supabase.from('shipping_zones').select('*'),
      supabase.from('order_items').select('*'),
    ]);
    if (error) { toast.error(t('ordersLoadError')); setLoading(false); return; }
    const variants = itemRows?.length ? await supabase.from('product_variants').select('id,color,size').in('id', [...new Set(itemRows.map((item) => item.variant_id))]) : { data: [] };
    const zonesList = zoneRows ?? [];
    const zoneMap = new Map(zonesList.map((zone) => [zone.id, zone.name]));
    const variantMap = Object.fromEntries((variants.data ?? []).map((variant) => [variant.id, { color: variant.color, size: variant.size }]));
    setZones(zonesList);
    setOrders((rows ?? []).map((order) => ({ ...order, items: (itemRows ?? []).filter((item) => item.order_id === order.id), zoneName: zoneMap.get(order.shipping_zone_id ?? '') ?? '', variantMeta: variantMap })));
    setLoading(false);
  }, [lang]);

  useEffect(() => { void loadOrders(); }, [loadOrders]);

  const filtered = useMemo(() => orders.filter((order) => {
    if (source !== 'all' && order.channel !== source) return false;
    if (status !== 'all' && order.status !== status) return false;
    const needle = query.trim().toLocaleLowerCase(lang);
    return !needle || [String(order.order_number), order.customer_name, order.customer_phone].some((value) => value.toLocaleLowerCase(lang).includes(needle));
  }), [orders, source, status, query, lang]);

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
      [t('courierItems')]: order.items.map((item) => `${item.product_name} (${formatVariantLabel(order.variantMeta[item.variant_id]?.color, order.variantMeta[item.variant_id]?.size, t, '/')}) x${item.quantity}`).join('، '),
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
  const localizedZoneName = (name: string) => {
    const keys = { 'القاهرة': 'zoneCairo', 'الجيزة': 'zoneGiza', 'الإسكندرية': 'zoneAlexandria', 'الدلتا والقناة': 'zoneDelta', 'صعيد مصر': 'zoneUpperEgypt' } as const;
    const key = keys[name as keyof typeof keys];
    return key ? t(key) : name;
  };
  const paymentLabel = (method: string) => method === 'cod' ? t('storeCod') : method === 'instapay' ? t('storeInstaPay') : t('posCash');
  return <section dir={dir} className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-black">{t('ordersTitle')}</h1><p className="mt-1 text-sm text-stone-500">{t('ordersSubtitle')}</p></div><div className="flex gap-2"><button onClick={() => setTab(tab === 'orders' ? 'zones' : 'orders')} className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold">{t('shippingZones')}</button>{tab === 'orders' && <button onClick={exportShipping} className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2 text-sm font-bold text-white"><Download className="size-4" />{t('exportShipping')}</button>}</div></div>
    {tab === 'orders' ? <>
      <div className="grid gap-3 rounded-2xl border border-stone-200 bg-white p-4 md:grid-cols-[1fr_auto_auto]"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('orderSearch')} className="h-11 rounded-xl border border-stone-300 px-3 text-start text-sm" /><select value={source} onChange={(e) => setSource(e.target.value)} className="h-11 rounded-xl border border-stone-300 px-3 text-start text-sm"><option value="all">{t('sourceAll')}</option><option value="storefront">{t('sourceOnline')}</option><option value="pos">{t('sourcePos')}</option></select><select value={status} onChange={(e) => setStatus(e.target.value)} className="h-11 rounded-xl border border-stone-300 px-3 text-start text-sm"><option value="all">{t('statusAll')}</option>{statuses.map((value) => <option key={value} value={value}>{statusLabel(value)}</option>)}</select></div>
      <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white"><table className="w-full min-w-[800px] text-start text-sm"><thead className="bg-stone-50 text-xs text-stone-500"><tr><th className="p-3"><input type="checkbox" checked={filtered.length > 0 && filtered.every((o) => selected.includes(o.id))} onChange={(e) => setSelected(e.target.checked ? [...new Set([...selected, ...filtered.map((o) => o.id)])] : selected.filter((id) => !filtered.some((o) => o.id === id)))} aria-label={t('selectedOrders')} /></th><th className="p-3">{t('orderNumber')}</th><th className="p-3">{t('customer')}</th><th className="p-3">{t('source')}</th><th className="p-3">{t('status')}</th><th className="p-3">{t('date')}</th><th className="p-3">{t('total')}</th><th className="p-3"></th></tr></thead><tbody className="divide-y divide-stone-100">{filtered.map((order) => <tr key={order.id} className="hover:bg-stone-50"><td className="p-3"><input type="checkbox" checked={selected.includes(order.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, order.id] : selected.filter((id) => id !== order.id))} aria-label={`${t('orderNumber')} ${order.order_number}`} /></td><td className="p-3 font-bold">#{order.order_number}</td><td className="p-3"><div className="font-semibold">{order.customer_name}</div><div dir="ltr" className="text-xs text-stone-500">{order.customer_phone}</div></td><td className="p-3">{t(order.channel === 'pos' ? 'sourcePos' : 'sourceOnline')}</td><td className="p-3"><span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold">{statusLabel(order.status)}</span></td><td className="p-3 text-xs">{new Intl.DateTimeFormat(lang, { dateStyle: 'medium' }).format(new Date(order.created_at))}</td><td className="p-3 font-semibold">{formatCurrency(Number(order.total_egp))}</td><td className="p-3"><button onClick={() => setDetail(order)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-rose-700 hover:bg-rose-50"><Eye className="size-4" />{t('details')}</button></td></tr>)}</tbody></table>{!loading && !filtered.length && <div className="p-10 text-center text-sm text-stone-500">{t('noOrders')}</div>}{loading && <div className="p-8 text-center text-sm text-stone-500">{t('loadingInventory')}</div>}</div>
    </> : <div className="space-y-4 rounded-2xl border border-stone-200 bg-white p-4"><div className="flex justify-between"><h2 className="text-lg font-bold">{t('shippingZones')}</h2><button onClick={() => setZoneDraft({ fee_egp: 0, cod_fee_egp: 0, is_active: true })} className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-3 py-2 text-sm font-bold text-white"><Plus className="size-4" />{t('addZone')}</button></div><div className="divide-y divide-stone-100">{zones.map((zone) => <div key={zone.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-semibold">{zone.name}</p><p className="text-xs text-stone-500">{t('shippingFee')}: {formatCurrency(Number(zone.fee_egp))} · {t('codFee')}: {formatCurrency(Number(zone.cod_fee_egp))}</p></div><div className="flex gap-2"><button onClick={() => void supabase.from('shipping_zones').update({ is_active: !zone.is_active }).eq('id', zone.id).then(({ error }) => error ? toast.error(t('zoneSaveError')) : void loadOrders())} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${zone.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-100 text-stone-500'}`}>{zone.is_active ? t('active') : t('inactive')}</button><button onClick={() => setZoneDraft(zone)} className="rounded-lg border px-3 py-1.5 text-xs font-bold">{t('edit')}</button></div></div>)}</div></div>}
    {zoneDraft && <div className="fixed inset-0 z-[60] grid place-items-center bg-stone-950/40 p-4"><form onSubmit={(e) => void saveZone(e)} className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6"><div className="flex justify-between"><h2 className="text-lg font-bold">{zoneDraft.id ? t('edit') : t('addZone')}</h2><button type="button" onClick={() => setZoneDraft(null)}><X className="size-5" /></button></div><label className="block text-start text-sm">{t('zoneName')}<input required value={zoneDraft.name ?? ''} onChange={(e) => setZoneDraft({ ...zoneDraft, name: e.target.value })} placeholder={t('zoneNamePlaceholder')} className="mt-1 w-full rounded-lg border px-3 py-2" /></label><div className="grid grid-cols-2 gap-3"><label className="text-start text-sm">{t('shippingFee')}<input required min="0" step="0.01" type="number" value={zoneDraft.fee_egp ?? 0} onChange={(e) => setZoneDraft({ ...zoneDraft, fee_egp: Number(e.target.value) })} className="mt-1 w-full rounded-lg border px-3 py-2" /></label><label className="text-start text-sm">{t('codFee')}<input required min="0" step="0.01" type="number" value={zoneDraft.cod_fee_egp ?? 0} onChange={(e) => setZoneDraft({ ...zoneDraft, cod_fee_egp: Number(e.target.value) })} className="mt-1 w-full rounded-lg border px-3 py-2" /></label></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={zoneDraft.is_active ?? true} onChange={(e) => setZoneDraft({ ...zoneDraft, is_active: e.target.checked })} />{t('zoneActive')}</label><button className="w-full rounded-xl bg-rose-700 px-4 py-3 font-bold text-white">{t('save')}</button></form></div>}
    {detail && <div className="fixed inset-0 z-50 flex justify-end bg-stone-950/40" onClick={() => setDetail(null)}><aside dir={dir} onClick={(e) => e.stopPropagation()} className="h-full w-full max-w-xl overflow-y-auto bg-white p-5 shadow-2xl sm:p-7"><div className="flex items-start justify-between"><div><h2 className="text-xl font-black">{t('orderDetails')} · #{detail.order_number}</h2><p className="mt-1 text-sm text-stone-500">{statusLabel(detail.status)}</p></div><button onClick={() => setDetail(null)}><X /></button></div><section className="mt-6 rounded-xl bg-stone-50 p-4"><h3 className="font-bold">{t('customerDetails')}</h3><p className="mt-2">{detail.customer_name} · <span dir="ltr">{detail.customer_phone}</span></p><p className="mt-1 text-sm text-stone-600">{detail.shipping_address || '—'}</p><p className="text-sm text-stone-600">{localizedZoneName(detail.zoneName)}</p>{detail.notes && <p className="mt-2 text-sm">{t('notes')}: {detail.notes}</p>}<p className="mt-2 text-sm">{t('paymentMethod')}: {paymentLabel(detail.payment_method)}</p></section><h3 className="mt-6 font-bold">{t('items')}</h3><div className="mt-2 divide-y divide-stone-100">{detail.items.map((item) => <div key={item.id} className="flex justify-between gap-3 py-3"><div><p className="font-semibold">{item.product_name}</p><p className="text-xs text-stone-500">{item.variant_sku} · {formatVariantLabel(detail.variantMeta[item.variant_id]?.color, detail.variantMeta[item.variant_id]?.size, t, ' / ')}</p><p className="text-xs">{t('quantity')}: {item.quantity} × {formatCurrency(Number(item.unit_sell_price))}</p></div><b>{formatCurrency(Number(item.line_total_egp))}</b></div>)}</div><div className="mt-4 space-y-2 border-t pt-4 text-sm"><p className="flex justify-between"><span>{t('shippingFee')}</span><b>{formatCurrency(Number(detail.shipping_fee_egp))}</b></p><p className="flex justify-between"><span>{t('codFee')}</span><b>{formatCurrency(Number(detail.cod_fee_egp))}</b></p><p className="flex justify-between text-base font-black"><span>{t('grandTotal')}</span><b>{formatCurrency(Number(detail.total_egp))}</b></p></div><div className="mt-6"><label className="block text-sm font-semibold">{t('updateStatus')}<select value={detail.status} onChange={(e) => void changeStatus(detail, e.target.value)} className="mt-2 h-11 w-full rounded-lg border px-3">{statuses.filter((value) => value === detail.status || (detail.status === 'pending' && ['confirmed', 'processing', 'shipped', 'delivered'].includes(value)) || (detail.status === 'confirmed' && ['processing', 'shipped', 'delivered'].includes(value)) || (detail.status === 'processing' && ['shipped', 'delivered'].includes(value)) || (detail.status === 'shipped' && value === 'delivered')).map((value) => <option key={value} value={value}>{statusLabel(value)}</option>)}</select></label>{!['cancelled', 'returned'].includes(detail.status) && <button onClick={() => void cancelOrder(detail)} className="mt-4 w-full rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-bold text-red-700">{t('cancelOrder')}</button>}</div><Link to="/admin/orders" className="sr-only">{t('orders')}</Link></aside></div>}
  </section>;
}
