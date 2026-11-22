-- Owner/cashier authorization, isolated POS shifts, and owner-only financial access.
create table if not exists public.staff_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null check (role in ('owner', 'cashier')),
  display_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.staff_accounts add column if not exists email text;
update public.staff_accounts s set email = u.email from auth.users u where u.id = s.user_id and s.email is null;

create table if not exists public.shift_templates (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null,
  name_en text not null,
  start_time time not null,
  end_time time not null,
  grace_minutes integer not null default 5 check (grace_minutes >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  cashier_id uuid not null references auth.users(id),
  cashier_name text,
  template_id uuid references public.shift_templates(id) on delete set null,
  scheduled_start_at timestamptz not null,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  status text not null default 'open' check (status in ('open', 'closed')),
  punctuality_status text not null check (punctuality_status in ('early', 'on_time', 'late')),
  punctuality_diff_minutes integer not null,
  opening_cash_egp numeric(12,2) not null default 0 check (opening_cash_egp >= 0),
  expected_cash_egp numeric(12,2),
  actual_closing_cash_egp numeric(12,2),
  cash_variance_egp numeric(12,2),
  notes text,
  created_at timestamptz not null default now(),
  check ((status = 'open' and closed_at is null) or (status = 'closed' and closed_at is not null))
);

-- One active register shift at a time; a new one cannot start until reconciliation closes it.
create unique index if not exists shifts_single_open_register_idx on public.shifts (status) where status = 'open';
create index if not exists shifts_cashier_created_idx on public.shifts (cashier_id, created_at desc);

alter table public.orders add column if not exists cashier_id uuid references auth.users(id) on delete set null;
alter table public.orders add column if not exists shift_id uuid references public.shifts(id) on delete set null;
create index if not exists orders_shift_id_idx on public.orders(shift_id) where shift_id is not null;

-- Preserve historical line snapshots and stock movement rows when an owner removes a product.
alter table public.order_items alter column variant_id drop not null;
alter table public.stock_logs alter column variant_id drop not null;
do $$ begin
  alter table public.order_items drop constraint if exists order_items_variant_id_fkey;
  alter table public.order_items add constraint order_items_variant_id_fkey foreign key (variant_id) references public.product_variants(id) on delete set null;
  alter table public.stock_logs drop constraint if exists stock_logs_variant_id_fkey;
  alter table public.stock_logs add constraint stock_logs_variant_id_fkey foreign key (variant_id) references public.product_variants(id) on delete set null;
end $$;

create or replace function public.current_staff_role()
returns text language plpgsql stable security definer set search_path = '' as $$
declare v_role text; v_active boolean;
begin
  if auth.uid() is null then return null; end if;
  select s.role, s.is_active into v_role, v_active from public.staff_accounts s where s.user_id = auth.uid();
  if found then return case when v_active then v_role else null end; end if;
  v_role := auth.jwt() -> 'app_metadata' ->> 'role';
  if v_role = 'admin' then return 'owner'; end if;
  if v_role = 'owner' or v_role = 'cashier' then return v_role; end if;
  return null;
end $$;

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.current_staff_role() = 'owner', false)
$$;
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.current_staff_role() in ('owner', 'cashier'), false)
$$;

alter table public.staff_accounts enable row level security;
alter table public.shift_templates enable row level security;
alter table public.shifts enable row level security;
drop policy if exists "Owner manage staff accounts" on public.staff_accounts;
create policy "Owner manage staff accounts" on public.staff_accounts for all to authenticated using (public.is_owner()) with check (public.is_owner());
drop policy if exists "Owner manage shift templates" on public.shift_templates;
create policy "Owner manage shift templates" on public.shift_templates for all to authenticated using (public.is_owner()) with check (public.is_owner());
drop policy if exists "Staff read active shift templates" on public.shift_templates;
create policy "Staff read active shift templates" on public.shift_templates for select to authenticated using (is_active and public.is_staff());
drop policy if exists "Owner manage shifts" on public.shifts;
create policy "Owner manage shifts" on public.shifts for all to authenticated using (public.is_owner()) with check (public.is_owner());
drop policy if exists "Cashier read own shifts" on public.shifts;
create policy "Cashier read own shifts" on public.shifts for select to authenticated using (cashier_id = auth.uid() and public.current_staff_role() = 'cashier');
grant select, insert, update, delete on public.staff_accounts, public.shift_templates, public.shifts to authenticated;

