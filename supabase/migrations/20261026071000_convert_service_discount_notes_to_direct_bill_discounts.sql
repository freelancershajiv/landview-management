-- Service-wise discounts are commercial bill discounts in LAND VIEW, not
-- accounting correction documents. Move any active service-discount Credit
-- Notes onto the original bill's discount field and retire their mirror bills.

do $$
declare
  r record;
begin
  for r in
    select
      a.bill_id,
      b.project_id,
      a.project_code,
      a.bill_code,
      max(a.service_name) as service_name,
      sum(a.amount) as discount_amount
    from public.billing_adjustments a
    join public.bills b on b.id = a.bill_id
    where lower(coalesce(a.status, '')) = 'posted'
      and lower(coalesce(a.adjustment_type, '')) in ('credit', 'credit note')
      and lower(coalesce(a.reason, '')) like 'service discount%'
    group by a.bill_id, b.project_id, a.project_code, a.bill_code
  loop
    update public.bills b
    set discount = round(least(coalesce(b.amount, 0), coalesce(b.discount, 0) + r.discount_amount), 2),
        source_updated_at = now(),
        updated_at = now()
    where b.id = r.bill_id;

    insert into public.billing_events(
      project_id, project_code, event_type, event_key, service_name,
      amount, actor, details, created_at
    ) values (
      r.project_id,
      r.project_code,
      'service_discount_migrated',
      'service-discount-migrated:' || r.bill_id::text,
      r.service_name,
      r.discount_amount,
      'system:direct-discount-migration',
      jsonb_build_object(
        'billCode', r.bill_code,
        'discount', r.discount_amount,
        'from', 'service_discount_credit_note',
        'to', 'original_bill_discount'
      ),
      now()
    )
    on conflict (event_key) do nothing;
  end loop;

  update public.bills b
  set status = 'Void',
      source_updated_at = now(),
      updated_at = now(),
      notes = trim(both from coalesce(b.notes, '') || E'\nVoided automatically: service discount moved to the original bill.')
  where b.id in (
    select a.mirror_bill_id
    from public.billing_adjustments a
    where lower(coalesce(a.status, '')) = 'posted'
      and lower(coalesce(a.adjustment_type, '')) in ('credit', 'credit note')
      and lower(coalesce(a.reason, '')) like 'service discount%'
      and a.mirror_bill_id is not null
  );

  update public.billing_adjustments a
  set status = 'Void',
      voided_by = 'system:direct-discount-migration',
      voided_at = now(),
      void_reason = 'Converted to direct service discount on original bill',
      updated_at = now()
  where lower(coalesce(a.status, '')) = 'posted'
    and lower(coalesce(a.adjustment_type, '')) in ('credit', 'credit note')
    and lower(coalesce(a.reason, '')) like 'service discount%';
end;
$$;
