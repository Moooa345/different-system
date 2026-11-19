alter table public.product_variants
  add column if not exists image_url text;

grant update (image_url) on public.product_variants to authenticated;

create or replace function public.adjust_variant_stock_atomic(
  p_variant_id uuid,
  p_delta integer,
  p_reason text default 'manual_restock'
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stock integer;
  v_new_stock integer;
begin
  if not public.is_staff() then
    raise exception 'Staff access required';
  end if;
  if p_delta = 0 then
    raise exception 'Stock adjustment cannot be zero';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'Adjustment reason is required';
  end if;

  select stock_qty into v_stock
  from public.product_variants
  where id = p_variant_id
  for update;

  if not found then
    raise exception 'Variant not found';
  end if;

  v_new_stock := v_stock + p_delta;
  if v_new_stock < 0 then
    raise exception 'Insufficient stock for adjustment';
  end if;

  update public.product_variants
  set stock_qty = v_new_stock, updated_at = now()
  where id = p_variant_id;

  insert into public.stock_logs (variant_id, quantity_delta, reason, note, created_by)
  values (p_variant_id, p_delta, 'adjustment', btrim(p_reason), auth.uid());

  return v_new_stock;
end;
$$;

revoke all on function public.adjust_variant_stock_atomic(uuid, integer, text) from public;
grant execute on function public.adjust_variant_stock_atomic(uuid, integer, text) to authenticated;

-- Allow storefront visitors to read product photos and staff to upload/manage them.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Public read product images') then
    execute 'create policy "Public read product images" on storage.objects for select to anon, authenticated using (bucket_id = ''product-images'')';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Staff upload product images') then
    execute 'create policy "Staff upload product images" on storage.objects for insert to authenticated with check (bucket_id = ''product-images'' and public.is_staff())';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Staff update product images') then
    execute 'create policy "Staff update product images" on storage.objects for update to authenticated using (bucket_id = ''product-images'' and public.is_staff()) with check (bucket_id = ''product-images'' and public.is_staff())';
  end if;
end $$;