-- Replace broad staff management policies with owner-only management and cashier catalog reads.
drop policy if exists "Staff manage products" on public.products;
drop policy if exists "Public can read active products" on public.products;
drop policy if exists "Active catalog readable" on public.products;
drop policy if exists "Owners manage products" on public.products;
create policy "Active catalog readable" on public.products for select to anon, authenticated using (is_active or public.is_owner());
create policy "Owners manage products" on public.products for all to authenticated using (public.is_owner()) with check (public.is_owner());
drop policy if exists "Staff manage variants" on public.product_variants;
drop policy if exists "Public can read active variants" on public.product_variants;
drop policy if exists "Active variants readable" on public.product_variants;
drop policy if exists "Owners manage variants" on public.product_variants;
create policy "Active variants readable" on public.product_variants for select to anon, authenticated using ((is_active and exists (select 1 from public.products p where p.id = product_id and p.is_active)) or public.is_owner());
create policy "Owners manage variants" on public.product_variants for all to authenticated using (public.is_owner()) with check (public.is_owner());
drop policy if exists "Staff manage shipping zones" on public.shipping_zones;
drop policy if exists "Public can read active shipping zones" on public.shipping_zones;
drop policy if exists "Active shipping zones readable" on public.shipping_zones;
drop policy if exists "Owners manage shipping zones" on public.shipping_zones;
create policy "Active shipping zones readable" on public.shipping_zones for select to anon, authenticated using (is_active or public.is_owner());
create policy "Owners manage shipping zones" on public.shipping_zones for all to authenticated using (public.is_owner()) with check (public.is_owner());
drop policy if exists "Staff manage orders" on public.orders;
drop policy if exists "Staff manage order items" on public.order_items;
drop policy if exists "Staff read stock logs" on public.stock_logs;
drop policy if exists "Owners read orders" on public.orders;
drop policy if exists "Owners read order items" on public.order_items;
drop policy if exists "Owners read stock logs" on public.stock_logs;
create policy "Owners read orders" on public.orders for select to authenticated using (public.is_owner());
create policy "Owners read order items" on public.order_items for select to authenticated using (public.is_owner());
create policy "Owners read stock logs" on public.stock_logs for select to authenticated using (public.is_owner());

-- The public and cashier catalog may read sell prices, never cost prices.
revoke select on public.product_variants from authenticated;
grant select (id, product_id, sku, color, size, image_url, unit_sell_price, stock_qty, is_active, created_at, updated_at)
  on public.product_variants to authenticated;
revoke update on public.product_variants from authenticated;
grant update (product_id, sku, color, size, image_url, unit_cost_price, unit_sell_price, is_active, updated_at)
  on public.product_variants to authenticated;
revoke all on public.orders, public.order_items, public.stock_logs from authenticated;
grant select on public.orders, public.order_items, public.stock_logs to authenticated;

create or replace function public.get_my_staff_role()
returns text language sql stable security definer set search_path = '' as $$ select public.current_staff_role() $$;
revoke all on function public.get_my_staff_role() from public;
grant execute on function public.get_my_staff_role() to authenticated;

