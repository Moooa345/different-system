begin;

-- Remove only the fixed demo catalog. Historical orders or stock logs stop cleanup safely.
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
      and exists (
        select 1 from public.product_variants pv
        where pv.product_id = p.id
      )
      and not exists (
        select 1 from public.product_variants pv
        where pv.product_id = p.id and pv.sku like 'DEMO-%'
      )
  ) then raise exception 'Cleanup stopped: a reserved demo product ID has variants without the DEMO- prefix'; end if;

  if exists (
    select 1 from public.product_variants pv
    where pv.product_id = any(v_product_ids) and pv.sku not like 'DEMO-%'
  ) then raise exception 'Cleanup stopped: a demo product has a non-demo variant'; end if;
  if exists (
    select 1 from public.order_items oi join public.product_variants pv on pv.id = oi.variant_id
    where pv.product_id = any(v_product_ids) and pv.sku like 'DEMO-%'
  ) then raise exception 'Cleanup stopped: demo variants have order history; no products or orders were changed'; end if;
  if exists (
    select 1 from public.stock_logs sl join public.product_variants pv on pv.id = sl.variant_id
    where pv.product_id = any(v_product_ids) and pv.sku like 'DEMO-%'
  ) then raise exception 'Cleanup stopped: demo variants have stock history; no products or logs were changed'; end if;
end;
$$;

delete from public.products p
where p.id in (
  'd1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000002',
  'd1000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000004',
  'd1000000-0000-4000-8000-000000000005', 'd1000000-0000-4000-8000-000000000006',
  'd1000000-0000-4000-8000-000000000007', 'd1000000-0000-4000-8000-000000000008',
  'd1000000-0000-4000-8000-000000000009', 'd1000000-0000-4000-8000-000000000010',
  'd1000000-0000-4000-8000-000000000011', 'd1000000-0000-4000-8000-000000000012',
  'd1000000-0000-4000-8000-000000000013', 'd1000000-0000-4000-8000-000000000014',
  'd1000000-0000-4000-8000-000000000015', 'd1000000-0000-4000-8000-000000000016'
);

commit;
