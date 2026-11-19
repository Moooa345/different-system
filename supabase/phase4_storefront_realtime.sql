-- Public catalog reads use the active-row RLS policies from schema.sql.
grant select on public.products, public.shipping_zones to anon, authenticated;
revoke select on public.product_variants from public, anon;
grant select (id, product_id, sku, color, size, image_url, unit_sell_price, stock_qty, is_active, created_at, updated_at)
  on public.product_variants to anon;
grant select on public.product_variants to authenticated;

alter table public.shipping_zones
  add column if not exists cod_fee_egp numeric(12,2) not null default 0 check (cod_fee_egp >= 0);

-- Online checkout supports COD. Prices, shipping and COD fees are set by the RPC.
alter table public.orders drop constraint if exists orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check
  check (payment_method in ('cash', 'instapay', 'cod'));

create or replace function public.create_order_atomic(order_payload jsonb, items_array jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_item jsonb;
  v_variant public.product_variants%rowtype;
  v_quantity integer;
  v_subtotal numeric(12,2) := 0;
  v_shipping numeric(12,2) := 0;
  v_cod_fee numeric(12,2) := 0;
  v_zone_cod_fee numeric(12,2) := 0;
  v_shipping_zone_id uuid;
  v_source text;
  v_channel text;
  v_status text;
  v_payment_method text;
  v_created_by uuid;
begin
  if jsonb_typeof(items_array) <> 'array' or jsonb_array_length(items_array) = 0 then
    raise exception 'Order must contain at least one item';
  end if;

  v_source := coalesce(order_payload->>'source', order_payload->>'channel', 'storefront');
  if v_source not in ('online', 'storefront', 'pos') then raise exception 'Invalid order source'; end if;

  if v_source = 'pos' then
    if not public.is_staff() then raise exception 'Staff access required for POS checkout'; end if;
    if coalesce(order_payload->>'status', '') <> 'delivered' then raise exception 'POS orders must be marked delivered'; end if;
    v_status := 'delivered';
  elsif v_source = 'online' then
    if coalesce(order_payload->>'status', '') <> 'pending' then raise exception 'Online orders must start pending'; end if;
    v_status := 'pending';
  else
    if not public.is_staff() then raise exception 'Use online source for public checkout'; end if;
    if coalesce(order_payload->>'status', '') <> 'pending' then raise exception 'Storefront orders must start pending'; end if;
    v_status := 'pending';
  end if;

  v_channel := case when v_source = 'online' then 'storefront' else v_source end;
  v_payment_method := coalesce(order_payload->>'payment_method', 'cash');
  if v_source = 'online' and v_payment_method not in ('cod', 'instapay') then raise exception 'Invalid online payment method'; end if;
  if v_source = 'pos' and v_payment_method not in ('cash', 'instapay') then raise exception 'Invalid POS payment method'; end if;
  if v_source = 'storefront' and v_payment_method not in ('cash', 'instapay', 'cod') then raise exception 'Invalid payment method'; end if;

  if v_source = 'online' and (
    nullif(btrim(order_payload->>'customer_name'), '') is null or
    nullif(btrim(order_payload->>'customer_phone'), '') is null or
    nullif(btrim(order_payload->>'shipping_address'), '') is null
  ) then raise exception 'Customer name, phone, and address are required'; end if;
  if v_source = 'online' and regexp_replace(order_payload->>'customer_phone', '[[:space:]()-]', '', 'g') !~ '^(\+20|0020)?0?1[0125][0-9]{8}$' then
    raise exception 'Invalid Egyptian phone number';
  end if;

  v_shipping_zone_id := nullif(order_payload->>'shipping_zone_id', '')::uuid;
  if v_source = 'online' and v_shipping_zone_id is null then raise exception 'Shipping zone is required'; end if;
  if v_shipping_zone_id is not null then
    select fee_egp, cod_fee_egp into v_shipping, v_zone_cod_fee from public.shipping_zones where id = v_shipping_zone_id and is_active;
    if not found then raise exception 'Shipping zone is unavailable'; end if;
  else
    v_shipping := 0;
  end if;

  -- Lock all requested variants in stable order, then validate before changing stock.
  perform 1 from public.product_variants pv
   where pv.id in (select (x->>'variant_id')::uuid from jsonb_array_elements(items_array) x)
   order by pv.id for update;

  if (select count(distinct (x->>'variant_id')::uuid) from jsonb_array_elements(items_array) x)
     <> jsonb_array_length(items_array) then
    raise exception 'Duplicate variant lines are not allowed';
  end if;

  for v_item in select value from jsonb_array_elements(items_array) loop
    v_quantity := (v_item->>'quantity')::integer;
    if v_quantity <= 0 then raise exception 'Quantity must be positive'; end if;
    select * into v_variant from public.product_variants where id = (v_item->>'variant_id')::uuid;
    if not found or not v_variant.is_active or v_variant.stock_qty < v_quantity then
      raise exception 'Insufficient stock for variant %', v_item->>'variant_id';
    end if;
    if not exists (select 1 from public.products p where p.id = v_variant.product_id and p.is_active) then
      raise exception 'Product is unavailable';
    end if;
    v_subtotal := v_subtotal + v_variant.unit_sell_price * v_quantity;
  end loop;

  -- Read COD pricing from the selected zone. Never trust a fee supplied by the browser.
  v_cod_fee := case when v_source = 'online' and v_payment_method = 'cod' then v_zone_cod_fee else 0 end;
  if auth.uid() is not null and public.is_staff() then v_created_by := auth.uid(); end if;

  insert into public.orders (
    customer_name, customer_phone, shipping_address, shipping_zone_id, channel, status,
    subtotal_egp, shipping_fee_egp, cod_fee_egp, total_egp, payment_method, notes, created_by
  ) values (
    order_payload->>'customer_name', order_payload->>'customer_phone', order_payload->>'shipping_address',
    v_shipping_zone_id, v_channel, v_status, v_subtotal, v_shipping, v_cod_fee,
    v_subtotal + v_shipping + v_cod_fee, v_payment_method, order_payload->>'notes', v_created_by
  ) returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(items_array) loop
    v_quantity := (v_item->>'quantity')::integer;
    select * into v_variant from public.product_variants where id = (v_item->>'variant_id')::uuid;
    update public.product_variants set stock_qty = stock_qty - v_quantity, updated_at = now() where id = v_variant.id;
    insert into public.order_items (order_id, variant_id, product_name, variant_sku, quantity, unit_cost_price, unit_sell_price, line_total_egp)
    select v_order_id, v_variant.id, p.name, v_variant.sku, v_quantity, v_variant.unit_cost_price,
           v_variant.unit_sell_price, v_variant.unit_sell_price * v_quantity
      from public.products p where p.id = v_variant.product_id;
    insert into public.stock_logs (variant_id, order_id, quantity_delta, reason, note, created_by)
    values (v_variant.id, v_order_id, -v_quantity, 'sale', 'Order stock deduction', v_created_by);
  end loop;
  return v_order_id;
end;
$$;

revoke all on function public.create_order_atomic(jsonb, jsonb) from public;
grant execute on function public.create_order_atomic(jsonb, jsonb) to anon, authenticated;

-- The order UUID is a high-entropy receipt token; expose only its receipt number and totals.
create or replace function public.get_public_order_number(p_order_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'order_number', o.order_number,
    'subtotal_egp', o.subtotal_egp,
    'shipping_fee_egp', o.shipping_fee_egp,
    'cod_fee_egp', o.cod_fee_egp,
    'total_egp', o.total_egp
  )
  from public.orders o
  where o.id = p_order_id
    and o.channel = 'storefront'
    and o.status = 'pending'
    and (o.created_by is null or o.created_by = auth.uid())
$$;

revoke all on function public.get_public_order_number(uuid) from public;
grant execute on function public.get_public_order_number(uuid) to anon, authenticated;

-- Add product variants to the existing realtime publication only if missing.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'product_variants'
  ) then
    execute 'alter publication supabase_realtime add table public.product_variants';
  end if;
end $$;
