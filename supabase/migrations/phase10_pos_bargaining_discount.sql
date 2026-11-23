-- POS bargaining discounts are applied server-side and excluded from online orders.
alter table public.orders
  add column if not exists discount_amount numeric(12,2) not null default 0;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_discount_amount_within_subtotal_check'
  ) then
    alter table public.orders
      add constraint orders_discount_amount_within_subtotal_check
      check (discount_amount >= 0 and discount_amount <= subtotal_egp);
  end if;
end $$;

create or replace function public.create_order_atomic(order_payload jsonb, items_array jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_order_id uuid;
  v_item jsonb;
  v_variant public.product_variants%rowtype;
  v_qty integer;
  v_subtotal numeric(12,2) := 0;
  v_discount numeric(12,2) := 0;
  v_shipping numeric(12,2) := 0;
  v_cod numeric(12,2) := 0;
  v_zone_cod numeric(12,2) := 0;
  v_zone uuid;
  v_source text;
  v_channel text;
  v_status text;
  v_payment text;
  v_created_by uuid;
  v_shift_id uuid;
begin
  if jsonb_typeof(items_array) <> 'array' or jsonb_array_length(items_array) = 0 then raise exception 'Order must contain at least one item'; end if;
  v_source := coalesce(order_payload->>'source', order_payload->>'channel', 'storefront');
  if v_source not in ('online', 'storefront', 'pos') then raise exception 'Invalid order source'; end if;
  if v_source in ('pos', 'storefront') and not public.is_staff() then raise exception 'Staff access required'; end if;
  if v_source = 'online' and coalesce(order_payload->>'status', '') <> 'pending' then raise exception 'Online orders must start pending'; end if;
  if v_source in ('pos', 'storefront') and coalesce(order_payload->>'status', '') <> 'delivered' then raise exception 'POS orders must be delivered'; end if;
  v_status := case when v_source = 'online' then 'pending' else 'delivered' end;
  v_channel := case when v_source = 'online' then 'storefront' else 'pos' end;
  v_payment := coalesce(order_payload->>'payment_method', 'cash');
  if v_source = 'online' and v_payment not in ('cod', 'instapay') then raise exception 'Invalid online payment method'; end if;
  if v_source <> 'online' and v_payment not in ('cash', 'instapay') then raise exception 'Invalid POS payment method'; end if;
  if v_source = 'online' and (nullif(btrim(order_payload->>'customer_name'), '') is null or nullif(btrim(order_payload->>'customer_phone'), '') is null or nullif(btrim(order_payload->>'shipping_address'), '') is null) then raise exception 'Customer name, phone, and address are required'; end if;
  if v_source = 'online' and regexp_replace(order_payload->>'customer_phone', '[[:space:]()-]', '', 'g') !~ '^(\+20|0020)?0?1[0125][0-9]{8}$' then raise exception 'Invalid Egyptian phone number'; end if;
  if v_source = 'pos' then
    if public.current_staff_role() = 'cashier' then
      select id into v_shift_id from public.shifts where cashier_id = auth.uid() and status = 'open' for update;
      if v_shift_id is null then raise exception 'An open cashier shift is required'; end if;
    elsif public.current_staff_role() = 'owner' then
      select id into v_shift_id from public.shifts where cashier_id = auth.uid() and status = 'open' for update;
    end if;
    v_created_by := auth.uid();
    v_discount := coalesce(nullif(order_payload->>'discount_amount', '')::numeric, 0);
    if v_discount < 0 then raise exception 'Discount cannot be negative'; end if;
  end if;
  v_zone := nullif(order_payload->>'shipping_zone_id', '')::uuid;
  if v_source = 'online' and v_zone is null then raise exception 'Shipping zone is required'; end if;
  if v_zone is not null then
    select fee_egp, cod_fee_egp into v_shipping, v_zone_cod from public.shipping_zones where id = v_zone and is_active;
    if not found then raise exception 'Shipping zone is unavailable'; end if;
  end if;
  perform 1 from public.product_variants pv where pv.id in (select (x->>'variant_id')::uuid from jsonb_array_elements(items_array) x) order by pv.id for update;
  if (select count(distinct (x->>'variant_id')::uuid) from jsonb_array_elements(items_array) x) <> jsonb_array_length(items_array) then raise exception 'Duplicate variant lines are not allowed'; end if;
  for v_item in select value from jsonb_array_elements(items_array) loop
    v_qty := (v_item->>'quantity')::integer;
    if v_qty <= 0 then raise exception 'Quantity must be positive'; end if;
    select * into v_variant from public.product_variants where id = (v_item->>'variant_id')::uuid;
    if not found or not v_variant.is_active or v_variant.stock_qty < v_qty or not exists (select 1 from public.products p where p.id = v_variant.product_id and p.is_active) then raise exception 'Insufficient stock or inactive product'; end if;
    v_subtotal := v_subtotal + v_variant.unit_sell_price * v_qty;
  end loop;
  if v_discount > v_subtotal then raise exception 'Discount cannot exceed subtotal'; end if;
  v_cod := case when v_source = 'online' and v_payment = 'cod' then v_zone_cod else 0 end;
  insert into public.orders(customer_name, customer_phone, shipping_address, shipping_zone_id, channel, status, subtotal_egp, discount_amount, shipping_fee_egp, cod_fee_egp, total_egp, payment_method, notes, created_by, cashier_id, shift_id)
  values (coalesce(nullif(order_payload->>'customer_name',''), 'Walk-in customer'), coalesce(nullif(order_payload->>'customer_phone',''), ''), order_payload->>'shipping_address', v_zone, v_channel, v_status, v_subtotal, v_discount, v_shipping, v_cod, v_subtotal - v_discount + v_shipping + v_cod, v_payment, order_payload->>'notes', v_created_by, case when v_source='pos' then auth.uid() end, case when v_source='pos' then v_shift_id end)
  returning id into v_order_id;
  for v_item in select value from jsonb_array_elements(items_array) loop
    v_qty := (v_item->>'quantity')::integer;
    select * into v_variant from public.product_variants where id = (v_item->>'variant_id')::uuid;
    update public.product_variants set stock_qty = stock_qty - v_qty, updated_at = now() where id = v_variant.id;
    insert into public.order_items(order_id, variant_id, product_name, variant_sku, quantity, unit_cost_price, unit_sell_price, line_total_egp)
    select v_order_id, v_variant.id, p.name, v_variant.sku, v_qty, v_variant.unit_cost_price, v_variant.unit_sell_price, v_variant.unit_sell_price * v_qty from public.products p where p.id=v_variant.product_id;
    insert into public.stock_logs(variant_id, order_id, quantity_delta, reason, note, created_by) values(v_variant.id,v_order_id,-v_qty,'sale','Order stock deduction',v_created_by);
  end loop;
  return v_order_id;
end $$;
revoke all on function public.create_order_atomic(jsonb, jsonb) from public;
grant execute on function public.create_order_atomic(jsonb, jsonb) to anon, authenticated;

-- Enable live order-ledger refresh after POS returns, when publication is available.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'product_returns') then
    alter publication supabase_realtime add table public.product_returns;
  end if;
end $$;
