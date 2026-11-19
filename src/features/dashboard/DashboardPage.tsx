import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Boxes, Coins, ShoppingBag } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import type { Order, OrderItem } from '../../lib/types';
import { supabase } from '../../lib/supabase';
import { useTranslation } from '../../i18n/useTranslation';

type Range = 'today' | '7days' | '30days' | 'all';
type SummaryProduct = { name: string; units: number; revenue: number };

export function DashboardPage() {
  const { t, dir, lang, formatCurrency } = useTranslation();
  const [range, setRange] = useState<Range>('7days');
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [lowStock, setLowStock] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const since = new Date();
    if (range === 'today') since.setHours(0, 0, 0, 0);
    if (range === '7days') since.setDate(since.getDate() - 7);
    if (range === '30days') since.setDate(since.getDate() - 30);
    let orderQuery = supabase.from('orders').select('*').neq('status', 'cancelled').order('created_at', { ascending: false });
    if (range !== 'all') orderQuery = orderQuery.gte('created_at', since.toISOString());
    const [{ data: orderRows, error }, { data: variants }] = await Promise.all([
      orderQuery,
      supabase.from('product_variants').select('id, product_id, stock_qty').lt('stock_qty', 3),
    ]);
    if (error) { toast.error(t('ordersLoadError')); setLoading(false); return; }
    const list = orderRows ?? [];
    const orderItems = list.length ? await supabase.from('order_items').select('*').in('order_id', list.map((order) => order.id)) : { data: [] };
    setOrders(list);
    setItems(orderItems.data ?? []);
    setLowStock(variants?.length ?? 0);
    setLoading(false);
  }, [range, lang]);

  useEffect(() => { void load(); }, [load]);

  const analytics = useMemo(() => {
    const revenue = orders.reduce((sum, order) => sum + Number(order.total_egp), 0);
    const profit = items.reduce((sum, item) => sum + (Number(item.unit_sell_price) - Number(item.unit_cost_price)) * item.quantity, 0);
    const sourceRevenue = { pos: 0, storefront: 0 };
    const sourceOrders = { pos: 0, storefront: 0 };
    for (const order of orders) { sourceRevenue[order.channel] += Number(order.total_egp); sourceOrders[order.channel] += 1; }
    const statuses: Record<string, number> = {};
    for (const order of orders) statuses[order.status] = (statuses[order.status] ?? 0) + 1;
    const productAgg = new Map<string, SummaryProduct>();
    for (const item of items) {
      const current = productAgg.get(item.product_name) ?? { name: item.product_name, units: 0, revenue: 0 };
      current.units += item.quantity; current.revenue += Number(item.line_total_egp); productAgg.set(item.product_name, current);
    }
    const topProducts = [...productAgg.values()].sort((a, b) => b.units - a.units).slice(0, 5);
    return { revenue, profit, sourceRevenue, sourceOrders, statuses, topProducts };
  }, [orders, items]);

  const maxSourceRevenue = Math.max(analytics.sourceRevenue.pos, analytics.sourceRevenue.storefront, 1);
  const statusNames: Record<string, string> = { pending: 'statusPending', confirmed: 'statusConfirmed', processing: 'statusProcessing', shipped: 'statusShipped', delivered: 'statusDelivered', cancelled: 'statusCancelled', returned: 'statusReturned' };
  const rangeOptions: { id: Range; key: 'dateToday' | 'date7Days' | 'date30Days' | 'dateAll' }[] = [
    { id: 'today', key: 'dateToday' }, { id: '7days', key: 'date7Days' }, { id: '30days', key: 'date30Days' }, { id: 'all', key: 'dateAll' },
  ];
  const cards = [
    { label: t('revenue'), value: formatCurrency(analytics.revenue), icon: Coins, tone: 'bg-emerald-50 text-emerald-700' },
    { label: t('estimatedProfit'), value: formatCurrency(analytics.profit), icon: ArrowUpRight, tone: 'bg-rose-50 text-rose-700' },
    { label: t('totalOrders'), value: new Intl.NumberFormat(lang).format(orders.length), sub: `${t('sourceOnline')}: ${analytics.sourceOrders.storefront} · ${t('sourcePos')}: ${analytics.sourceOrders.pos}`, icon: ShoppingBag, tone: 'bg-sky-50 text-sky-700' },
    { label: t('lowStockAlerts'), value: new Intl.NumberFormat(lang).format(lowStock), icon: Boxes, tone: 'bg-amber-50 text-amber-700', link: '/admin/inventory' },
  ];

  return <section dir={dir} className="space-y-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-black">{t('dashboardTitle')}</h1><p className="mt-1 text-sm text-stone-500">{t('dashboard')}</p></div><div className="flex flex-wrap gap-2">{rangeOptions.map((option) => <button key={option.id} onClick={() => setRange(option.id)} className={`rounded-xl px-3 py-2 text-sm font-semibold ${range === option.id ? 'bg-stone-900 text-white' : 'border border-stone-200 bg-white text-stone-600'}`}>{t(option.key)}</button>)}</div></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(({ label, value, sub, icon: Icon, tone, link }) => <Link key={label} to={link ?? '#'} onClick={link ? undefined : (e) => e.preventDefault()} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><span className="text-sm font-semibold text-stone-500">{label}</span><span className={`grid size-10 place-items-center rounded-xl ${tone}`}><Icon className="size-5" /></span></div><p className="mt-4 text-2xl font-black text-stone-900">{value}</p>{sub && <p className="mt-1 text-xs text-stone-500">{sub}</p>}</Link>)}</div>
    {loading ? <div className="rounded-2xl border bg-white p-10 text-center text-stone-500">{t('loadingInventory')}</div> : orders.length === 0 ? <div className="rounded-2xl border border-dashed bg-white p-10 text-center text-stone-500">{t('noAnalytics')}</div> : <div className="grid gap-5 xl:grid-cols-2">
      <section className="rounded-2xl border border-stone-200 bg-white p-5"><h2 className="font-bold">{t('revenueBySource')}</h2><div className="mt-5 space-y-5">{(['storefront', 'pos'] as const).map((sourceName) => <div key={sourceName}><div className="mb-2 flex justify-between text-sm"><span>{t(sourceName === 'pos' ? 'sourcePos' : 'sourceOnline')}</span><b>{formatCurrency(analytics.sourceRevenue[sourceName])}</b></div><div className="h-3 overflow-hidden rounded-full bg-stone-100"><div className={`h-full rounded-full ${sourceName === 'pos' ? 'bg-sky-500' : 'bg-rose-500'}`} style={{ width: `${analytics.sourceRevenue[sourceName] / maxSourceRevenue * 100}%` }} /></div><p className="mt-1 text-xs text-stone-400">{new Intl.NumberFormat(lang).format(analytics.sourceOrders[sourceName])} {t('totalOrders')}</p></div>)}</div><h3 className="mt-6 text-sm font-bold">{t('ordersByStatus')}</h3><div className="mt-3 flex flex-wrap gap-2">{Object.entries(analytics.statuses).map(([key, count]) => <span key={key} className="rounded-full bg-stone-100 px-3 py-1.5 text-xs">{t((statusNames[key] ?? 'statusPending') as 'statusPending')} · {count}</span>)}</div></section>
      <section className="rounded-2xl border border-stone-200 bg-white p-5"><h2 className="font-bold">{t('topProducts')}</h2>{analytics.topProducts.length ? <div className="mt-3 overflow-x-auto"><table className="w-full text-start text-sm"><thead className="text-xs text-stone-400"><tr><th className="py-2">{t('item')}</th><th className="py-2">{t('unitsSold')}</th><th className="py-2">{t('revenue')}</th></tr></thead><tbody className="divide-y">{analytics.topProducts.map((product) => <tr key={product.name}><td className="py-3 font-semibold">{product.name}</td><td className="py-3">{product.units}</td><td className="py-3">{formatCurrency(product.revenue)}</td></tr>)}</tbody></table></div> : <p className="py-8 text-center text-sm text-stone-500">{t('noAnalytics')}</p>}</section>
      <section className="rounded-2xl border border-stone-200 bg-white p-5 xl:col-span-2"><div className="flex items-center justify-between"><h2 className="font-bold">{t('recentOrders')}</h2><Link to="/admin/orders" className="text-sm font-bold text-rose-700">{t('viewOrders')}</Link></div><div className="mt-3 divide-y">{orders.slice(0, 6).map((order) => <div key={order.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><span className="font-bold">#{order.order_number} · {order.customer_name}</span><span className="text-stone-500">{new Intl.DateTimeFormat(lang, { dateStyle: 'medium' }).format(new Date(order.created_at))}</span><span>{formatCurrency(Number(order.total_egp))}</span><span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs">{t((statusNames[order.status] ?? 'statusPending') as 'statusPending')}</span></div>)}</div></section>
    </div>}
  </section>;
}
