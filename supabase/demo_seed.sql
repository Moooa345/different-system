begin;

-- Reserve these deterministic product IDs and the DEMO- SKU prefix for this seed.
do $$
declare
  v_product_ids uuid[] := array[
    'd1000000-0000-4000-8000-000000000001'::uuid,
    'd1000000-0000-4000-8000-000000000002'::uuid,
    'd1000000-0000-4000-8000-000000000003'::uuid,
    'd1000000-0000-4000-8000-000000000004'::uuid,
    'd1000000-0000-4000-8000-000000000005'::uuid,
    'd1000000-0000-4000-8000-000000000006'::uuid,
    'd1000000-0000-4000-8000-000000000007'::uuid,
    'd1000000-0000-4000-8000-000000000008'::uuid
  ];
begin
  if exists (
    select 1
    from public.products p
    join (values
      ('d1000000-0000-4000-8000-000000000001'::uuid, 'The Atelier Structured Tote'::text),
      ('d1000000-0000-4000-8000-000000000002'::uuid, 'The Crescent Shoulder Bag'::text),
      ('d1000000-0000-4000-8000-000000000003'::uuid, 'The Mini Saffiano Crossbody'::text),
      ('d1000000-0000-4000-8000-000000000004'::uuid, 'The Soft Hobo Bag'::text),
      ('d1000000-0000-4000-8000-000000000005'::uuid, 'The Court Low-Top Sneaker'::text),
      ('d1000000-0000-4000-8000-000000000006'::uuid, 'The Classic Leather Loafer'::text),
      ('d1000000-0000-4000-8000-000000000007'::uuid, 'The Everyday Suede Trainer'::text),
      ('d1000000-0000-4000-8000-000000000008'::uuid, 'The Sculpted City Heel'::text)
    ) expected(id, name) on expected.id = p.id
    where p.name <> expected.name
  ) then raise exception 'A reserved demo product ID is already used by a different product'; end if;

  if exists (
    select 1 from public.product_variants
    where sku like 'DEMO-%' and product_id <> all(v_product_ids)
  ) then raise exception 'The DEMO- SKU prefix is already used outside this demo seed'; end if;
end;
$$;

insert into public.products
  (id, name, description, category, brand, image_url, gallery_urls, style_tags, is_active)
