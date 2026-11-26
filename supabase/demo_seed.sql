begin;

-- Fixed IDs and the DEMO- SKU prefix are reserved for this seed.
do $$
declare
  v_product_ids uuid[] := array[
    'd1000000-0000-4000-8000-000000000001'::uuid, 'd1000000-0000-4000-8000-000000000002'::uuid,
    'd1000000-0000-4000-8000-000000000003'::uuid, 'd1000000-0000-4000-8000-000000000004'::uuid,
    'd1000000-0000-4000-8000-000000000005'::uuid, 'd1000000-0000-4000-8000-000000000006'::uuid,
    'd1000000-0000-4000-8000-000000000007'::uuid, 'd1000000-0000-4000-8000-000000000008'::uuid,
    'd1000000-0000-4000-8000-000000000009'::uuid, 'd1000000-0000-4000-8000-000000000010'::uuid,
    'd1000000-0000-4000-8000-000000000011'::uuid, 'd1000000-0000-4000-8000-000000000012'::uuid,
    'd1000000-0000-4000-8000-000000000013'::uuid, 'd1000000-0000-4000-8000-000000000014'::uuid,
    'd1000000-0000-4000-8000-000000000015'::uuid, 'd1000000-0000-4000-8000-000000000016'::uuid
  ];
begin
  if exists (
    select 1
    from public.products p
    where p.id = any(v_product_ids)
      and exists (
        select 1 from public.product_variants pv
        where pv.product_id = p.id
      )
      and not exists (
        select 1 from public.product_variants pv
        where pv.product_id = p.id and pv.sku like 'DEMO-%'
      )
  ) then
    raise exception 'A reserved demo product ID has variants without the DEMO- prefix';
  end if;
  if exists (
    select 1 from public.product_variants
    where sku like 'DEMO-%' and product_id <> all(v_product_ids)
  ) then raise exception 'The DEMO- SKU prefix is already used outside this demo seed'; end if;

  if exists (
    select 1 from public.product_variants pv
    where pv.product_id = any(v_product_ids)
      and pv.sku like 'DEMO-SHOE-%'
      and pv.sku !~ '^DEMO-SHOE-0[1-8]-(BLK|BGE|CAM|BRG|ESP|CHM|KSH|IVY|WHT)-(37|38|39|40|41)$'
      and (
        exists (select 1 from public.order_items oi where oi.variant_id = pv.id)
        or exists (select 1 from public.stock_logs sl where sl.variant_id = pv.id)
      )
  ) then raise exception 'Legacy demo shoe variants have order or stock history; seed was stopped without changes'; end if;
end;
$$;

insert into public.products
  (id, name, description, category, brand, image_url, image_urls, gallery_urls, style_tags, is_active, is_best_seller, compare_at_price)
