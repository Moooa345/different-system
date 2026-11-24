import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Boxes, Coins, ShoppingBag, Clock3, CalendarDays, AlertTriangle } from 'lucide-react';
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
  const [returnTotal, setReturnTotal] = useState(0);
  const [expenseTotal, setExpenseTotal] = useState(0);
  const [lowStock, setLowStock] = useState(0);
  const [outOfStock, setOutOfStock] = useState(0);
  const [todayOrders, setTodayOrders] = useState<Array<{ channel: Order['channel']; created_at: string }>>([]);
  const [pendingOnlineCount, setPendingOnlineCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const since = new Date();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    if (range === 'today') since.setHours(0, 0, 0, 0);
    if (range === '7days') since.setDate(since.getDate() - 7);
    if (range === '30days') since.setDate(since.getDate() - 30);
    let orderQuery = supabase.from('orders').select('*').neq('status', 'cancelled').order('created_at', { ascending: false });
    if (range !== 'all') orderQuery = orderQuery.gte('created_at', since.toISOString());
    const returnedOrderQuery = supabase.from('orders').select('id,total_egp').eq('status', 'returned').order('updated_at', { ascending: false });
    if (range !== 'all') returnedOrderQuery.gte('updated_at', since.toISOString());
    let returnsQuery = supabase.from('product_returns').select('refund_amount,order_id,created_at').order('created_at', { ascending: false });
    let expensesQuery = supabase.from('expenses').select('amount,expense_date').order('expense_date', { ascending: false });
    if (range !== 'all') {
      returnsQuery = returnsQuery.gte('created_at', since.toISOString());
      expensesQuery = expensesQuery.gte('expense_date', since.toISOString().slice(0, 10));
    }
    const [{ data: orderRows, error }, { data: variants }, { data: outVariants }, { data: todayRows }, { data: pendingRows }, { data: returnRows }, { data: returnedOrderRows }, { data: expenseRows }] = await Promise.all([
      orderQuery,
      supabase.from('product_variants').select('id').eq('is_active', true).gte('stock_qty', 1).lte('stock_qty', 3),
      supabase.from('product_variants').select('id').eq('is_active', true).eq('stock_qty', 0),
      supabase.from('orders').select('channel, created_at').gte('created_at', todayStart.toISOString()),
      supabase.from('orders').select('id').eq('channel', 'storefront').eq('status', 'pending'),
      returnsQuery,
      returnedOrderQuery,
      expensesQuery,
    ]);
    if (error) { toast.error(t('ordersLoadError')); setLoading(false); return; }
    const list = orderRows ?? [];
    const orderItems = list.length ? await supabase.from('order_items').select('*').in('order_id', list.map((order) => order.id)) : { data: [] };
    setOrders(list);
    setItems(orderItems.data ?? []);
    setLowStock(variants?.length ?? 0);
    setOutOfStock(outVariants?.length ?? 0);
    setTodayOrders(todayRows ?? []);
    setPendingOnlineCount(pendingRows?.length ?? 0);
    const linkedOrderIds = new Set((returnRows ?? []).map((row) => row.order_id).filter((id): id is string => Boolean(id)));
    const legacyReturnedRefunds = (returnedOrderRows ?? []).filter((row) => !linkedOrderIds.has(row.id)).reduce((sum, row) => sum + Number(row.total_egp), 0);
    setReturnTotal((returnRows ?? []).reduce((sum, row) => sum + Number(row.refund_amount), 0) + legacyReturnedRefunds);
    setExpenseTotal((expenseRows ?? []).reduce((sum, row) => sum + Number(row.amount), 0));
    setLoading(false);
  }, [range, lang]);

  useEffect(() => { void load(); }, [load]);

  const analytics = useMemo(() => {
    const revenue = orders.reduce((sum, order) => sum + Number(order.total_egp), 0);
    const grossProfit = items.reduce((sum, item) => sum + (Number(item.unit_sell_price) - Number(item.unit_cost_price)) * item.quantity, 0)
      - orders.reduce((sum, order) => sum + Number(order.discount_amount ?? 0), 0);
    const profit = grossProfit - returnTotal - expenseTotal;
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
    return { revenue, grossProfit, profit, sourceRevenue, sourceOrders, statuses, topProducts };
  }, [orders, items, returnTotal, expenseTotal]);

  const maxSourceRevenue = Math.max(analytics.sourceRevenue.pos, analytics.sourceRevenue.storefront, 1);
  const localTodayStart = new Date(); localTodayStart.setHours(0, 0, 0, 0);
  const todayRevenue = orders.filter((order) => new Date(order.created_at) >= localTodayStart).reduce((sum, order) => sum + Number(order.total_egp), 0);
  const todayOnlineCount = todayOrders.filter((order) => order.channel === 'storefront').length;
  const todayPosCount = todayOrders.filter((order) => order.channel === 'pos').length;
  const statusNames: Record<string, string> = { pending: 'statusPending', confirmed: 'statusConfirmed', processing: 'statusProcessing', shipped: 'statusShipped', delivered: 'statusDelivered', cancelled: 'statusCancelled', returned: 'statusReturned' };
  const statusTone = (status: string) => status === 'pending' ? 'bg-amber-50 text-amber-800' : ['confirmed', 'processing'].includes(status) ? 'bg-sky-50 text-sky-700' : status === 'shipped' ? 'bg-indigo-50 text-indigo-700' : status === 'delivered' ? 'bg-emerald-50 text-emerald-700' : ['cancelled', 'returned'].includes(status) ? 'bg-red-50 text-red-700' : 'bg-stone-100 text-stone-600';
  const rangeOptions: { id: Range; key: 'dateToday' | 'date7Days' | 'date30Days' | 'dateAll' }[] = [
    { id: 'today', key: 'dateToday' }, { id: '7days', key: 'date7Days' }, { id: '30days', key: 'date30Days' }, { id: 'all', key: 'dateAll' },
  ];
  const cards = [
    { label: t('revenue'), value: formatCurrency(analytics.revenue), icon: Coins, tone: 'bg-emerald-50 text-emerald-700' },
    { label: t('estimatedProfit'), value: formatCurrency(analytics.profit), icon: ArrowUpRight, tone: 'bg-rose-50 text-rose-700' },
    { label: t('totalOrders'), value: new Intl.NumberFormat(lang).format(orders.length), sub: `${t('sourceOnline')}: ${analytics.sourceOrders.storefront} · ${t('sourcePos')}: ${analytics.sourceOrders.pos}`, icon: ShoppingBag, tone: 'bg-sky-50 text-sky-700' },
    { label: t('lowStockAlerts'), value: new Intl.NumberFormat(lang).format(lowStock), icon: Boxes, tone: 'bg-amber-50 text-amber-700', link: '/admin/inventory?stock=low' },
  ];
  const operationsCards = [
    { label: t('opsTodayRevenue'), value: formatCurrency(todayRevenue), icon: Coins, tone: 'bg-emerald-50 text-emerald-700' },
    { label: t('opsOrdersToday'), value: new Intl.NumberFormat(lang).format(todayOrders.length), sub: `${t('opsOnlineBreakdown')}: ${new Intl.NumberFormat(lang).format(todayOnlineCount)} · ${t('opsPosBreakdown')}: ${new Intl.NumberFormat(lang).format(todayPosCount)}`, icon: CalendarDays, tone: 'bg-sky-50 text-sky-700' },
    { label: t('opsPendingOnline'), value: new Intl.NumberFormat(lang).format(pendingOnlineCount), icon: Clock3, tone: pendingOnlineCount > 0 ? 'bg-amber-50 text-amber-800' : 'bg-stone-100 text-stone-600', link: '/admin/orders?status=pending&source=storefront' },
    { label: t('opsOutOfStock'), value: new Intl.NumberFormat(lang).format(outOfStock), icon: AlertTriangle, tone: outOfStock > 0 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700', link: '/admin/inventory?stock=out' },
  ];

  return <section dir={dir} className="space-y-6 tabular-nums"><div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-black">{t('dashboardTitle')}</h1><p className="mt-1 text-sm text-stone-500">{t('dashboard')}</p></div><div className="flex flex-wrap gap-2">{rangeOptions.map((option) => <button key={option.id} onClick={() => setRange(option.id)} className={`min-h-11 rounded-lg px-3 py-2 text-sm font-semibold ${range === option.id ? 'bg-stone-900 text-white' : 'border border-stone-200 bg-white text-stone-600'}`}>{t(option.key)}</button>)}</div></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{operationsCards.map(({ label, value, sub, icon: Icon, tone, link }) => <Link key={label} to={link ?? '/admin/dashboard'} className="group cursor-pointer rounded-lg border border-stone-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-[#C8A86A] hover:shadow-md"><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-stone-500">{label}</span><span className={`grid size-9 place-items-center rounded-md ${tone}`}><Icon className="size-4" /></span></div><div className="mt-3 flex items-center justify-between"><p className="text-xl font-black text-stone-900">{value}</p>{link?.includes('inventory') && <ArrowUpRight className="size-4 text-stone-400 transition group-hover:text-[#9A7A3D]" />}</div>{sub && <p className="mt-1 text-[11px] text-stone-500">{sub}</p>}</Link>)}</div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(({ label, value, sub, icon: Icon, tone, link }) => <Link key={label} to={link ?? '#'} onClick={link ? undefined : (e) => e.preventDefault()} className={`rounded-2xl border border-stone-200 bg-white p-5 shadow-sm ${link ? 'group cursor-pointer transition hover:-translate-y-0.5 hover:border-[#C8A86A] hover:shadow-md' : ''}`}><div className="flex items-center justify-between"><span className="text-sm font-semibold text-stone-500">{label}</span><span className={`grid size-10 place-items-center rounded-xl ${tone}`}><Icon className="size-5" /></span></div><div className="mt-4 flex items-center justify-between"><p className="text-2xl font-black text-stone-900">{value}</p>{link && <ArrowUpRight className="size-4 text-stone-400 transition group-hover:text-[#9A7A3D]" />}</div>{sub && <p className="mt-1 text-xs text-stone-500">{sub}</p>}</Link>)}</div>
    <section className="grid gap-3 rounded-lg border border-stone-200 bg-white p-4 sm:grid-cols-4"><div><p className="text-xs text-stone-500">{t('profitGross')}</p><p className="mt-1 font-bold tabular-nums text-stone-900">{formatCurrency(analytics.grossProfit)}</p></div><div><p className="text-xs text-stone-500">{t('profitReturns')}</p><p className="mt-1 font-bold tabular-nums text-amber-800">− {formatCurrency(returnTotal)}</p></div><div><p className="text-xs text-stone-500">{t('profitExpenses')}</p><p className="mt-1 font-bold tabular-nums text-red-700">− {formatCurrency(expenseTotal)}</p></div><div><p className="text-xs font-semibold text-stone-600">{t('profitNet')}</p><p className="mt-1 text-lg font-black tabular-nums text-[#9A7A3D]">{formatCurrency(analytics.profit)}</p></div></section>
    {loading ? <div className="rounded-2xl border bg-white p-10 text-center text-stone-500">{t('loadingInventory')}</div> : orders.length === 0 ? <div className="rounded-2xl border border-dashed bg-white p-10 text-center text-stone-500">{t('noAnalytics')}</div> : <div className="grid gap-5 xl:grid-cols-2">
      <section className="rounded-2xl border border-stone-200 bg-white p-5"><h2 className="font-bold">{t('revenueBySource')}</h2><div className="mt-5 space-y-5">{(['storefront', 'pos'] as const).map((sourceName) => <div key={sourceName}><div className="mb-2 flex justify-between text-sm"><span>{t(sourceName === 'pos' ? 'sourcePos' : 'sourceOnline')}</span><b className="tabular-nums">{formatCurrency(analytics.sourceRevenue[sourceName])}</b></div><div className="h-3 overflow-hidden rounded-full bg-stone-100"><div className={`h-full rounded-full ${sourceName === 'pos' ? 'bg-sky-500' : 'bg-rose-500'}`} style={{ width: `${analytics.sourceRevenue[sourceName] / maxSourceRevenue * 100}%` }} /></div><p className="mt-1 text-xs text-stone-400">{new Intl.NumberFormat(lang).format(analytics.sourceOrders[sourceName])} {t('totalOrders')}</p></div>)}</div><h3 className="mt-6 text-sm font-bold">{t('ordersByStatus')}</h3><div className="mt-3 flex flex-wrap gap-2">{Object.entries(analytics.statuses).map(([key, count]) => <span key={key} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${statusTone(key)}`}>{t((statusNames[key] ?? 'statusPending') as 'statusPending')} · {new Intl.NumberFormat(lang).format(count)}</span>)}</div></section>
      <section className="rounded-2xl border border-stone-200 bg-white p-5"><h2 className="font-bold">{t('topProducts')}</h2>{analytics.topProducts.length ? <div className="mt-3 overflow-x-auto"><table className="w-full text-start text-sm"><thead className="text-xs text-stone-400"><tr><th className="py-2">{t('item')}</th><th className="py-2">{t('unitsSold')}</th><th className="py-2">{t('revenue')}</th></tr></thead><tbody className="divide-y">{analytics.topProducts.map((product) => <tr key={product.name}><td className="py-3 font-semibold">{product.name}</td><td className="py-3">{product.units}</td><td className="py-3">{formatCurrency(product.revenue)}</td></tr>)}</tbody></table></div> : <p className="py-8 text-center text-sm text-stone-500">{t('noAnalytics')}</p>}</section>
      <section className="rounded-2xl border border-stone-200 bg-white p-5 xl:col-span-2"><div className="flex items-center justify-between"><h2 className="font-bold">{t('recentOrders')}</h2><Link to="/admin/orders" className="text-sm font-bold text-rose-700">{t('viewOrders')}</Link></div><div className="mt-3 divide-y">{orders.slice(0, 6).map((order) => <div key={order.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><span className="font-bold">#{order.order_number} · {order.customer_name}</span><span className="text-stone-500">{new Intl.DateTimeFormat(lang, { dateStyle: 'medium' }).format(new Date(order.created_at))}</span><span className="tabular-nums">{formatCurrency(Number(order.total_egp))}</span><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone(order.status)}`}>{t((statusNames[order.status] ?? 'statusPending') as 'statusPending')}</span></div>)}</div></section>
    </div>}
  </section>;
}
