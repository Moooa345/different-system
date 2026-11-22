create or replace function public.get_storefront_product_sales_stats()
returns table (
  product_id uuid,
  sold_last_30_days bigint,
  total_sold bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    pv.product_id,
    coalesce(sum(oi.quantity) filter (
      where o.created_at >= now() - interval '30 days'
        and o.created_at <= now()
    ), 0)::bigint as sold_last_30_days,
    coalesce(sum(oi.quantity), 0)::bigint as total_sold
  from public.order_items as oi
  join public.orders as o on o.id = oi.order_id
  join public.product_variants as pv on pv.id = oi.variant_id
  where o.status not in ('cancelled', 'returned')
  group by pv.product_id;
$$;

revoke all on function public.get_storefront_product_sales_stats() from public;
grant execute on function public.get_storefront_product_sales_stats() to anon, authenticated;
