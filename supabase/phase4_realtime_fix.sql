-- Broadcast only public stock fields; never serialize the full product_variants row.
create or replace function public.broadcast_storefront_stock_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.stock_qty is distinct from old.stock_qty
     or new.is_active is distinct from old.is_active then
    perform realtime.send(
      jsonb_build_object(
        'variant_id', new.id,
        'stock_qty', new.stock_qty,
        'is_active', new.is_active
      ),
      'stock_update',
      'storefront:stock',
      true
    );
  end if;
  return new;
end;
$$;

revoke all on function public.broadcast_storefront_stock_update() from public, anon, authenticated;

drop trigger if exists product_variants_storefront_stock_broadcast on public.product_variants;
create trigger product_variants_storefront_stock_broadcast
after update of stock_qty, is_active on public.product_variants
for each row execute function public.broadcast_storefront_stock_update();

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'realtime'
      and tablename = 'messages'
      and policyname = 'Public storefront stock broadcast read'
  ) then
    execute $policy$
      create policy "Public storefront stock broadcast read"
      on realtime.messages
      for select
      to anon, authenticated
      using (extension = 'broadcast' and topic = 'storefront:stock')
    $policy$;
  end if;
end;
$$;
