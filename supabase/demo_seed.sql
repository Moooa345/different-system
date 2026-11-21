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
    select 1 from public.products p
    where p.id = any(v_product_ids)
      and not exists (
        select 1 from (values
          ('d1000000-0000-4000-8000-000000000001'::uuid, 'The Atelier Structured Tote'::text),
          ('d1000000-0000-4000-8000-000000000001'::uuid, 'حقيبة أتيليه المهيكلة'::text),
          ('d1000000-0000-4000-8000-000000000002'::uuid, 'The Crescent Shoulder Bag'::text),
          ('d1000000-0000-4000-8000-000000000002'::uuid, 'حقيبة الهلال كروس بودي'::text),
          ('d1000000-0000-4000-8000-000000000003'::uuid, 'The Mini Saffiano Crossbody'::text),
          ('d1000000-0000-4000-8000-000000000003'::uuid, 'حقيبة ميني بيد أنيقة'::text),
          ('d1000000-0000-4000-8000-000000000004'::uuid, 'The Soft Hobo Bag'::text),
          ('d1000000-0000-4000-8000-000000000004'::uuid, 'حقيبة كتف يومية'::text),
          ('d1000000-0000-4000-8000-000000000005'::uuid, 'The Court Low-Top Sneaker'::text),
          ('d1000000-0000-4000-8000-000000000005'::uuid, 'حقيبة كروس بودي ناعمة'::text),
          ('d1000000-0000-4000-8000-000000000006'::uuid, 'The Classic Leather Loafer'::text),
          ('d1000000-0000-4000-8000-000000000006'::uuid, 'حقيبة يد جلدية كلاسيكية'::text),
          ('d1000000-0000-4000-8000-000000000007'::uuid, 'The Everyday Suede Trainer'::text),
          ('d1000000-0000-4000-8000-000000000007'::uuid, 'حقيبة سهرة جلدية'::text),
          ('d1000000-0000-4000-8000-000000000008'::uuid, 'The Sculpted City Heel'::text),
          ('d1000000-0000-4000-8000-000000000008'::uuid, 'حقيبة جلدية بقوام ناعم'::text),
          ('d1000000-0000-4000-8000-000000000009'::uuid, 'حذاء سنيكرز جلدي للمدينة'::text),
          ('d1000000-0000-4000-8000-000000000010'::uuid, 'حذاء رياضي منخفض كلاسيكي'::text),
          ('d1000000-0000-4000-8000-000000000011'::uuid, 'حذاء بكعب عريض للمساء'::text),
          ('d1000000-0000-4000-8000-000000000012'::uuid, 'حذاء سنيكرز منخفض كلاسيكي'::text),
          ('d1000000-0000-4000-8000-000000000013'::uuid, 'حذاء سنيكرز جلد أبيض وأسود'::text),
          ('d1000000-0000-4000-8000-000000000014'::uuid, 'حذاء سنيكرز سويد بإطلالة هادئة'::text),
          ('d1000000-0000-4000-8000-000000000015'::uuid, 'حذاء لوفر جلدي أنيق'::text),
          ('d1000000-0000-4000-8000-000000000016'::uuid, 'حذاء بكعب مدبب للمناسبات'::text)
        ) expected(id, name)
        where expected.id = p.id and expected.name = p.name
      )
  ) then raise exception 'A reserved demo product ID is already used by a different product'; end if;

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
  (id, name, description, category, brand, image_url, gallery_urls, style_tags, is_active)
