alter table public.products
  add column if not exists image_url text,
  add column if not exists gallery_urls text[] not null default '{}';

-- Preserve existing product photos: promote the first legacy image and keep the rest in the gallery.
update public.products
set image_url = coalesce(image_url, image_urls[1]),
    gallery_urls = case
      when cardinality(gallery_urls) = 0 then coalesce(array_remove(image_urls, coalesce(image_url, image_urls[1])), '{}')
      else gallery_urls
    end
where cardinality(image_urls) > 0;

-- Keep anonymous product reads column-scoped, matching the style_tags grant pattern.
grant select (image_url, gallery_urls) on public.products to anon, authenticated;
grant select on public.products to authenticated;