values
  ('d1000000-0000-4000-8000-000000000001', 'شنطة أتيليه بهيكل أنيق', 'شنطة واسعة تحافظ على شكلها الأنيق، ومساحتها العملية تساع كل احتياجاتك في مشاوير اليوم.', 'bags', 'Gucci', 'https://cdn.dummyjson.com/product-images/womens-bags/blue-women''s-handbag/1.webp', array['https://cdn.dummyjson.com/product-images/womens-bags/blue-women''s-handbag/1.webp', 'https://cdn.dummyjson.com/product-images/womens-bags/blue-women''s-handbag/2.webp'], array['https://cdn.dummyjson.com/product-images/womens-bags/blue-women''s-handbag/2.webp'], array['جلد', 'عملي', 'كلاسيكي'], true, true, 3400),
  ('d1000000-0000-4000-8000-000000000002', 'شنطة الهلال كروس بودي', 'شنطة كروس بودي خفيفة بحزام عملي وتفاصيل ناعمة، تريحك في المشاوير وتكمل إطلالتك ببساطة.', 'bags', 'LV', 'https://cdn.dummyjson.com/product-images/womens-bags/heshe-women''s-leather-bag/1.webp', array['https://cdn.dummyjson.com/product-images/womens-bags/heshe-women''s-leather-bag/1.webp', 'https://cdn.dummyjson.com/product-images/womens-bags/heshe-women''s-leather-bag/2.webp'], array['https://cdn.dummyjson.com/product-images/womens-bags/heshe-women''s-leather-bag/2.webp'], array['كروس بودي', 'جلد', 'يومي'], true, true, null),
  ('d1000000-0000-4000-8000-000000000003', 'شنطة ميني بيد أنيقة', 'حجمها صغير وأنيق، لكن مساحتها تكفي أساسياتك؛ مناسبة للخروجات من أول اليوم لآخره.', 'bags', 'Dior', 'https://cdn.dummyjson.com/product-images/womens-bags/prada-women-bag/1.webp', array['https://cdn.dummyjson.com/product-images/womens-bags/prada-women-bag/1.webp', 'https://cdn.dummyjson.com/product-images/womens-bags/prada-women-bag/2.webp'], array['https://cdn.dummyjson.com/product-images/womens-bags/prada-women-bag/2.webp'], array['ميني', 'كلاسيكي', 'جلد'], true, false, null),
  ('d1000000-0000-4000-8000-000000000004', 'شنطة كتف واسعة للمشاوير', 'شنطة كتف بجلد ناعم وحجم مريح، تشيل احتياجاتك اليومية وتفضل مرتبة معاك طول اليوم.', 'bags', 'Miu Miu', 'https://cdn.dummyjson.com/product-images/womens-bags/white-faux-leather-backpack/1.webp', array['https://cdn.dummyjson.com/product-images/womens-bags/white-faux-leather-backpack/1.webp', 'https://cdn.dummyjson.com/product-images/womens-bags/white-faux-leather-backpack/2.webp'], array['https://cdn.dummyjson.com/product-images/womens-bags/white-faux-leather-backpack/2.webp'], array['كتف', 'يومي', 'جلد'], true, false, 2600),
  ('d1000000-0000-4000-8000-000000000005', 'شنطة كروس بودي بخطوط ناعمة', 'خطوطها بسيطة وحزامها عملي، فتتحركي براحة وتنسقيها بسهولة في كل مشوار.', 'bags', 'YSL', 'https://cdn.dummyjson.com/product-images/womens-bags/women-handbag-black/1.webp', array['https://cdn.dummyjson.com/product-images/womens-bags/women-handbag-black/1.webp', 'https://cdn.dummyjson.com/product-images/womens-bags/women-handbag-black/2.webp'], array['https://cdn.dummyjson.com/product-images/womens-bags/women-handbag-black/2.webp'], array['كروس بودي', 'ناعم', 'عملي'], true, true, null),
  ('d1000000-0000-4000-8000-000000000006', 'شنطة يد جلد كلاسيكية', 'جلد ناعم وتصميم كلاسيكي عملي؛ اختيار مناسب للشغل والمشاوير اليومية من غير تكلف.', 'bags', 'Gucci', 'https://cdn.dummyjson.com/product-images/womens-bags/blue-women''s-handbag/1.webp', array['https://cdn.dummyjson.com/product-images/womens-bags/blue-women''s-handbag/1.webp', 'https://cdn.dummyjson.com/product-images/womens-bags/blue-women''s-handbag/2.webp'], array['https://cdn.dummyjson.com/product-images/womens-bags/blue-women''s-handbag/2.webp'], array['كلاسيكي', 'جلد', 'عمل'], true, false, null),
  ('d1000000-0000-4000-8000-000000000007', 'شنطة سهرة جلدية أنيقة', 'خفيفة وتفاصيلها رقيقة، تكمل إطلالتك في المناسبات والخروجات المسائية.', 'bags', 'Dior', 'https://cdn.dummyjson.com/product-images/womens-bags/heshe-women''s-leather-bag/1.webp', array['https://cdn.dummyjson.com/product-images/womens-bags/heshe-women''s-leather-bag/1.webp', 'https://cdn.dummyjson.com/product-images/womens-bags/heshe-women''s-leather-bag/2.webp'], array['https://cdn.dummyjson.com/product-images/womens-bags/heshe-women''s-leather-bag/2.webp'], array['سهرة', 'أنيق', 'جلد'], true, false, null),
  ('d1000000-0000-4000-8000-000000000008', 'شنطة جلد بملمس ناعم', 'ملمسها ناعم ومساحتها واسعة، عملية ليومك وسهلة التنسيق مع لبس كتير.', 'bags', 'LV', 'https://cdn.dummyjson.com/product-images/womens-bags/prada-women-bag/1.webp', array['https://cdn.dummyjson.com/product-images/womens-bags/prada-women-bag/1.webp', 'https://cdn.dummyjson.com/product-images/womens-bags/prada-women-bag/2.webp'], array['https://cdn.dummyjson.com/product-images/womens-bags/prada-women-bag/2.webp'], array['جلد', 'واسع', 'يومي'], true, false, null),
  ('d1000000-0000-4000-8000-000000000009', 'سنيكرز جلدي مريح للمشاوير', 'سنيكرز جلد بخطوط بسيطة ونعل مريح، مناسب لحركتك اليومية وسهل التنسيق مع إطلالاتك.', 'sneakers', 'Miu Miu', 'https://cdn.dummyjson.com/product-images/womens-shoes/black-&-brown-slipper/1.webp', array['https://cdn.dummyjson.com/product-images/womens-shoes/black-&-brown-slipper/1.webp', 'https://cdn.dummyjson.com/product-images/womens-shoes/black-&-brown-slipper/2.webp'], array['https://cdn.dummyjson.com/product-images/womens-shoes/black-&-brown-slipper/2.webp'], array['سنيكرز', 'جلد', 'يومي'], true, true, null),
  ('d1000000-0000-4000-8000-000000000010', 'سنيكرز كلاسيك بستايل منخفض', 'تصميم منخفض وخامة متينة ونعل مريح؛ اختيار عملي للمشاوير الطويلة والحركة طول اليوم.', 'sneakers', 'YSL', 'https://cdn.dummyjson.com/product-images/womens-shoes/calvin-klein-heel-shoes/1.webp', array['https://cdn.dummyjson.com/product-images/womens-shoes/calvin-klein-heel-shoes/1.webp', 'https://cdn.dummyjson.com/product-images/womens-shoes/calvin-klein-heel-shoes/2.webp'], array['https://cdn.dummyjson.com/product-images/womens-shoes/calvin-klein-heel-shoes/2.webp'], array['رياضي', 'كلاسيكي', 'راحة'], true, false, 3100),
  ('d1000000-0000-4000-8000-000000000011', 'حذاء بكعب عريض للسهرات', 'كعب ثابت بتصميم أنثوي أنيق، يديكي إطلالة مرتبة وراحة أحسن في المناسبات والسهرات.', 'sneakers', 'Gucci', 'https://cdn.dummyjson.com/product-images/womens-shoes/golden-shoes-woman/1.webp', array['https://cdn.dummyjson.com/product-images/womens-shoes/golden-shoes-woman/1.webp', 'https://cdn.dummyjson.com/product-images/womens-shoes/golden-shoes-woman/2.webp'], array['https://cdn.dummyjson.com/product-images/womens-shoes/golden-shoes-woman/2.webp'], array['كعب', 'مناسبات', 'أنيق'], true, false, null),
  ('d1000000-0000-4000-8000-000000000012', 'سنيكرز منخفض بتصميم كلاسيكي', 'ستايل كلاسيكي ونعل مريح يخلي السنيكرز ده سهل مع إطلالاتك اليومية ومشاويرك.', 'sneakers', 'Dior', 'https://cdn.dummyjson.com/product-images/womens-shoes/pampi-shoes/1.webp', array['https://cdn.dummyjson.com/product-images/womens-shoes/pampi-shoes/1.webp', 'https://cdn.dummyjson.com/product-images/womens-shoes/pampi-shoes/2.webp'], array['https://cdn.dummyjson.com/product-images/womens-shoes/pampi-shoes/2.webp'], array['سنيكرز', 'كلاسيكي', 'يومي'], true, false, null),
  ('d1000000-0000-4000-8000-000000000013', 'سنيكرز جلد بتفاصيل متباينة', 'تفاصيله المتباينة تضيف لمسة عصرية، ونعلُه المريح يخليه مناسب للبس اليومي.', 'sneakers', 'LV', 'https://cdn.dummyjson.com/product-images/womens-shoes/red-shoes/1.webp', array['https://cdn.dummyjson.com/product-images/womens-shoes/red-shoes/1.webp', 'https://cdn.dummyjson.com/product-images/womens-shoes/red-shoes/2.webp'], array['https://cdn.dummyjson.com/product-images/womens-shoes/red-shoes/2.webp'], array['جلد', 'عصري', 'سنيكرز'], true, true, null),
  ('d1000000-0000-4000-8000-000000000014', 'سنيكرز سويد بألوان هادئة', 'خامة سويد ناعمة وألوان دافئة، لراحة وأناقة بسيطة في كل يوم.', 'sneakers', 'Miu Miu', 'https://cdn.dummyjson.com/product-images/womens-shoes/black-&-brown-slipper/1.webp', array['https://cdn.dummyjson.com/product-images/womens-shoes/black-&-brown-slipper/1.webp', 'https://cdn.dummyjson.com/product-images/womens-shoes/black-&-brown-slipper/2.webp'], array['https://cdn.dummyjson.com/product-images/womens-shoes/black-&-brown-slipper/2.webp'], array['سويد', 'كاجوال', 'سنيكرز'], true, false, null),
  ('d1000000-0000-4000-8000-000000000015', 'لوفر جلد أنيق ومريح', 'لوفر جلد بتصميم مرتب ونعل مريح، ينفع للشغل والخروجات ويكمل إطلالتك من غير مبالغة.', 'sneakers', 'YSL', 'https://cdn.dummyjson.com/product-images/womens-shoes/calvin-klein-heel-shoes/1.webp', array['https://cdn.dummyjson.com/product-images/womens-shoes/calvin-klein-heel-shoes/1.webp', 'https://cdn.dummyjson.com/product-images/womens-shoes/calvin-klein-heel-shoes/2.webp'], array['https://cdn.dummyjson.com/product-images/womens-shoes/calvin-klein-heel-shoes/2.webp'], array['لوفر', 'جلد', 'كلاسيكي'], true, false, null),
  ('d1000000-0000-4000-8000-000000000016', 'حذاء بكعب مدبب للمناسبات', 'مقدمة مدببة وكعب أنيق يضيفوا لمسة أنثوية مرتبة للمناسبات والخروجات المسائية.', 'sneakers', 'Gucci', 'https://cdn.dummyjson.com/product-images/womens-shoes/golden-shoes-woman/1.webp', array['https://cdn.dummyjson.com/product-images/womens-shoes/golden-shoes-woman/1.webp', 'https://cdn.dummyjson.com/product-images/womens-shoes/golden-shoes-woman/2.webp'], array['https://cdn.dummyjson.com/product-images/womens-shoes/golden-shoes-woman/2.webp'], array['كعب', 'مناسبات', 'أنيق'], true, false, 3350)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  brand = excluded.brand,
  is_best_seller = excluded.is_best_seller,
  compare_at_price = excluded.compare_at_price,
  image_url = excluded.image_url,
  image_urls = excluded.image_urls,
  gallery_urls = excluded.gallery_urls,
  style_tags = excluded.style_tags,
  is_active = excluded.is_active,
  updated_at = now();

