-- Product merchandising metadata used by the admin form and public storefront.
alter table public.products
  add column if not exists brand text,
  add column if not exists is_best_seller boolean not null default false,
  add column if not exists compare_at_price numeric;

create index if not exists products_brand_idx on public.products (brand);

-- Keep anonymous access scoped to the active public catalog columns.
grant select (brand, is_best_seller, compare_at_price) on public.products to anon, authenticated;
