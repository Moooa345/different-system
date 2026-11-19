create extension if not exists pgcrypto;

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category text not null check (category in ('bags', 'sneakers')),
  brand text,
  image_urls text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  sku text not null unique,
  color text,
  size text,
  unit_cost_price numeric(12,2) not null check (unit_cost_price >= 0),
  unit_sell_price numeric(12,2) not null check (unit_sell_price >= 0),
  stock_qty integer not null default 0 check (stock_qty >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shipping_zones (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  fee_egp numeric(12,2) not null check (fee_egp >= 0),
  cod_fee_egp numeric(12,2) not null default 0 check (cod_fee_egp >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity unique,
  customer_name text not null,
  customer_phone text not null,
  shipping_address text,
  shipping_zone_id uuid references public.shipping_zones(id) on delete set null,
  channel text not null check (channel in ('storefront', 'pos')),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned')),
  subtotal_egp numeric(12,2) not null check (subtotal_egp >= 0),
  shipping_fee_egp numeric(12,2) not null default 0 check (shipping_fee_egp >= 0),
  total_egp numeric(12,2) not null check (total_egp >= 0),
  return_loss_egp numeric(12,2) not null default 0 check (return_loss_egp >= 0),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id),
  product_name text not null,
  variant_sku text not null,
  quantity integer not null check (quantity > 0),
  unit_cost_price numeric(12,2) not null check (unit_cost_price >= 0),
  unit_sell_price numeric(12,2) not null check (unit_sell_price >= 0),
  line_total_egp numeric(12,2) not null check (line_total_egp >= 0),
  created_at timestamptz not null default now()
);

create table public.stock_logs (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.product_variants(id),
  order_id uuid references public.orders(id) on delete set null,
  quantity_delta integer not null check (quantity_delta <> 0),
  reason text not null check (reason in ('sale', 'cancellation', 'return', 'adjustment')),
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index product_variants_product_id_idx on public.product_variants(product_id);
create index orders_status_created_idx on public.orders(status, created_at desc);
create index order_items_order_id_idx on public.order_items(order_id);
create index stock_logs_variant_created_idx on public.stock_logs(variant_id, created_at desc);

create or replace function public.is_staff()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role' in ('admin', 'cashier'), false)
$$;

alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.shipping_zones enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.stock_logs enable row level security;

create policy "Public can read active products" on public.products for select to anon, authenticated using (is_active or public.is_staff());
create policy "Staff manage products" on public.products for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "Public can read active variants" on public.product_variants for select to anon, authenticated using (is_active and exists (select 1 from public.products p where p.id = product_id and p.is_active) or public.is_staff());
create policy "Staff manage variants" on public.product_variants for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "Public can read active shipping zones" on public.shipping_zones for select to anon, authenticated using (is_active or public.is_staff());
create policy "Staff manage shipping zones" on public.shipping_zones for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "Staff manage orders" on public.orders for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "Staff manage order items" on public.order_items for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "Staff read stock logs" on public.stock_logs for select to authenticated using (public.is_staff());

-- Prevent browser clients from changing stock_qty; stock changes go through the RPCs.
revoke update on public.product_variants from anon, authenticated;
grant update (product_id, sku, color, size, image_url, unit_cost_price, unit_sell_price, is_active, updated_at)
  on public.product_variants to authenticated;
-- Orders and stock history are written only inside the atomic RPC functions.
revoke insert, update, delete on public.orders, public.order_items, public.stock_logs from anon, authenticated;

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
  v_shipping_zone_id uuid;
  v_created_by uuid;
begin
  if jsonb_typeof(items_array) <> 'array' or jsonb_array_length(items_array) = 0 then
    raise exception 'Order must contain at least one item';
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
    v_subtotal := v_subtotal + v_variant.unit_sell_price * v_quantity;
  end loop;

  v_shipping_zone_id := nullif(order_payload->>'shipping_zone_id', '')::uuid;
  if v_shipping_zone_id is not null then
    select fee_egp into v_shipping from public.shipping_zones where id = v_shipping_zone_id and is_active;
    if not found then raise exception 'Shipping zone is unavailable'; end if;
  else
    v_shipping := 0;
  end if;
  if coalesce(order_payload->>'channel', 'storefront') not in ('storefront', 'pos') then
    raise exception 'Invalid order channel';
  end if;
  if auth.uid() is not null and public.is_staff() then v_created_by := auth.uid(); end if;

  insert into public.orders (
    customer_name, customer_phone, shipping_address, shipping_zone_id, channel, status,
    subtotal_egp, shipping_fee_egp, total_egp, notes, created_by
  ) values (
    order_payload->>'customer_name', order_payload->>'customer_phone', order_payload->>'shipping_address',
    v_shipping_zone_id,
    coalesce(order_payload->>'channel', 'storefront'), 'pending', v_subtotal, v_shipping,
    v_subtotal + v_shipping, order_payload->>'notes', v_created_by
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

create or replace function public.update_order_status_atomic(p_order_id uuid, p_new_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_item record;
begin
  if not public.is_staff() then raise exception 'Staff access required'; end if;
  if p_new_status not in ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned') then
    raise exception 'Invalid order status';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status = p_new_status then return; end if;

  if p_new_status in ('cancelled', 'returned') and v_order.status not in ('cancelled', 'returned') then
    for v_item in
      select oi.variant_id, oi.quantity, oi.unit_cost_price, pv.id as locked_id
      from public.order_items oi join public.product_variants pv on pv.id = oi.variant_id
      where oi.order_id = p_order_id order by pv.id for update of pv
    loop
      update public.product_variants set stock_qty = stock_qty + v_item.quantity, updated_at = now() where id = v_item.variant_id;
      insert into public.stock_logs (variant_id, order_id, quantity_delta, reason, note, created_by)
      values (v_item.variant_id, p_order_id, v_item.quantity,
        case when p_new_status = 'returned' then 'return' else 'cancellation' end,
        'Order stock restoration', auth.uid());
      if p_new_status = 'returned' then
        update public.orders set return_loss_egp = return_loss_egp + v_item.unit_cost_price * v_item.quantity where id = p_order_id;
      end if;
    end loop;
  end if;
  update public.orders set status = p_new_status, updated_at = now() where id = p_order_id;
end;
$$;

revoke all on function public.create_order_atomic(jsonb, jsonb) from public;
grant execute on function public.create_order_atomic(jsonb, jsonb) to anon, authenticated;
revoke all on function public.update_order_status_atomic(uuid, text) from public;
grant execute on function public.update_order_status_atomic(uuid, text) to authenticated;
grant execute on function public.is_staff() to authenticated;

insert into public.shipping_zones (name, fee_egp) values
  ('القاهرة', 60), ('الجيزة', 65), ('الإسكندرية', 85), ('الدلتا والقناة', 90), ('صعيد مصر', 120)
on conflict (name) do update set fee_egp = excluded.fee_egp, is_active = true;