-- Retire the single-color shoe variants from the previous 8-product demo seed,
-- but only when they have no historical order or stock records.
delete from public.product_variants pv
where pv.product_id in (
  'd1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000002',
  'd1000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000004',
  'd1000000-0000-4000-8000-000000000005', 'd1000000-0000-4000-8000-000000000006',
  'd1000000-0000-4000-8000-000000000007', 'd1000000-0000-4000-8000-000000000008',
  'd1000000-0000-4000-8000-000000000009', 'd1000000-0000-4000-8000-000000000010',
  'd1000000-0000-4000-8000-000000000011', 'd1000000-0000-4000-8000-000000000012',
  'd1000000-0000-4000-8000-000000000013', 'd1000000-0000-4000-8000-000000000014',
  'd1000000-0000-4000-8000-000000000015', 'd1000000-0000-4000-8000-000000000016'
)
and pv.sku like 'DEMO-SHOE-%'
and pv.sku !~ '^DEMO-SHOE-0[1-8]-(BLK|BGE|CAM|BRG|ESP|CHM|KSH|IVY|WHT)-(37|38|39|40|41)$';

with bag_variant_seed(product_id, sku, color, cost_price, sell_price, stock_qty, image_slot) as (
  values
    ('d1000000-0000-4000-8000-000000000001'::uuid, 'DEMO-BAG-01-BLK', 'أسود أوبسيديان', 1650::numeric, 2950::numeric, 7, 1),
    ('d1000000-0000-4000-8000-000000000001'::uuid, 'DEMO-BAG-01-BGE', 'بيج دافئ', 1650::numeric, 2950::numeric, 2, 2),
    ('d1000000-0000-4000-8000-000000000002'::uuid, 'DEMO-BAG-02-BLK', 'أسود أوبسيديان', 1450::numeric, 2650::numeric, 4, 1),
    ('d1000000-0000-4000-8000-000000000002'::uuid, 'DEMO-BAG-02-BRG', 'عنابي', 1450::numeric, 2650::numeric, 3, 2),
    ('d1000000-0000-4000-8000-000000000003'::uuid, 'DEMO-BAG-03-BLK', 'أسود أوبسيديان', 1050::numeric, 1950::numeric, 8, 1),
    ('d1000000-0000-4000-8000-000000000003'::uuid, 'DEMO-BAG-03-BGE', 'بيج دافئ', 1050::numeric, 1950::numeric, 5, 2),
    ('d1000000-0000-4000-8000-000000000004'::uuid, 'DEMO-BAG-04-ESP', 'بني إسبريسو', 1200::numeric, 2250::numeric, 2, 1),
    ('d1000000-0000-4000-8000-000000000004'::uuid, 'DEMO-BAG-04-CAM', 'جملي', 1200::numeric, 2250::numeric, 4, 2),
    ('d1000000-0000-4000-8000-000000000005'::uuid, 'DEMO-BAG-05-BLK', 'أسود أوبسيديان', 980::numeric, 1850::numeric, 5, 1),
    ('d1000000-0000-4000-8000-000000000005'::uuid, 'DEMO-BAG-05-ESP', 'بني إسبريسو', 980::numeric, 1850::numeric, 1, 2),
    ('d1000000-0000-4000-8000-000000000006'::uuid, 'DEMO-BAG-06-BLK', 'أسود أوبسيديان', 1350::numeric, 2450::numeric, 7, 1),
    ('d1000000-0000-4000-8000-000000000006'::uuid, 'DEMO-BAG-06-ESP', 'بني إسبريسو', 1350::numeric, 2450::numeric, 3, 2),
    ('d1000000-0000-4000-8000-000000000007'::uuid, 'DEMO-BAG-07-BRG', 'عنابي', 900::numeric, 1750::numeric, 4, 1),
    ('d1000000-0000-4000-8000-000000000007'::uuid, 'DEMO-BAG-07-IVY', 'أبيض عاجي', 900::numeric, 1750::numeric, 6, 2),
    ('d1000000-0000-4000-8000-000000000008'::uuid, 'DEMO-BAG-08-BLK', 'أسود أوبسيديان', 1280::numeric, 2350::numeric, 0, 1),
    ('d1000000-0000-4000-8000-000000000008'::uuid, 'DEMO-BAG-08-ESP', 'بني إسبريسو', 1280::numeric, 2350::numeric, 5, 2)
)
insert into public.product_variants (product_id, sku, color, size, image_url, unit_cost_price, unit_sell_price, stock_qty, is_active)
select b.product_id, b.sku, b.color, 'مقاس موحد',
       case when b.image_slot = 1 then p.image_url else p.gallery_urls[1] end,
       b.cost_price, b.sell_price, b.stock_qty, true
