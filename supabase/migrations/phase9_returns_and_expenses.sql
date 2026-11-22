create table if not exists public.product_returns (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  variant_id uuid references public.product_variants(id) on delete set null,
  product_name_snapshot text not null,
  variant_label_snapshot text not null,
  quantity integer not null check (quantity > 0),
  refund_amount numeric(12,2) not null check (refund_amount >= 0),
  refund_method text not null check (refund_method in ('cash', 'instapay', 'card', 'wallet')),
  reason text,
  shift_id uuid references public.shifts(id) on delete set null,
  processed_by uuid references auth.users(id) on delete set null,
  processed_by_name text,
  created_at timestamptz not null default now()
);
create index if not exists product_returns_created_idx on public.product_returns(created_at desc);
create index if not exists product_returns_shift_idx on public.product_returns(shift_id, created_at desc);
create index if not exists product_returns_order_variant_idx on public.product_returns(order_id, variant_id);
alter table public.product_returns enable row level security;
drop policy if exists "Owners read all returns" on public.product_returns;
drop policy if exists "Cashiers read own shift returns" on public.product_returns;
create policy "Owners read all returns" on public.product_returns for select to authenticated using (public.is_owner());
create policy "Cashiers read own shift returns" on public.product_returns for select to authenticated
  using (public.current_staff_role() = 'cashier' and exists (
    select 1 from public.shifts s where s.id = product_returns.shift_id and s.cashier_id = auth.uid()
  ));
grant select on public.product_returns to authenticated;
revoke insert, update, delete on public.product_returns from anon, authenticated;

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  category_group text not null check (category_group in ('operational', 'petty_damages')),
  sub_category text not null check (sub_category in ('rent', 'electricity', 'taxes', 'salaries', 'other_operational', 'damaged_goods', 'renovations', 'hospitality', 'emergency', 'other_petty')),
  title text not null,
  amount numeric(12,2) not null check (amount > 0),
  expense_date date not null default current_date,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists expenses_date_group_idx on public.expenses(expense_date desc, category_group);
alter table public.expenses enable row level security;
drop policy if exists "Owners manage expenses" on public.expenses;
create policy "Owners manage expenses" on public.expenses for all to authenticated using (public.is_owner()) with check (public.is_owner());
grant select, insert, update, delete on public.expenses to authenticated;

create or replace function public.process_product_return(
  p_variant_id uuid,
  p_quantity integer,
  p_refund_amount numeric,
  p_refund_method text,
  p_order_id uuid default null,
  p_reason text default null
)
returns public.product_returns language plpgsql security definer set search_path = '' as $$
declare
  v_role text;
  v_shift_id uuid;
  v_variant public.product_variants%rowtype;
  v_product public.products%rowtype;
  v_name text;
  v_label text;
  v_return public.product_returns%rowtype;
  v_sold integer;
  v_already_returned integer;
begin
  v_role := public.current_staff_role();
  if auth.uid() is null or v_role is null or v_role not in ('owner', 'cashier') then raise exception 'Staff access required'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Return quantity must be positive'; end if;
  if p_refund_amount is null or p_refund_amount < 0 then raise exception 'Refund amount cannot be negative'; end if;
  if p_refund_method not in ('cash', 'instapay', 'card', 'wallet') then raise exception 'Invalid refund method'; end if;

  if v_role = 'cashier' then
    select s.id into v_shift_id from public.shifts s where s.cashier_id = auth.uid() and s.status = 'open' for update;
    if v_shift_id is null then raise exception 'An open cashier shift is required'; end if;
  else
    select s.id into v_shift_id from public.shifts s where s.cashier_id = auth.uid() and s.status = 'open' for update;
  end if;

  select * into v_variant from public.product_variants where id = p_variant_id for update;
  if not found then raise exception 'Variant not found'; end if;
  select * into v_product from public.products where id = v_variant.product_id for update;
  if not found then raise exception 'Product not found'; end if;
  v_name := coalesce(nullif(btrim(v_product.name), ''), 'Product');
  v_label := concat_ws(' · ', nullif(btrim(v_variant.color), ''), nullif(btrim(v_variant.size), ''), v_variant.sku);

  if p_order_id is not null then
    select coalesce(sum(oi.quantity), 0)::integer into v_sold
      from public.order_items oi join public.orders o on o.id = oi.order_id
      where oi.order_id = p_order_id and oi.variant_id = p_variant_id and o.status not in ('cancelled', 'returned');
    select coalesce(sum(r.quantity), 0)::integer into v_already_returned
      from public.product_returns r where r.order_id = p_order_id and r.variant_id = p_variant_id;
    if v_sold = 0 or v_already_returned + p_quantity > v_sold then raise exception 'Return quantity exceeds purchased quantity'; end if;
  end if;

  select coalesce(nullif(s.display_name, ''), u.email) into v_name
    from auth.users u left join public.staff_accounts s on s.user_id = u.id where u.id = auth.uid();
  -- Keep the product snapshot from the catalog even when a staff display name is configured.
  v_label := concat_ws(' · ', nullif(btrim(v_variant.color), ''), nullif(btrim(v_variant.size), ''), v_variant.sku);
  insert into public.product_returns(order_id, product_id, variant_id, product_name_snapshot, variant_label_snapshot,
    quantity, refund_amount, refund_method, reason, shift_id, processed_by, processed_by_name)
  values (p_order_id, v_product.id, v_variant.id, v_product.name, v_label, p_quantity, p_refund_amount,
    p_refund_method, nullif(btrim(p_reason), ''), v_shift_id, auth.uid(), v_name)
  returning * into v_return;

  update public.product_variants set stock_qty = stock_qty + p_quantity, updated_at = now() where id = v_variant.id;
  insert into public.stock_logs(variant_id, quantity_delta, reason, note, created_by)
  values (v_variant.id, p_quantity, 'return', 'Product return ' || v_return.id::text, auth.uid());
  return v_return;
