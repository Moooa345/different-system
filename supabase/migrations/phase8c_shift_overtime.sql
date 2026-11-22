-- Add scheduled shift end and computed check-out accountability.
alter table public.shifts
  add column if not exists scheduled_end_at timestamptz,
  add column if not exists checkout_status text,
  add column if not exists checkout_diff_minutes integer;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'shifts_checkout_status_check' and conrelid = 'public.shifts'::regclass) then
    alter table public.shifts add constraint shifts_checkout_status_check
      check (checkout_status is null or checkout_status in ('overtime', 'on_time', 'early_leave'));
  end if;
end $$;

-- Build both scheduled timestamps in Cairo local time. End times at or before the
-- start time belong to the following calendar day (for example 18:00–00:00).
create or replace function public.open_cashier_shift(p_template_id uuid, p_opening_cash numeric default 0)
returns public.shifts language plpgsql security definer set search_path = '' as $$
declare
  v_template public.shift_templates%rowtype;
  v_shift public.shifts%rowtype;
  v_role text;
  v_local_start timestamp;
  v_local_end timestamp;
  v_diff integer;
  v_name text;
begin
  v_role := public.current_staff_role();
  if v_role is null or v_role not in ('owner', 'cashier') then raise exception 'Staff access required'; end if;
  if p_opening_cash is null or p_opening_cash < 0 then raise exception 'Opening cash must be non-negative'; end if;
  perform pg_advisory_xact_lock(hashtext('different-store-register-shift'));
  if exists (select 1 from public.shifts where status = 'open') then raise exception 'An open shift must be closed first'; end if;
  select * into v_template from public.shift_templates where id = p_template_id and is_active;
  if not found then raise exception 'Shift template unavailable'; end if;

  v_local_start := (now() at time zone 'Africa/Cairo')::date + v_template.start_time;
  v_local_end := (now() at time zone 'Africa/Cairo')::date + v_template.end_time;
  if v_template.end_time <= v_template.start_time then
    if (now() at time zone 'Africa/Cairo')::time <= v_template.end_time then
      v_local_start := v_local_start - interval '1 day';
    else
      v_local_end := v_local_end + interval '1 day';
    end if;
  end if;
  v_diff := floor(extract(epoch from ((now() at time zone 'Africa/Cairo') - v_local_start)) / 60)::integer;
  select coalesce(nullif(s.display_name, ''), u.email) into v_name
    from auth.users u left join public.staff_accounts s on s.user_id = u.id where u.id = auth.uid();

  insert into public.shifts(cashier_id, cashier_name, template_id, scheduled_start_at, scheduled_end_at, punctuality_status, punctuality_diff_minutes, opening_cash_egp)
  values (auth.uid(), v_name, p_template_id, v_local_start at time zone 'Africa/Cairo', v_local_end at time zone 'Africa/Cairo',
    case when v_diff < 0 then 'early' when v_diff <= v_template.grace_minutes then 'on_time' else 'late' end,
    v_diff, p_opening_cash) returning * into v_shift;
  return v_shift;
end $$;
revoke all on function public.open_cashier_shift(uuid, numeric) from public;
grant execute on function public.open_cashier_shift(uuid, numeric) to authenticated;

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
  select v_shift.opening_cash_egp + coalesce(sum(o.total_egp) filter (where o.payment_method = 'cash' and o.status not in ('cancelled', 'returned')), 0)
    into v_expected from public.orders o where o.shift_id = p_shift_id;

  if v_shift.scheduled_end_at is not null then
    v_diff := trunc(extract(epoch from (v_closed_at - v_shift.scheduled_end_at)) / 60)::integer;
  end if;
  update public.shifts set status = 'closed', closed_at = v_closed_at, expected_cash_egp = v_expected,
    actual_closing_cash_egp = p_actual_closing_cash, cash_variance_egp = p_actual_closing_cash - v_expected,
    checkout_diff_minutes = v_diff,
    checkout_status = case when v_diff is null then null when v_diff > v_grace then 'overtime' when v_diff < -v_grace then 'early_leave' else 'on_time' end,
    notes = nullif(trim(p_notes), '') where id = p_shift_id returning * into v_shift;
  return v_shift;
end $$;
revoke all on function public.close_cashier_shift(uuid, numeric, text) from public;
grant execute on function public.close_cashier_shift(uuid, numeric, text) to authenticated;

-- All-time owner-only totals for the cashier accountability summary.
create or replace function public.get_shift_accountability_summary()
returns table (cashier_id uuid, cashier_name text, total_late_minutes bigint, total_overtime_minutes bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_owner() then raise exception 'Owner access required'; end if;
  return query
    select s.cashier_id,
      coalesce(max(s.cashier_name), max(u.email), s.cashier_id::text),
      coalesce(sum(case when s.punctuality_status = 'late'
        then greatest(s.punctuality_diff_minutes - coalesce(st.grace_minutes, 0), 0) else 0 end), 0)::bigint,
      coalesce(sum(case when s.checkout_status = 'overtime'
        then greatest(s.checkout_diff_minutes, 0) else 0 end), 0)::bigint
    from public.shifts s
    left join public.shift_templates st on st.id = s.template_id
    left join auth.users u on u.id = s.cashier_id
    group by s.cashier_id;
end $$;
revoke all on function public.get_shift_accountability_summary() from public;
grant execute on function public.get_shift_accountability_summary() to authenticated;
