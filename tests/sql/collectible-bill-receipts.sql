-- Run as one transaction. Synthetic projects, receipts and any trigger work are rolled back.
begin;
set local statement_timeout='45s';
do $test$
declare
  tag text := substr(replace(gen_random_uuid()::text,'-',''),1,10);
  proj uuid;
  bill_a uuid;
  bill_b uuid;
  next_bill uuid;
  other_bill uuid;
  supervision_bill uuid;
  pay jsonb;
  result jsonb;
  receipt uuid;
  initial_allocation uuid;
  due numeric[];
  received numeric;
  was_rejected boolean;
begin
  insert into public.projects(project_code,lifecycle_phase,whatsapp_updates_enabled)
    values('QA-'||tag,'Design Stage',false) returning id into proj;
  insert into public.bills(bill_code,project_id,billing_category,category,description,amount,discount,status,bill_date)
    values('QA-A-'||tag,proj,'Engineering Bill','Engineering Bill','Re-Design Bill',12000,7000,'Issued',current_date) returning id into bill_a;
  insert into public.bills(bill_code,project_id,billing_category,category,description,amount,discount,status,bill_date)
    values('QA-B-'||tag,proj,'Engineering Bill','Engineering Bill','Re-Design Bill',4000,0,'Issued',current_date) returning id into bill_b;
  pay:=jsonb_build_object('project_id',proj,'payment_date',current_date,'approval_status','Approved','status','POSTED',
    'income_category','Engineering Bill','payment_for','Engineering Bill','transaction_type','Business Income',
    'affects_business_balance',true,'source_created_by','Billing verification',
    'payment_code','QA-P-'||tag,'idempotency_key','qa-payment-'||tag,'amount',6500,'billing_bill_targets',
    jsonb_build_array(jsonb_build_object('bill_id',bill_a,'amount',5000),jsonb_build_object('bill_id',bill_b,'amount',1500)));
  result:=public.billing_record_payment(pay,'[]','first');
  receipt:=(result->>'id')::uuid;
  select a.id into strict initial_allocation from public.payment_invoice_allocations a
    where a.payment_id=receipt and a.bill_id=bill_a and a.allocated_amount=5000;
  if not exists(select from public.payment_invoice_allocations where payment_id=receipt and bill_id=bill_b and allocated_amount=1500)
    or not exists(select from public.payment_service_allocations where payment_id=receipt and allocated_amount=6500)
    or not exists(select from public.payment_receipts where payment_id=receipt and allocated_amount=6500 and unallocated_amount=0)
    or (public.billing_collectible_by_category(proj))[1]<>2500 then raise exception 'Split or receipt totals differ'; end if;
  if (public.billing_record_payment(pay,'[]','first')->>'id')::uuid<>receipt then raise exception 'Retry created a second receipt'; end if;
  perform public.billing_v2_reconcile_payment(pay->>'payment_code','Billing verification',false);
  if not exists(select from public.payment_invoice_allocations where id=initial_allocation) then raise exception 'Replay changed the original bill link'; end if;

  was_rejected:=false;
  begin
    perform public.billing_record_payment(pay||jsonb_build_object('payment_code','QA-STALE-'||tag,'idempotency_key','qa-stale-'||tag,
      'amount',1000,'billing_bill_targets',jsonb_build_array(jsonb_build_object('bill_id',bill_a,'amount',1000))),'[]','stale');
  exception when raise_exception then
    if sqlerrm not like 'Selected bill changed%' then raise; end if;
    was_rejected:=true;
  end;
  if not was_rejected or exists(select from public.payments where payment_code='QA-STALE-'||tag) then raise exception 'Stale bill was accepted'; end if;

  insert into public.billing_writeoff_log(writeoff_code,project_id,billing_category,event_type,amount,reason,idempotency_key)
    values('QA-W-'||tag,proj,'Engineering Bill','write_off',2500,'Synthetic verification','qa-writeoff-'||tag);
  if (public.billing_collectible_by_category(proj))[1]<>0 then raise exception 'Write-off did not clear category'; end if;
  was_rejected:=false;
  begin
    perform public.billing_record_payment(pay||jsonb_build_object('payment_code','QA-OVER-'||tag,'idempotency_key','qa-over-'||tag,
      'amount',1,'billing_bill_targets',jsonb_build_array(jsonb_build_object('bill_id',bill_b,'amount',1))),'[]','over');
  exception when raise_exception then
    if sqlerrm not like 'Collectible balance changed%' then raise; end if;
    was_rejected:=true;
  end;
  if not was_rejected or exists(select from public.payments where payment_code='QA-OVER-'||tag) then raise exception 'Written-off balance was collected'; end if;

  result:=public.billing_record_payment(pay||jsonb_build_object('payment_code','QA-ADV-'||tag,'idempotency_key','qa-advance-'||tag,
    'amount',800,'billing_bill_targets','[]'::jsonb),'[]','advance');
  receipt:=(result->>'id')::uuid;
  if not exists(select from public.payment_receipts where payment_id=receipt and allocated_amount=0 and unallocated_amount=800)
    then raise exception 'Advance did not remain as credit'; end if;
  -- Allocation refresh suppression is transaction-local. Simulate the next issued bill in a fresh request.
  perform set_config('landview.billing_allocation_refresh','',true);
  insert into public.bills(bill_code,project_id,billing_category,category,description,amount,discount,status,bill_date)
    values('QA-C-'||tag,proj,'Engineering Bill','Engineering Bill','Structural Design',300,0,'Issued',current_date+1) returning id into next_bill;
  if not exists(select from public.payment_receipts where payment_id=receipt and allocated_amount=300 and unallocated_amount=500)
    or not exists(select from public.payment_invoice_allocations where payment_id=receipt and bill_id=next_bill and allocated_amount=300)
    then raise exception 'Auto-application of advance to newly collectible amount differs'; end if;
  if (public.billing_collectible_by_category(proj))[1]<>0 then raise exception 'Advance left a spurious balance'; end if;
  perform public.billing_v2_reconcile_payment('QA-ADV-'||tag,'Billing verification',false);
  if not exists(select from public.payment_receipts where payment_id=receipt and allocated_amount=300 and unallocated_amount=500)
    then raise exception 'Reconciling an advance changed its applied amount'; end if;

  insert into public.bills(bill_code,project_id,billing_category,category,description,amount,discount,status,bill_date)
    values('QA-O-'||tag,proj,'Other Services Bill','Other Services Bill','Municipality Pass',2000,0,'Issued',current_date) returning id into other_bill;
  due:=public.billing_collectible_by_category(proj);
  received:=due[3];
  if received<>1500 then raise exception 'Project-wide advance credit differs: %',due; end if;
  result:=public.billing_record_payment(pay||jsonb_build_object('payment_code','QA-OTHER-'||tag,'idempotency_key','qa-other-'||tag,
    'payment_for','Other Services Bill','income_category','Other Services Bill','service_type','Municipality File Pass','finance_scope','municipality_file_pass',
    'amount',received,'billing_bill_targets',jsonb_build_array(jsonb_build_object('bill_id',other_bill,'amount',received))),'[]','other');
  if not exists(select from public.payment_invoice_allocations where payment_id=(result->>'id')::uuid and bill_id=other_bill and allocated_amount=received)
    or (public.billing_collectible_by_category(proj))[3]<>0 then raise exception 'Other Services allocation differs'; end if;

  insert into public.bills(bill_code,project_id,billing_category,category,description,amount,discount,status,bill_date)
    values('QA-S-'||tag,proj,'Supervision Bill','Supervision Bill','Site Supervision',1200,0,'Issued',current_date) returning id into supervision_bill;
  was_rejected:=false;
  begin
    perform public.billing_record_payment(pay||jsonb_build_object('payment_code','QA-WRONG-'||tag,'idempotency_key','qa-wrong-'||tag,
      'amount',200,'billing_bill_targets',jsonb_build_array(jsonb_build_object('bill_id',supervision_bill,'amount',200))),'[]','wrong category');
  exception when raise_exception then
    if sqlerrm not like 'Selected bill changed%' then raise; end if;
    was_rejected:=true;
  end;
  if not was_rejected then raise exception 'Cross-category receipt was accepted'; end if;
  result:=public.billing_record_payment(pay||jsonb_build_object('payment_code','QA-SUP-'||tag,'idempotency_key','qa-sup-'||tag,
    'payment_for','Supervision Bill','income_category','Supervision Bill','service_type','Site Supervision',
    'amount',400,'billing_bill_targets',jsonb_build_array(jsonb_build_object('bill_id',supervision_bill,'amount',400))),'[]','supervision');
  if not exists(select from public.payment_invoice_allocations where payment_id=(result->>'id')::uuid and bill_id=supervision_bill and allocated_amount=400)
    then raise exception 'Supervision receipt is missing its bill'; end if;
  due:=public.billing_collectible_by_category(proj);
  result:=public.billing_record_payment(pay||jsonb_build_object('payment_code','QA-EXTRA-'||tag,'idempotency_key','qa-extra-'||tag,
    'payment_for','Supervision Bill','income_category','Supervision Bill','amount',due[2]+100,'billing_bill_targets','[]'::jsonb),'[]','extra');
  if not exists(select from public.payment_receipts where payment_id=(result->>'id')::uuid and allocated_amount=due[2] and unallocated_amount=100)
    then raise exception 'Extra payment did not split into bill and advance'; end if;
end;
$test$;
select 'discount, split, replay, stale bill, write-off, advance, municipality and supervision checks passed' as result;
rollback;
