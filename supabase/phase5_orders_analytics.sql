-- Keep cancellation and stock restoration in one transaction.
create or replace function public.cancel_order_atomic(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_item record;
begin
  if not public.is_staff() then
    raise exception 'Staff access required';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then raise exception 'Order not found'; end if;
  if v_order.status in ('cancelled', 'returned') then
    raise exception 'Order stock has already been restored';
  end if;

  update public.orders set status = 'cancelled', updated_at = now()
  where id = p_order_id;

  for v_item in
    select oi.variant_id, oi.quantity
    from public.order_items oi
    join public.product_variants pv on pv.id = oi.variant_id
    where oi.order_id = p_order_id
    order by pv.id
    for update of pv
  loop
    update public.product_variants
    set stock_qty = stock_qty + v_item.quantity, updated_at = now()
    where id = v_item.variant_id;

    insert into public.stock_logs (variant_id, order_id, quantity_delta, reason, note, created_by)
    values (v_item.variant_id, p_order_id, v_item.quantity, 'cancellation', 'Order cancelled', auth.uid());
  end loop;
end;
$$;

revoke all on function public.cancel_order_atomic(uuid) from public, anon;
grant execute on function public.cancel_order_atomic(uuid) to authenticated;

-- The schema defines staff-only RLS for shipping zones; ensure staff have table privileges too.
grant select, insert, update on public.shipping_zones to authenticated;