values
  ('d1000000-0000-4000-8000-000000000001', 'The Atelier Structured Tote', 'A refined everyday tote in softly grained leather, finished with a structured silhouette and considered interior pockets.', 'bags', 'Different Store', 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=1200&q=85', array['https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&w=1200&q=85', 'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=1200&q=85'], array['Leather', 'Daily', 'Classic'], true),
  ('d1000000-0000-4000-8000-000000000002', 'The Crescent Shoulder Bag', 'A softly curved shoulder bag with a clean profile, adjustable strap, and an understated polished clasp.', 'bags', 'Different Store', 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&w=1200&q=85', array['https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=1200&q=85', 'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=1200&q=85'], array['Leather', 'Classic', 'Daily'], true),
  ('d1000000-0000-4000-8000-000000000003', 'The Mini Saffiano Crossbody', 'A compact crossbody crafted for light days and evenings, with a neat zip closure and detachable strap.', 'bags', 'Different Store', 'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=1200&q=85', array['https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&w=1200&q=85', 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=1200&q=85'], array['Crossbody', 'Classic', 'Daily'], true),
  ('d1000000-0000-4000-8000-000000000004', 'The Soft Hobo Bag', 'A relaxed, generously sized hobo with a supple finish and an easy shoulder carry for everyday essentials.', 'bags', 'Different Store', 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=1200&q=85', array['https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=1200&q=85', 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&w=1200&q=85'], array['Leather', 'Daily', 'Casual'], true),
  ('d1000000-0000-4000-8000-000000000005', 'The Court Low-Top Sneaker', 'A minimal leather low-top with a cushioned insole, tonal stitching, and a versatile city-ready shape.', 'sneakers', 'Different Store', 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=85', array['https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=1200&q=85', 'https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?auto=format&fit=crop&w=1200&q=85'], array['Leather', 'Classic', 'Daily'], true),
  ('d1000000-0000-4000-8000-000000000006', 'The Classic Leather Loafer', 'A polished slip-on loafer with a softly cushioned footbed and a timeless low-profile sole.', 'sneakers', 'Different Store', 'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?auto=format&fit=crop&w=1200&q=85', array['https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=1200&q=85', 'https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?auto=format&fit=crop&w=1200&q=85'], array['Leather', 'Classic', 'Office'], true),
  ('d1000000-0000-4000-8000-000000000007', 'The Everyday Suede Trainer', 'A lightweight suede trainer with a flexible sole and subtle contrast details for comfortable daily wear.', 'sneakers', 'Different Store', 'https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=1200&q=85', array['https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?auto=format&fit=crop&w=1200&q=85', 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=85'], array['Suede', 'Casual', 'Daily'], true),
  ('d1000000-0000-4000-8000-000000000008', 'The Sculpted City Heel', 'An elegant closed-toe heel with a stable sculpted heel and a softly padded lining for day-to-evening wear.', 'sneakers', 'Different Store', 'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?auto=format&fit=crop&w=1200&q=85', array['https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?auto=format&fit=crop&w=1200&q=85', 'https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=1200&q=85'], array['Classic', 'Office', 'Daily'], true)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  brand = excluded.brand,
  image_url = excluded.image_url,
  gallery_urls = excluded.gallery_urls,
  style_tags = excluded.style_tags,
  is_active = excluded.is_active,
  updated_at = now();

insert into public.product_variants
  (product_id, sku, color, size, unit_cost_price, unit_sell_price, stock_qty, is_active)
values
  ('d1000000-0000-4000-8000-000000000001', 'DEMO-BAG-01-BLK', 'Obsidian Black', 'One Size', 1500, 2850, 7, true),
  ('d1000000-0000-4000-8000-000000000001', 'DEMO-BAG-01-BGE', 'Warm Beige', 'One Size', 1500, 2850, 2, true),
  ('d1000000-0000-4000-8000-000000000002', 'DEMO-BAG-02-ESP', 'Espresso', 'One Size', 1250, 2350, 5, true),
  ('d1000000-0000-4000-8000-000000000002', 'DEMO-BAG-02-BRG', 'Burgundy', 'One Size', 1250, 2350, 1, true),
  ('d1000000-0000-4000-8000-000000000003', 'DEMO-BAG-03-CHM', 'Champagne', 'One Size', 950, 1750, 3, true),
  ('d1000000-0000-4000-8000-000000000003', 'DEMO-BAG-03-BLK', 'Obsidian Black', 'One Size', 950, 1750, 4, true),
  ('d1000000-0000-4000-8000-000000000004', 'DEMO-BAG-04-BGE', 'Warm Beige', 'One Size', 1150, 2150, 6, true),
  ('d1000000-0000-4000-8000-000000000004', 'DEMO-BAG-04-ESP', 'Espresso', 'One Size', 1150, 2150, 0, true),
  ('d1000000-0000-4000-8000-000000000005', 'DEMO-SHOE-01-37', 'Obsidian Black', '37', 1300, 2450, 3, true),
  ('d1000000-0000-4000-8000-000000000005', 'DEMO-SHOE-01-38', 'Obsidian Black', '38', 1300, 2450, 6, true),
  ('d1000000-0000-4000-8000-000000000005', 'DEMO-SHOE-01-39', 'Obsidian Black', '39', 1300, 2450, 8, true),
  ('d1000000-0000-4000-8000-000000000005', 'DEMO-SHOE-01-40', 'Obsidian Black', '40', 1300, 2450, 5, true),
  ('d1000000-0000-4000-8000-000000000005', 'DEMO-SHOE-01-41', 'Obsidian Black', '41', 1300, 2450, 2, true),
  ('d1000000-0000-4000-8000-000000000006', 'DEMO-SHOE-02-37', 'Espresso', '37', 1550, 2850, 3, true),
  ('d1000000-0000-4000-8000-000000000006', 'DEMO-SHOE-02-38', 'Espresso', '38', 1550, 2850, 4, true),
  ('d1000000-0000-4000-8000-000000000006', 'DEMO-SHOE-02-39', 'Espresso', '39', 1550, 2850, 5, true),
  ('d1000000-0000-4000-8000-000000000006', 'DEMO-SHOE-02-40', 'Espresso', '40', 1550, 2850, 4, true),
  ('d1000000-0000-4000-8000-000000000006', 'DEMO-SHOE-02-41', 'Espresso', '41', 1550, 2850, 2, true),
  ('d1000000-0000-4000-8000-000000000007', 'DEMO-SHOE-03-37', 'Warm Beige', '37', 1200, 2250, 5, true),
  ('d1000000-0000-4000-8000-000000000007', 'DEMO-SHOE-03-38', 'Warm Beige', '38', 1200, 2250, 2, true),
  ('d1000000-0000-4000-8000-000000000007', 'DEMO-SHOE-03-39', 'Warm Beige', '39', 1200, 2250, 6, true),
  ('d1000000-0000-4000-8000-000000000007', 'DEMO-SHOE-03-40', 'Warm Beige', '40', 1200, 2250, 0, true),
  ('d1000000-0000-4000-8000-000000000007', 'DEMO-SHOE-03-41', 'Warm Beige', '41', 1200, 2250, 4, true),
  ('d1000000-0000-4000-8000-000000000008', 'DEMO-SHOE-04-37', 'Burgundy', '37', 1400, 2550, 4, true),
  ('d1000000-0000-4000-8000-000000000008', 'DEMO-SHOE-04-38', 'Burgundy', '38', 1400, 2550, 3, true),
  ('d1000000-0000-4000-8000-000000000008', 'DEMO-SHOE-04-39', 'Burgundy', '39', 1400, 2550, 4, true),
  ('d1000000-0000-4000-8000-000000000008', 'DEMO-SHOE-04-40', 'Burgundy', '40', 1400, 2550, 2, true),
  ('d1000000-0000-4000-8000-000000000008', 'DEMO-SHOE-04-41', 'Burgundy', '41', 1400, 2550, 5, true)
on conflict (sku) do update set
  color = excluded.color,
  size = excluded.size,
  unit_cost_price = excluded.unit_cost_price,
  unit_sell_price = excluded.unit_sell_price,
  is_active = excluded.is_active,
  updated_at = now();

commit;
