-- Broadcast only the product identifier and public availability state.
create or replace function public.broadcast_storefront_product_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_active is distinct from old.is_active then
    perform realtime.send(
      jsonb_build_object(
        'product_id', new.id,
        'is_active', new.is_active
      ),
      'product_status',
      'storefront:stock',
      true
    );
  end if;
  return new;
end;
$$;

revoke all on function public.broadcast_storefront_product_status() from public, anon, authenticated;

drop trigger if exists products_storefront_status_broadcast on public.products;
create trigger products_storefront_status_broadcast
after update of is_active on public.products
for each row execute function public.broadcast_storefront_product_status();