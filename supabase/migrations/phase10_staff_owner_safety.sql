-- Serialize owner-role changes so concurrent requests cannot remove the final active owner.
create or replace function public.assign_staff_role(p_email text, p_role text, p_display_name text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid;
  v_target public.staff_accounts%rowtype;
begin
  if not public.is_owner() then raise exception 'Owner access required'; end if;
  if p_role not in ('owner', 'cashier') then raise exception 'Invalid staff role'; end if;

  perform pg_advisory_xact_lock(hashtext('different-store-staff-owner-guard'));
  select u.id into v_user_id from auth.users u where lower(u.email) = lower(trim(p_email));
  if v_user_id is null then raise exception 'Auth user email not found'; end if;
  select * into v_target from public.staff_accounts s where s.user_id = v_user_id for update;

  if v_target.user_id = auth.uid() and v_target.role = 'owner' and p_role <> 'owner' then
    raise exception 'Cannot downgrade own owner account';
  end if;
  if v_target.user_id is not null and v_target.role = 'owner' and v_target.is_active and p_role <> 'owner'
     and (select count(*) from public.staff_accounts s where s.role = 'owner' and s.is_active) <= 1 then
    raise exception 'Cannot change the last active owner role';
  end if;

  insert into public.staff_accounts(user_id, email, role, display_name, is_active)
  values (v_user_id, lower(trim(p_email)), p_role, nullif(trim(p_display_name), ''), true)
  on conflict (user_id) do update
    set email = excluded.email, role = excluded.role, display_name = excluded.display_name, is_active = true, updated_at = now();
  return v_user_id;
end $$;

create or replace function public.set_staff_account_active(p_user_id uuid, p_is_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_target public.staff_accounts%rowtype;
begin
  if not public.is_owner() then raise exception 'Owner access required'; end if;
  if p_user_id is null or p_is_active is null then raise exception 'Staff account and active state are required'; end if;

  perform pg_advisory_xact_lock(hashtext('different-store-staff-owner-guard'));
  select * into v_target from public.staff_accounts s where s.user_id = p_user_id for update;
  if not found then raise exception 'Staff account not found'; end if;

  if v_target.user_id = auth.uid() and v_target.is_active and not p_is_active then
    raise exception 'Cannot deactivate own staff account';
  end if;
  if v_target.role = 'owner' and v_target.is_active and not p_is_active
     and (select count(*) from public.staff_accounts s where s.role = 'owner' and s.is_active) <= 1 then
    raise exception 'Cannot deactivate the last active owner';
  end if;

  update public.staff_accounts set is_active = p_is_active, updated_at = now() where user_id = p_user_id;
end $$;

revoke all on function public.assign_staff_role(text, text, text) from public, anon;
grant execute on function public.assign_staff_role(text, text, text) to authenticated;
revoke all on function public.set_staff_account_active(uuid, boolean) from public, anon;
grant execute on function public.set_staff_account_active(uuid, boolean) to authenticated;

-- Staff records are changed through guarded SECURITY DEFINER RPCs only.
revoke insert, update, delete on public.staff_accounts from authenticated;
grant select on public.staff_accounts to authenticated;
