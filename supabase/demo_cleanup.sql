begin;

-- Delete only the eight fixed demo products and DEMO- variants created by demo_seed.sql.
-- Refuse to proceed if a target product gained non-demo variants or has order history.
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
  ) then raise exception 'Cleanup stopped: a reserved demo product ID belongs to another product'; end if;

  if exists (
    select 1 from public.product_variants pv
    where pv.product_id = any(v_product_ids) and pv.sku not like 'DEMO-%'
  ) then raise exception 'Cleanup stopped: a demo product has a non-demo variant'; end if;

  if exists (
    select 1 from public.order_items oi
    join public.product_variants pv on pv.id = oi.variant_id
    where pv.product_id = any(v_product_ids) and pv.sku like 'DEMO-%'
  ) then raise exception 'Cleanup stopped: demo variants have order history; no products or orders were changed'; end if;

  if exists (
    select 1 from public.stock_logs sl
    join public.product_variants pv on pv.id = sl.variant_id
    where pv.product_id = any(v_product_ids) and pv.sku like 'DEMO-%'
  ) then raise exception 'Cleanup stopped: demo variants have stock history; no products or logs were changed'; end if;
end;
$$;

delete from public.products
where id in (
  'd1000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000002',
  'd1000000-0000-4000-8000-000000000003',
  'd1000000-0000-4000-8000-000000000004',
  'd1000000-0000-4000-8000-000000000005',
  'd1000000-0000-4000-8000-000000000006',
  'd1000000-0000-4000-8000-000000000007',
  'd1000000-0000-4000-8000-000000000008'
)
and exists (
  select 1 from public.product_variants pv
  where pv.product_id = products.id and pv.sku like 'DEMO-%'
);

commit;