values
  ('d1000000-0000-4000-8000-000000000001', 'حقيبة أتيليه المهيكلة', 'حقيبة واسعة بتصميم أنيق يحافظ على شكله، ومساحة عملية ترتب احتياجاتك اليومية بسهولة.', 'bags', 'Different Store', 'https://unsplash.com/photos/black-leather-tote-bag-TK-rrTgYqzo/download?force=true&fm=jpg&w=1200', array['https://unsplash.com/photos/beige-tote-bag-on-bench-kGDKrhFnXIM/download?force=true&fm=jpg&w=1200'], array['جلد', 'عملي', 'كلاسيكي'], true),
  ('d1000000-0000-4000-8000-000000000002', 'حقيبة الهلال كروس بودي', 'تصميم كروس بودي مريح بلمسة ناعمة، يناسب المشاوير اليومية ويحافظ على أناقة التفاصيل.', 'bags', 'Different Store', 'https://unsplash.com/photos/black-leather-crossbody-bag-2fNMdA6a5ck/download?force=true&fm=jpg&w=1200', array['https://unsplash.com/photos/woman-wearing-red-leather-crossbody-bag-qNPESem_t4I/download?force=true&fm=jpg&w=1200'], array['كروس بودي', 'جلد', 'يومي'], true),
  ('d1000000-0000-4000-8000-000000000003', 'حقيبة ميني بيد أنيقة', 'حقيبة صغيرة بتفاصيل مرتبة ومساحة مناسبة للأساسيات، لإطلالة أنيقة من الصباح حتى المساء.', 'bags', 'Different Store', 'https://unsplash.com/photos/black-leather-handbag-on-white-table-MMFG3u7lh9M/download?force=true&fm=jpg&w=1200', array['https://unsplash.com/photos/beige-michael-kors-leather-handbag-FskOHt3xuig/download?force=true&fm=jpg&w=1200'], array['ميني', 'كلاسيكي', 'جلد'], true),
  ('d1000000-0000-4000-8000-000000000004', 'حقيبة كتف يومية', 'حقيبة كتف عملية بجلد ناعم وحجم متوازن، تجمع بين الراحة والشكل المرتب طوال اليوم.', 'bags', 'Different Store', 'https://unsplash.com/photos/woman-in-brown-leather-shoulder-bag-EtyuHwCSsn0/download?force=true&fm=jpg&w=1200', array['https://unsplash.com/photos/woman-in-beige-long-sleeve-shirt-and-brown-leather-shoulder-bag-O7QsU-akDD4/download?force=true&fm=jpg&w=1200'], array['كتف', 'يومي', 'جلد'], true),
  ('d1000000-0000-4000-8000-000000000005', 'حقيبة كروس بودي ناعمة', 'حقيبة كروس بودي بخطوط بسيطة وحزام عملي، تمنحك حرية الحركة وأناقة سهلة في كل مشوار.', 'bags', 'Different Store', 'https://unsplash.com/photos/black-leather-sling-bag-hanged-on-white-wall-E41nBWByyz8/download?force=true&fm=jpg&w=1200', array['https://unsplash.com/photos/brown-leather-sling-bag-on-white-background-xzrJCS4grC4/download?force=true&fm=jpg&w=1200'], array['كروس بودي', 'ناعم', 'عملي'], true),
  ('d1000000-0000-4000-8000-000000000006', 'حقيبة يد جلدية كلاسيكية', 'حقيبة جلدية أنيقة بتصميم عملي ولمسة كلاسيكية، تكمل إطلالات العمل والمشاوير اليومية.', 'bags', 'Different Store', 'https://unsplash.com/photos/a-black-leather-bag-9tJQGv8H2is/download?force=true&fm=jpg&w=1200', array['https://unsplash.com/photos/brown-leather-handbag-on-white-surface-tcVH_BwHtrc/download?force=true&fm=jpg&w=1200'], array['كلاسيكي', 'جلد', 'عمل'], true),
  ('d1000000-0000-4000-8000-000000000007', 'حقيبة سهرة جلدية', 'حقيبة أنيقة بحجم خفيف وتفاصيل ناعمة، خيار مميز للمناسبات والإطلالات المسائية.', 'bags', 'Different Store', 'https://unsplash.com/photos/red-leather-handbag-on-white-table-oCXVxwTFwqE/download?force=true&fm=jpg&w=1200', array['https://unsplash.com/photos/white-leather-handbag-on-white-surface-Zha2jqwxzMY/download?force=true&fm=jpg&w=1200'], array['سهرة', 'أنيق', 'جلد'], true),
  ('d1000000-0000-4000-8000-000000000008', 'حقيبة جلدية بقوام ناعم', 'حقيبة واسعة بملمس جلدي ناعم وسعة مناسبة، لترافقك في يومك بتصميم هادئ وسهل التنسيق.', 'bags', 'Different Store', 'https://unsplash.com/photos/a-black-leather-duffel-bag-rests-against-a-white-wall-dfBa1wgTqKc/download?force=true&fm=jpg&w=1200', array['https://unsplash.com/photos/a-brown-leather-handbag-rests-on-a-wooden-surface-_doTxp9AS4w/download?force=true&fm=jpg&w=1200'], array['جلد', 'واسع', 'يومي'], true),
  ('d1000000-0000-4000-8000-000000000009', 'حذاء سنيكرز جلدي للمدينة', 'سنيكرز جلدي بخطوط نظيفة ونعل مريح، يناسب الحركة اليومية ويكمل إطلالاتك بسهولة.', 'sneakers', 'Different Store', 'https://unsplash.com/photos/black-leather-sneaker-on-white-desk-PqbL_mxmaUE/download?force=true&fm=jpg&w=1200', array['https://unsplash.com/photos/person-wearing-white-leather-shoes-3GRO5BCcKgI/download?force=true&fm=jpg&w=1200'], array['سنيكرز', 'جلد', 'يومي'], true),
  ('d1000000-0000-4000-8000-000000000010', 'حذاء رياضي منخفض كلاسيكي', 'حذاء رياضي منخفض بتصميم متوازن وخامة متينة، خيار عملي للمشاوير الطويلة.', 'sneakers', 'Different Store', 'https://unsplash.com/photos/pair-of-black-low-top-sneakers-VtXifuzWbAY/download?force=true&fm=jpg&w=1200', array['https://unsplash.com/photos/white-nike-low-top-sneakers-jVerIoX3y7c/download?force=true&fm=jpg&w=1200'], array['رياضي', 'كلاسيكي', 'راحة'], true),
  ('d1000000-0000-4000-8000-000000000011', 'حذاء بكعب عريض للمساء', 'كعب أنيق وثابت بتصميم أنثوي، يمنحك راحة وأناقة في المناسبات والسهرات.', 'sneakers', 'Different Store', 'https://unsplash.com/photos/woman-standing-on-tiled-floor-XuFNKdw0zgE/download?force=true&fm=jpg&w=1200', array['https://unsplash.com/photos/a-pair-of-black-high-heeled-shoes-on-a-white-surface-fVMV0teyDnA/download?force=true&fm=jpg&w=1200'], array['كعب', 'مناسبات', 'أنيق'], true),
  ('d1000000-0000-4000-8000-000000000012', 'حذاء سنيكرز منخفض كلاسيكي', 'سنيكرز منخفض بخطوط كلاسيكية ونعل مريح، سهل التنسيق مع إطلالاتك اليومية.', 'sneakers', 'Different Store', 'https://unsplash.com/photos/black-low-top-sneakers-ybcuIk4zFlI/download?force=true&fm=jpg&w=1200', array['https://unsplash.com/photos/pair-of-white-low-top-sneakers-SQHcsZplFHI/download?force=true&fm=jpg&w=1200'], array['سنيكرز', 'كلاسيكي', 'يومي'], true),
  ('d1000000-0000-4000-8000-000000000013', 'حذاء سنيكرز جلد أبيض وأسود', 'سنيكرز جلدي بتباين أنيق وتفاصيل مرتبة، يجمع بين الراحة والمظهر العصري.', 'sneakers', 'Different Store', 'https://unsplash.com/photos/black-leather-sneakers-with-white-soles-h289BMla4cw/download?force=true&fm=jpg&w=1200', array['https://unsplash.com/photos/white-leather-sneaker-with-black-details-oX5pCZd7ua8/download?force=true&fm=jpg&w=1200'], array['جلد', 'عصري', 'سنيكرز'], true),
  ('d1000000-0000-4000-8000-000000000014', 'حذاء سنيكرز سويد بإطلالة هادئة', 'سنيكرز سويد بملمس ناعم وألوان دافئة، يمنحك راحة وأناقة في إطلالاتك اليومية.', 'sneakers', 'Different Store', 'https://unsplash.com/photos/brown-adidas-spezial-sneakers-with-white-laces-and-stripes-tA0vOQEIw0Q/download?force=true&fm=jpg&w=1200', array['https://unsplash.com/photos/close-up-of-two-brown-suede-sneakers-on-a-wooden-surface-alSU1JVCOtQ/download?force=true&fm=jpg&w=1200'], array['سويد', 'كاجوال', 'سنيكرز'], true),
  ('d1000000-0000-4000-8000-000000000015', 'حذاء لوفر جلدي أنيق', 'لوفر جلدي بتصميم مرتب ونعل مريح، يناسب العمل والخروجات بإطلالة راقية وبسيطة.', 'sneakers', 'Different Store', 'https://unsplash.com/photos/person-wearing-brown-leather-loafers-V362vbpwSJ4/download?force=true&fm=jpg&w=1200', array['https://unsplash.com/photos/black-leather-slip-on-shoes-QHOp95V_zqQ/download?force=true&fm=jpg&w=1200'], array['لوفر', 'جلد', 'كلاسيكي'], true),
  ('d1000000-0000-4000-8000-000000000016', 'حذاء بكعب مدبب للمناسبات', 'حذاء بكعب أنيق ومقدمة مدببة، يضيف لمسة أنثوية راقية للمناسبات والإطلالات المسائية.', 'sneakers', 'Different Store', 'https://unsplash.com/photos/beige-high-heeled-shoes-in-a-store-window-display-fXICEX3_wT4/download?force=true&fm=jpg&w=1200', array['https://unsplash.com/photos/womens-black-pointed-toe-stiletto-heels-991gfjOvO7I/download?force=true&fm=jpg&w=1200'], array['كعب', 'مناسبات', 'أنيق'], true)
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
  select s.product_id, s.sku_prefix || '-' || s.color_code || '-' || sz.size as sku,
         s.color, sz.size, s.cost_price, s.sell_price, sz.stock_qty, s.image_slot
  from shoe_color_seed s
  cross join lateral unnest(array['37','38','39','40','41']::text[], s.stock_levels) as sz(size, stock_qty)
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
