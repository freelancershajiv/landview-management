-- Keep invoice amounts and printable invoice service rows synchronized with
-- Billing 2.0 Credit/Debit Notes. Service-wise discounts are stored as Credit
-- Notes against the original bill, but should render on that original invoice.

create or replace function public.billing_v2_refresh_invoice(p_invoice_id uuid)
returns void
language plpgsql
set search_path to 'public'
as $function$
declare
  v_bill_net numeric := 0;
  v_debits numeric := 0;
  v_credits numeric := 0;
  v_amount numeric := 0;
  v_paid numeric := 0;
  v_due numeric := 0;
  v_status text := 'ISSUED';
  v_snapshot_paid numeric := 0;
  v_allocation_count integer := 0;
begin
  -- Fold active service-discount Credit Notes into the original printable row.
  update public.invoice_items ii
  set discount_amount = round(
        greatest(
          0,
          least(
            coalesce(b.amount, 0),
            coalesce(b.discount, 0) + coalesce(sd.service_discount, 0)
          )
        ),
        2
      ),
      net_amount = round(
        greatest(
          0,
          coalesce(b.amount, 0) - greatest(
            0,
            least(
              coalesce(b.amount, 0),
              coalesce(b.discount, 0) + coalesce(sd.service_discount, 0)
            )
          )
        ),
        2
      ),
      updated_at = now()
  from public.bills b
  left join lateral (
    select coalesce(sum(a.amount), 0) as service_discount
    from public.billing_adjustments a
    where a.bill_id = b.id
      and lower(coalesce(a.status, '')) = 'posted'
      and lower(coalesce(a.adjustment_type, '')) in ('credit', 'credit note')
      and lower(coalesce(a.reason, '')) like 'service discount%'
  ) sd on true
  where ii.invoice_id = p_invoice_id
    and ii.bill_id = b.id;

  select coalesce(sum(coalesce(b.net_amount, greatest(coalesce(b.amount,0)-coalesce(b.discount,0),0))),0)
    into v_bill_net
  from public.invoice_items ii
  join public.bills b on b.id=ii.bill_id
  where ii.invoice_id=p_invoice_id;

  select
    coalesce(sum(case when lower(coalesce(a.adjustment_type,'')) in ('debit','debit note') and lower(coalesce(a.status,''))='posted' then a.amount else 0 end),0),
    coalesce(sum(case when lower(coalesce(a.adjustment_type,'')) in ('credit','credit note') and lower(coalesce(a.status,''))='posted' then a.amount else 0 end),0)
    into v_debits,v_credits
  from public.billing_adjustments a
  where exists(
    select 1 from public.invoice_items ii
    where ii.invoice_id=p_invoice_id and ii.bill_id=a.bill_id
  );

  v_amount := greatest(0,v_bill_net+v_debits-v_credits);

  select coalesce(paid_amount_snapshot,0)
    into v_snapshot_paid
  from public.invoices
  where id=p_invoice_id;

  select count(*), coalesce(sum(allocated_amount),0)
    into v_allocation_count,v_paid
  from public.payment_invoice_allocations
  where invoice_id=p_invoice_id;

  -- Legacy invoices can have valid paid snapshots without allocation rows.
  if v_allocation_count = 0 then
    v_paid := v_snapshot_paid;
  end if;

  v_due := greatest(0,v_amount-v_paid);
  v_status := case
    when v_amount <= 0.009 then 'ADJUSTED'
    when v_paid >= v_amount-0.009 then 'PAID'
    when v_paid > 0.009 then 'PARTIALLY PAID'
    else 'ISSUED'
  end;

  update public.invoices
  set amount=round(v_amount,2),
      paid_amount_snapshot=round(v_paid,2),
      due_amount_snapshot=round(v_due,2),
      total_bill_snapshot=round(v_amount,2),
      total_paid_snapshot=round(v_paid,2),
      status=v_status,
      updated_at=now(),
      source_updated_at=now()
  where id=p_invoice_id;
end;
$function$;
