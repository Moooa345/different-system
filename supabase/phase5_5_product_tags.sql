alter table public.products
  add column if not exists style_tags text[] not null default '{}';

create index if not exists products_style_tags_gin_idx
  on public.products using gin (style_tags);

-- The products table has public catalog fields only, but keep the anon column
-- grant explicit so future staff-only fields cannot be exposed by SELECT *.
revoke select on public.products from public, anon;
grant select (id, name, description, category, brand, image_urls, style_tags, is_active, created_at, updated_at)
  on public.products to anon;
grant select on public.products to authenticated;
