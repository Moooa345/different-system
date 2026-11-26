create or replace function public.delete_staff_account_safe(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_target public.staff_accounts%rowtype;
begin
  if not public.is_owner() then raise exception 'Owner access required'; end if;
  if p_user_id is null then raise exception 'Staff account is required'; end if;

  perform pg_advisory_xact_lock(hashtext('different-store-staff-owner-guard'));
  select * into v_target from public.staff_accounts s where s.user_id = p_user_id for update;
  if not found then raise exception 'Staff account not found'; end if;

  if v_target.user_id = auth.uid() then raise exception 'Cannot delete own staff account'; end if;
  if v_target.role = 'owner' and v_target.is_active
     and (select count(*) from public.staff_accounts s where s.role = 'owner' and s.is_active) <= 1 then
    raise exception 'Cannot delete the last active owner';
  end if;

  if exists (select 1 from public.shifts s where s.cashier_id = p_user_id)
     or exists (select 1 from public.orders o where o.cashier_id = p_user_id or o.created_by = p_user_id) then
    raise exception 'Cannot delete staff account with sales or shift history';
  end if;

  delete from public.staff_accounts where user_id = p_user_id;
end $$;

revoke all on function public.delete_staff_account_safe(uuid) from public, anon;
grant execute on function public.delete_staff_account_safe(uuid) to authenticated;
revoke insert, update, delete on public.staff_accounts from authenticated;
grant select on public.staff_accounts to authenticated;

-- Serialize shift creation against safe deletion so an account cannot gain history mid-delete.
create or replace function public.validate_shift_staff_account()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('different-store-staff-owner-guard'));
  if not exists (
    select 1 from public.staff_accounts s
    where s.user_id = new.cashier_id and s.is_active and s.role in ('owner', 'cashier')
  ) then
    raise exception 'Active staff account required to start a shift';
  end if;
  return new;
end $$;

drop trigger if exists validate_shift_staff_account_before_insert on public.shifts;
create trigger validate_shift_staff_account_before_insert
before insert on public.shifts
for each row execute function public.validate_shift_staff_account();
