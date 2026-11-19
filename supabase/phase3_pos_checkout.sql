alter table public.orders
  add column if not exists cod_fee_egp numeric(12,2) not null default 0 check (cod_fee_egp >= 0),
  add column if not exists payment_method text not null default 'cash' check (payment_method in ('cash', 'instapay'));

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
  v_shipping numeric(12,2);
  v_cod_fee numeric(12,2);
  v_shipping_zone_id uuid;
  v_source text;
  v_status text;
  v_payment_method text;
  v_created_by uuid;
begin
  if jsonb_typeof(items_array) <> 'array' or jsonb_array_length(items_array) = 0 then
    raise exception 'Order must contain at least one item';
  end if;

  v_source := coalesce(order_payload->>'source', order_payload->>'channel', 'storefront');
  if v_source not in ('storefront', 'pos') then raise exception 'Invalid order source'; end if;
  if v_source = 'pos' then
    if not public.is_staff() then raise exception 'Staff access required for POS checkout'; end if;
    if coalesce(order_payload->>'status', '') <> 'delivered' then raise exception 'POS orders must be marked delivered'; end if;
  elsif coalesce(order_payload->>'status', 'pending') <> 'pending' then
    raise exception 'Storefront orders must start pending';
  end if;
  v_status := case when v_source = 'pos' then 'delivered' else 'pending' end;

  v_payment_method := coalesce(order_payload->>'payment_method', 'cash');
  if v_payment_method not in ('cash', 'instapay') then raise exception 'Invalid payment method'; end if;
  if v_source = 'pos' and order_payload->>'payment_method' is null then raise exception 'Payment method is required'; end if;

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

  v_shipping_zone_id := nullif(order_payload->>'shipping_zone_id', '')::uuid;
  if v_shipping_zone_id is not null then
    select fee_egp into v_shipping from public.shipping_zones where id = v_shipping_zone_id and is_active;
    if not found then raise exception 'Shipping zone is unavailable'; end if;
  else
    v_shipping := coalesce(nullif(order_payload->>'shipping_fee', '')::numeric,
                           nullif(order_payload->>'shipping_fee_egp', '')::numeric, 0);
  end if;
  v_cod_fee := coalesce(nullif(order_payload->>'cod_fee', '')::numeric, 0);
  if v_shipping < 0 or v_cod_fee < 0 then raise exception 'Fees cannot be negative'; end if;

  if auth.uid() is not null and public.is_staff() then v_created_by := auth.uid(); end if;

  insert into public.orders (
    customer_name, customer_phone, shipping_address, shipping_zone_id, channel, status,
    subtotal_egp, shipping_fee_egp, cod_fee_egp, total_egp, payment_method, notes, created_by
  ) values (
    order_payload->>'customer_name', order_payload->>'customer_phone', order_payload->>'shipping_address',
    v_shipping_zone_id, v_source, v_status, v_subtotal, v_shipping, v_cod_fee,
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