from bag_variant_seed b join public.products p on p.id = b.product_id
on conflict (sku) do update set
  color = excluded.color, size = excluded.size, image_url = excluded.image_url,
  unit_cost_price = excluded.unit_cost_price, unit_sell_price = excluded.unit_sell_price,
  is_active = excluded.is_active, updated_at = now();

with shoe_color_seed(product_id, sku_prefix, color_code, color, cost_price, sell_price, image_slot, stock_levels) as (
  values
    ('d1000000-0000-4000-8000-000000000009'::uuid, 'DEMO-SHOE-01', 'BLK', 'أسود أوبسيديان', 1320::numeric, 2450::numeric, 1, array[5, 7, 8, 4, 3]),
    ('d1000000-0000-4000-8000-000000000009'::uuid, 'DEMO-SHOE-01', 'IVY', 'أبيض عاجي', 1320::numeric, 2450::numeric, 2, array[6, 4, 2, 5, 7]),
    ('d1000000-0000-4000-8000-000000000010'::uuid, 'DEMO-SHOE-02', 'BLK', 'أسود أوبسيديان', 1480::numeric, 2750::numeric, 1, array[6, 7, 4, 5, 3]),
    ('d1000000-0000-4000-8000-000000000010'::uuid, 'DEMO-SHOE-02', 'IVY', 'أبيض عاجي', 1480::numeric, 2750::numeric, 2, array[5, 3, 6, 4, 7]),
    ('d1000000-0000-4000-8000-000000000011'::uuid, 'DEMO-SHOE-03', 'BRG', 'عنابي', 1590::numeric, 2850::numeric, 1, array[4, 6, 5, 3, 4]),
    ('d1000000-0000-4000-8000-000000000011'::uuid, 'DEMO-SHOE-03', 'BLK', 'أسود أوبسيديان', 1590::numeric, 2850::numeric, 2, array[5, 2, 0, 6, 3]),
    ('d1000000-0000-4000-8000-000000000012'::uuid, 'DEMO-SHOE-04', 'BLK', 'أسود أوبسيديان', 1320::numeric, 2450::numeric, 1, array[5, 7, 8, 4, 3]),
    ('d1000000-0000-4000-8000-000000000012'::uuid, 'DEMO-SHOE-04', 'IVY', 'أبيض عاجي', 1320::numeric, 2450::numeric, 2, array[6, 4, 2, 5, 7]),
    ('d1000000-0000-4000-8000-000000000013'::uuid, 'DEMO-SHOE-05', 'BLK', 'أسود أوبسيديان', 1480::numeric, 2750::numeric, 1, array[6, 7, 4, 5, 3]),
    ('d1000000-0000-4000-8000-000000000013'::uuid, 'DEMO-SHOE-05', 'IVY', 'أبيض عاجي', 1480::numeric, 2750::numeric, 2, array[5, 3, 6, 4, 7]),
    ('d1000000-0000-4000-8000-000000000014'::uuid, 'DEMO-SHOE-06', 'KSH', 'كشمير', 1420::numeric, 2550::numeric, 1, array[4, 6, 5, 3, 4]),
    ('d1000000-0000-4000-8000-000000000014'::uuid, 'DEMO-SHOE-06', 'BRG', 'عنابي', 1420::numeric, 2550::numeric, 2, array[5, 2, 0, 6, 3]),
    ('d1000000-0000-4000-8000-000000000015'::uuid, 'DEMO-SHOE-07', 'ESP', 'بني إسبريسو', 1360::numeric, 2490::numeric, 1, array[5, 6, 4, 3, 2]),
    ('d1000000-0000-4000-8000-000000000015'::uuid, 'DEMO-SHOE-07', 'BLK', 'أسود أوبسيديان', 1360::numeric, 2490::numeric, 2, array[4, 7, 5, 6, 3]),
    ('d1000000-0000-4000-8000-000000000016'::uuid, 'DEMO-SHOE-08', 'BEG', 'بيج دافئ', 1620::numeric, 2950::numeric, 1, array[5, 4, 6, 2, 3]),
    ('d1000000-0000-4000-8000-000000000016'::uuid, 'DEMO-SHOE-08', 'BLK', 'أسود أوبسيديان', 1620::numeric, 2950::numeric, 2, array[7, 5, 4, 6, 2])), shoe_variants as (
  select s.product_id, s.sku_prefix || '-' || s.color_code || '-' || sz.size_sku as sku,
         s.color, sz.size, s.cost_price, s.sell_price, sz.stock_qty, s.image_slot
  from shoe_color_seed s
  cross join lateral unnest(array['37','38','39','40','41']::text[], array['٣٧','٣٨','٣٩','٤٠','٤١']::text[], s.stock_levels) as sz(size_sku, size, stock_qty)
)
insert into public.product_variants (product_id, sku, color, size, image_url, unit_cost_price, unit_sell_price, stock_qty, is_active)
select v.product_id, v.sku, v.color, v.size,
       case when v.image_slot = 1 then p.image_url else p.gallery_urls[1] end,
       v.cost_price, v.sell_price, v.stock_qty, true
from shoe_variants v join public.products p on p.id = v.product_id
on conflict (sku) do update set
  color = excluded.color, size = excluded.size, image_url = excluded.image_url,
  unit_cost_price = excluded.unit_cost_price, unit_sell_price = excluded.unit_sell_price,
  is_active = excluded.is_active, updated_at = now();

commit;
 