end $$;
revoke all on function public.process_product_return(uuid, integer, numeric, text, uuid, text) from public, anon;
grant execute on function public.process_product_return(uuid, integer, numeric, text, uuid, text) to authenticated;

-- Cash refunds reduce expected drawer cash. Digital refunds remain in their separate tender channel.
create or replace function public.close_cashier_shift(p_shift_id uuid, p_actual_closing_cash numeric, p_notes text default null)
returns public.shifts language plpgsql security definer set search_path = '' as $$
declare
  v_shift public.shifts%rowtype;
  v_expected numeric(12,2);
  v_closed_at timestamptz := now();
  v_diff integer;
  v_grace integer := 0;
  v_role text;
begin
  v_role := public.current_staff_role();
  if v_role is null or v_role not in ('owner', 'cashier') then raise exception 'Staff access required'; end if;
  select * into v_shift from public.shifts where id = p_shift_id for update;
  if not found or v_shift.status <> 'open' then raise exception 'Open shift not found'; end if;
  if v_role <> 'owner' and v_shift.cashier_id <> auth.uid() then raise exception 'Cannot close another cashier shift'; end if;
  if p_actual_closing_cash is null or p_actual_closing_cash < 0 then raise exception 'Closing cash must be non-negative'; end if;
  select coalesce(st.grace_minutes, 0) into v_grace from public.shift_templates st where st.id = v_shift.template_id;
  v_grace := coalesce(v_grace, 0);
  select v_shift.opening_cash_egp
    + coalesce((select sum(o.total_egp) from public.orders o where o.shift_id = p_shift_id and o.payment_method = 'cash' and o.status not in ('cancelled', 'returned')), 0)
    - coalesce((select sum(r.refund_amount) from public.product_returns r where r.shift_id = p_shift_id and r.refund_method = 'cash'), 0)
    into v_expected;
  if v_shift.scheduled_end_at is not null then v_diff := trunc(extract(epoch from (v_closed_at - v_shift.scheduled_end_at)) / 60)::integer; end if;
  update public.shifts set status = 'closed', closed_at = v_closed_at, expected_cash_egp = v_expected,
    actual_closing_cash_egp = p_actual_closing_cash, cash_variance_egp = p_actual_closing_cash - v_expected,
    checkout_diff_minutes = v_diff,
    checkout_status = case when v_diff is null then null when v_diff > v_grace then 'overtime' when v_diff < -v_grace then 'early_leave' else 'on_time' end,
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
  select count(*)::integer,
    coalesce(sum(o.total_egp) filter (where o.payment_method = 'cash'), 0) - coalesce((select sum(r.refund_amount) from public.product_returns r where r.shift_id = v_shift.id and r.refund_method = 'cash'), 0),
    coalesce(sum(o.total_egp) filter (where o.payment_method <> 'cash'), 0) - coalesce((select sum(r.refund_amount) from public.product_returns r where r.shift_id = v_shift.id and r.refund_method <> 'cash'), 0),
    coalesce(sum(o.total_egp), 0) - coalesce((select sum(r.refund_amount) from public.product_returns r where r.shift_id = v_shift.id), 0)
    into v_orders, v_cash, v_digital, v_total from public.orders o where o.shift_id = v_shift.id and o.status not in ('cancelled', 'returned');
  return jsonb_build_object('shift_id', v_shift.id, 'opened_at', v_shift.opened_at, 'opening_cash_egp', v_shift.opening_cash_egp,
    'orders_count', v_orders, 'cash_sales_egp', v_cash, 'digital_sales_egp', v_digital, 'total_sales_egp', v_total);
end $$;
revoke all on function public.get_current_shift_summary() from public;
grant execute on function public.get_current_shift_summary() to authenticated;

create or replace function public.get_returns_summary(p_since timestamptz default null, p_until timestamptz default null)
returns table (refund_total numeric, return_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_owner() then raise exception 'Owner access required'; end if;
  return query select coalesce(sum(r.refund_amount), 0), count(*) from public.product_returns r
    where (p_since is null or r.created_at >= p_since) and (p_until is null or r.created_at < p_until);
end $$;
revoke all on function public.get_returns_summary(timestamptz, timestamptz) from public;
grant execute on function public.get_returns_summary(timestamptz, timestamptz) to authenticated;