create or replace function public.get_owner_variant_costs()
returns table (variant_id uuid, unit_cost_price numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_owner() then raise exception 'Owner access required'; end if;
  return query select pv.id, pv.unit_cost_price from public.product_variants pv;
end $$;
revoke all on function public.get_owner_variant_costs() from public;
grant execute on function public.get_owner_variant_costs() to authenticated;

create or replace function public.assign_staff_role(p_email text, p_role text, p_display_name text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid;
begin
  if not public.is_owner() then raise exception 'Owner access required'; end if;
  if p_role not in ('owner', 'cashier') then raise exception 'Invalid staff role'; end if;
  select u.id into v_user_id from auth.users u where lower(u.email) = lower(trim(p_email));
  if v_user_id is null then raise exception 'Auth user email not found'; end if;
  insert into public.staff_accounts(user_id, email, role, display_name, is_active)
  values (v_user_id, lower(trim(p_email)), p_role, nullif(trim(p_display_name), ''), true)
  on conflict (user_id) do update set email = excluded.email, role = excluded.role, display_name = excluded.display_name, is_active = true, updated_at = now();
  return v_user_id;
end $$;
revoke all on function public.assign_staff_role(text, text, text) from public;
grant execute on function public.assign_staff_role(text, text, text) to authenticated;

insert into public.shift_templates(name_ar, name_en, start_time, end_time, grace_minutes)
select 'الفترة الصباحية', 'Morning shift', '12:00', '18:00', 5
where not exists (select 1 from public.shift_templates where name_en = 'Morning shift');
insert into public.shift_templates(name_ar, name_en, start_time, end_time, grace_minutes)
select 'الفترة المسائية', 'Evening shift', '18:00', '00:00', 5
where not exists (select 1 from public.shift_templates where name_en = 'Evening shift');

create or replace function public.open_cashier_shift(p_template_id uuid, p_opening_cash numeric default 0)
returns public.shifts language plpgsql security definer set search_path = '' as $$
declare v_template public.shift_templates%rowtype; v_shift public.shifts%rowtype; v_role text; v_local_start timestamp; v_diff integer; v_name text;
begin
  v_role := public.current_staff_role();
  if v_role is null or v_role not in ('owner', 'cashier') then raise exception 'Staff access required'; end if;
  if p_opening_cash is null or p_opening_cash < 0 then raise exception 'Opening cash must be non-negative'; end if;
  perform pg_advisory_xact_lock(hashtext('different-store-register-shift'));
  if exists (select 1 from public.shifts where status = 'open') then raise exception 'An open shift must be closed first'; end if;
  select * into v_template from public.shift_templates where id = p_template_id and is_active;
  if not found then raise exception 'Shift template unavailable'; end if;
  v_local_start := (now() at time zone 'Africa/Cairo')::date + v_template.start_time;
  v_diff := floor(extract(epoch from ((now() at time zone 'Africa/Cairo') - v_local_start)) / 60)::integer;
  select coalesce(nullif(s.display_name, ''), u.email) into v_name from auth.users u left join public.staff_accounts s on s.user_id = u.id where u.id = auth.uid();
  insert into public.shifts(cashier_id, cashier_name, template_id, scheduled_start_at, punctuality_status, punctuality_diff_minutes, opening_cash_egp)
  values (auth.uid(), v_name, p_template_id, v_local_start at time zone 'Africa/Cairo',
    case when v_diff < 0 then 'early' when v_diff <= v_template.grace_minutes then 'on_time' else 'late' end,
    v_diff, p_opening_cash) returning * into v_shift;
  return v_shift;
end $$;
revoke all on function public.open_cashier_shift(uuid, numeric) from public;
grant execute on function public.open_cashier_shift(uuid, numeric) to authenticated;

create or replace function public.close_cashier_shift(p_shift_id uuid, p_actual_closing_cash numeric, p_notes text default null)
returns public.shifts language plpgsql security definer set search_path = '' as $$
declare v_shift public.shifts%rowtype; v_expected numeric(12,2); v_role text;
begin
  v_role := public.current_staff_role();
  if v_role is null or v_role not in ('owner', 'cashier') then raise exception 'Staff access required'; end if;
  select * into v_shift from public.shifts where id = p_shift_id for update;
  if not found or v_shift.status <> 'open' then raise exception 'Open shift not found'; end if;
  if v_role <> 'owner' and v_shift.cashier_id <> auth.uid() then raise exception 'Cannot close another cashier shift'; end if;
  if p_actual_closing_cash is null or p_actual_closing_cash < 0 then raise exception 'Closing cash must be non-negative'; end if;
  select v_shift.opening_cash_egp + coalesce(sum(o.total_egp) filter (where o.payment_method = 'cash' and o.status not in ('cancelled', 'returned')), 0)
    into v_expected from public.orders o where o.shift_id = p_shift_id;
  update public.shifts set status = 'closed', closed_at = now(), expected_cash_egp = v_expected,
    actual_closing_cash_egp = p_actual_closing_cash, cash_variance_egp = p_actual_closing_cash - v_expected,
    notes = nullif(trim(p_notes), '') where id = p_shift_id returning * into v_shift;
  return v_shift;
end $$;
revoke all on function public.close_cashier_shift(uuid, numeric, text) from public;
grant execute on function public.close_cashier_shift(uuid, numeric, text) to authenticated;

create or replace function public.get_current_shift_summary()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_shift public.shifts%rowtype; v_orders integer; v_cash numeric; v_digital numeric; v_total numeric;
begin
  if not public.is_staff() then raise exception 'Staff access required'; end if;
  select * into v_shift from public.shifts where status = 'open' and cashier_id = auth.uid() order by opened_at desc limit 1;
  if not found then return null; end if;
  select count(*), coalesce(sum(total_egp) filter (where payment_method = 'cash'), 0), coalesce(sum(total_egp) filter (where payment_method = 'instapay'), 0), coalesce(sum(total_egp), 0)
    into v_orders, v_cash, v_digital, v_total from public.orders where shift_id = v_shift.id and status not in ('cancelled', 'returned');
  return jsonb_build_object('shift_id', v_shift.id, 'opened_at', v_shift.opened_at, 'opening_cash_egp', v_shift.opening_cash_egp,
    'orders_count', v_orders, 'cash_sales_egp', v_cash, 'digital_sales_egp', v_digital, 'total_sales_egp', v_total);
end $$;
revoke all on function public.get_current_shift_summary() from public;
grant execute on function public.get_current_shift_summary() to authenticated;

create or replace function public.get_pos_receipt(p_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if not public.is_staff() then raise exception 'Staff access required'; end if;
  select jsonb_build_object('order_number', o.order_number, 'created_at', o.created_at) into v_result
  from public.orders o where o.id = p_order_id and o.channel = 'pos'
    and (public.is_owner() or (o.cashier_id = auth.uid() and o.shift_id in (select s.id from public.shifts s where s.cashier_id = auth.uid())));
  if v_result is null then raise exception 'Receipt unavailable'; end if;
  return v_result;
end $$;
revoke all on function public.get_pos_receipt(uuid) from public;
grant execute on function public.get_pos_receipt(uuid) to authenticated;

create or replace function public.delete_product_permanently(p_product_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner() then raise exception 'Owner access required'; end if;
  delete from public.products where id = p_product_id;
  if not found then raise exception 'Product not found'; end if;
end $$;
revoke all on function public.delete_product_permanently(uuid) from public;
grant execute on function public.delete_product_permanently(uuid) to authenticated;

-- Every POS order is bound to the caller's currently open shift; browser payload cannot choose its cashier.
create or replace function public.create_order_atomic(order_payload jsonb, items_array jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_order_id uuid; v_item jsonb; v_variant public.product_variants%rowtype; v_qty integer; v_subtotal numeric(12,2) := 0;
  v_shipping numeric(12,2) := 0; v_cod numeric(12,2) := 0; v_zone_cod numeric(12,2) := 0; v_zone uuid;
  v_source text; v_channel text; v_status text; v_payment text; v_created_by uuid; v_shift_id uuid;
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
  v_cod := case when v_source = 'online' and v_payment = 'cod' then v_zone_cod else 0 end;
  insert into public.orders(customer_name, customer_phone, shipping_address, shipping_zone_id, channel, status, subtotal_egp, shipping_fee_egp, cod_fee_egp, total_egp, payment_method, notes, created_by, cashier_id, shift_id)
  values (coalesce(nullif(order_payload->>'customer_name',''), 'Walk-in customer'), coalesce(nullif(order_payload->>'customer_phone',''), ''), order_payload->>'shipping_address', v_zone, v_channel, v_status, v_subtotal, v_shipping, v_cod, v_subtotal + v_shipping + v_cod, v_payment, order_payload->>'notes', v_created_by, case when v_source='pos' then auth.uid() end, case when v_source='pos' then v_shift_id end)
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

create or replace function public.update_order_status_atomic(p_order_id uuid, p_new_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_order public.orders%rowtype; v_item record;
begin
  if not public.is_owner() then raise exception 'Owner access required'; end if;
  if p_new_status not in ('pending','confirmed','processing','shipped','delivered','cancelled','returned') then raise exception 'Invalid order status'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status = p_new_status then return; end if;
  if p_new_status in ('cancelled','returned') and v_order.status not in ('cancelled','returned') then
    for v_item in select oi.variant_id,oi.quantity,oi.unit_cost_price,pv.id as locked_id from public.order_items oi join public.product_variants pv on pv.id=oi.variant_id where oi.order_id=p_order_id order by pv.id for update of pv loop
      update public.product_variants set stock_qty=stock_qty+v_item.quantity,updated_at=now() where id=v_item.variant_id;
      insert into public.stock_logs(variant_id,order_id,quantity_delta,reason,note,created_by) values(v_item.variant_id,p_order_id,v_item.quantity,case when p_new_status='returned' then 'return' else 'cancellation' end,'Order stock restoration',auth.uid());
      if p_new_status='returned' then update public.orders set return_loss_egp=return_loss_egp+v_item.unit_cost_price*v_item.quantity where id=p_order_id; end if;
    end loop;
  end if;
  update public.orders set status=p_new_status,updated_at=now() where id=p_order_id;
end $$;
revoke all on function public.update_order_status_atomic(uuid,text) from public;
grant execute on function public.update_order_status_atomic(uuid,text) to authenticated;

create or replace function public.cancel_order_atomic(p_order_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_order public.orders%rowtype; v_item record;
begin
  if not public.is_owner() then raise exception 'Owner access required'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status in ('cancelled','returned') then raise exception 'Order stock has already been restored'; end if;
  update public.orders set status='cancelled', updated_at=now() where id=p_order_id;
  for v_item in select oi.variant_id,oi.quantity from public.order_items oi join public.product_variants pv on pv.id=oi.variant_id where oi.order_id=p_order_id order by pv.id for update of pv loop
    update public.product_variants set stock_qty=stock_qty+v_item.quantity,updated_at=now() where id=v_item.variant_id;
    insert into public.stock_logs(variant_id,order_id,quantity_delta,reason,note,created_by) values(v_item.variant_id,p_order_id,v_item.quantity,'cancellation','Order cancelled',auth.uid());
  end loop;
end $$;
revoke all on function public.cancel_order_atomic(uuid) from public, anon;
grant execute on function public.cancel_order_atomic(uuid) to authenticated;

create or replace function public.adjust_variant_stock_atomic(p_variant_id uuid, p_delta integer, p_reason text default 'manual_restock')
returns integer language plpgsql security definer set search_path = '' as $$
declare v_stock integer; v_new_stock integer;
begin
  if not public.is_owner() then raise exception 'Owner access required'; end if;
  if p_delta = 0 or nullif(btrim(p_reason),'') is null then raise exception 'Invalid stock adjustment'; end if;
  select stock_qty into v_stock from public.product_variants where id=p_variant_id for update;
  if not found then raise exception 'Variant not found'; end if;
  v_new_stock := v_stock + p_delta;
  if v_new_stock < 0 then raise exception 'Insufficient stock for adjustment'; end if;
  update public.product_variants set stock_qty=v_new_stock,updated_at=now() where id=p_variant_id;
  insert into public.stock_logs(variant_id,quantity_delta,reason,note,created_by) values(p_variant_id,p_delta,'adjustment',btrim(p_reason),auth.uid());
  return v_new_stock;
end $$;
revoke all on function public.adjust_variant_stock_atomic(uuid,integer,text) from public;
grant execute on function public.adjust_variant_stock_atomic(uuid,integer,text) to authenticated;

drop policy if exists "Staff upload product images" on storage.objects;
drop policy if exists "Staff update product images" on storage.objects;
drop policy if exists "Owners upload product images" on storage.objects;
drop policy if exists "Owners update product images" on storage.objects;
drop policy if exists "Owners delete product images" on storage.objects;
create policy "Owners upload product images" on storage.objects for insert to authenticated with check (bucket_id = 'product-images' and public.is_owner());
create policy "Owners update product images" on storage.objects for update to authenticated using (bucket_id = 'product-images' and public.is_owner()) with check (bucket_id = 'product-images' and public.is_owner());
create policy "Owners delete product images" on storage.objects for delete to authenticated using (bucket_id = 'product-images' and public.is_owner());

grant execute on function public.current_staff_role() to authenticated;
grant execute on function public.is_owner() to authenticated;
grant execute on function public.is_staff() to authenticated;
