-- Bill net is generated from amount and discount. Preserve existing grants and revision guards.
CREATE OR REPLACE FUNCTION public.billing_v42_apply_full_revision(p_project_code text, p_request_id text, p_request_hash text, p_actor text, p_reason text, p_operations jsonb, p_preview boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_project public.projects%rowtype;
  v_bill public.bills%rowtype;
  v_item jsonb; v_expected jsonb; v_next jsonb; v_kind text;
  v_existing public.billing_events%rowtype;
  v_event_key text := 'full-bill-v42:'||trim(coalesce(p_request_id,''));
  v_index integer := 0; v_count integer; v_bill_code text; v_result jsonb;
  v_next_date date; v_category text; v_service text; v_description text; v_notes text;
  v_gross numeric; v_discount numeric; v_qty numeric; v_price numeric;
  v_effective numeric; v_paid numeric; v_debits numeric; v_credits numeric;
  v_created_codes jsonb := '[]'::jsonb; v_history jsonb := '[]'::jsonb;
  v_before jsonb; v_after jsonb; v_credit_code text; v_mirror_code text;
  v_mirror public.bills%rowtype; v_contract uuid; v_contract_service uuid;
  v_latest_net numeric; v_start_net numeric := 0; v_end_net numeric := 0;
BEGIN
  IF p_project_code !~ '^LV-[0-9]{3,8}$' THEN RAISE EXCEPTION 'Invalid project code.'; END IF;
  IF p_request_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
    OR p_request_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid revision identity.';
  END IF;
  IF length(trim(coalesce(p_actor,''))) < 2 OR length(p_actor) > 160 THEN
    RAISE EXCEPTION 'An authenticated operator is required.';
  END IF;
  IF jsonb_typeof(p_operations) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Revision operations must be an array.';
  END IF;
  v_count := jsonb_array_length(p_operations);
  IF v_count < 1 OR v_count > 60 THEN RAISE EXCEPTION 'Choose between 1 and 60 changed service rows.'; END IF;
  IF length(trim(coalesce(p_reason,''))) < 12 OR length(p_reason) > 1200 THEN
    RAISE EXCEPTION 'A revision reason of at least 12 characters is required.';
  END IF;

  SELECT * INTO v_project FROM public.projects WHERE project_code=p_project_code FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project not found.'; END IF;

  SELECT * INTO v_existing FROM public.billing_events
   WHERE event_key=v_event_key LIMIT 1;
  IF FOUND THEN
    IF v_existing.project_id<>v_project.id OR v_existing.details->>'requestHash'<>p_request_hash THEN
      RAISE EXCEPTION 'Revision ID belongs to a different financial request.';
    END IF;
    RETURN coalesce(v_existing.details->'result','{}'::jsonb)||jsonb_build_object('recovered',true,'preview',false);
  END IF;

  -- Pass 1: validate all rows before modifying any row. Each existing bill is
  -- row-locked and guarded by the exact snapshot displayed in the editor.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_operations) LOOP
    v_index := v_index+1;
    v_kind := coalesce(v_item->>'kind','');
    v_expected := coalesce(v_item->'expected','{}'::jsonb);
    v_next := coalesce(v_item->'next','{}'::jsonb);
    IF v_kind NOT IN ('create','draft_update','draft_void','issued_revision','issued_remove') THEN
      RAISE EXCEPTION 'Unsupported bill revision action on row %.',v_index;
    END IF;
    IF v_kind='create' THEN
      v_bill_code := '';
    ELSE
      v_bill_code := coalesce(v_item->>'billCode','');
      IF v_bill_code='' OR EXISTS(
        SELECT 1 FROM jsonb_array_elements(p_operations) AS op(value)
         WHERE op.value->>'billCode'=v_bill_code
         HAVING count(*)>1
      ) THEN RAISE EXCEPTION 'Missing or duplicated original Bill ID on row %.',v_index; END IF;
      SELECT * INTO v_bill FROM public.bills
       WHERE bill_code=v_bill_code AND project_id=v_project.id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Bill % is missing from this project.',v_bill_code; END IF;
      IF lower(coalesce(v_bill.created_via,'')) LIKE '%credit note%' OR lower(coalesce(v_bill.created_via,'')) LIKE '%debit note%' THEN
        RAISE EXCEPTION 'Adjustment mirror bills must not be edited.';
      END IF;
      IF lower(coalesce(v_bill.status,'')) IN ('void','voided','cancelled','canceled','rejected') THEN
        RAISE EXCEPTION 'A voided or cancelled service cannot be edited: %.',v_bill_code;
      END IF;
      IF coalesce(v_bill.status,'')<>coalesce(v_expected->>'status','')
       OR coalesce(v_bill.bill_date::text,'')<>coalesce(v_expected->>'date','')
       OR (CASE WHEN coalesce(v_bill.billing_category,v_bill.category,'')='Design Books' THEN 'Engineering Bill'
          ELSE coalesce(v_bill.billing_category,v_bill.category,'') END)<>coalesce(v_expected->>'category','')
       OR trim(regexp_replace(coalesce(v_bill.description,''),'^\[(Engineering Bill|Design Books|Supervision Bill|Other Services Bill)\]\s*','','i'))<>coalesce(v_expected->>'service','')
       OR trim(coalesce(v_bill.notes,''))<>coalesce(v_expected->>'notes','')
       OR abs(coalesce(v_bill.amount,0)-coalesce((v_expected->>'gross')::numeric,0))>.009
       OR abs(coalesce(v_bill.discount,0)-coalesce((v_expected->>'discount')::numeric,0))>.009
       OR abs(coalesce(v_bill.quantity,0)-coalesce((v_expected->>'quantity')::numeric,0))>.009
       OR abs(coalesce(v_bill.unit_price,0)-coalesce((v_expected->>'unitPrice')::numeric,0))>.009
      THEN RAISE EXCEPTION 'Bill % changed since it was opened. Reload before saving.',v_bill_code; END IF;
      SELECT coalesce(sum(case when lower(coalesce(adjustment_type,'')) IN ('debit','debit note') and lower(status)='posted' then amount else 0 end),0),
             coalesce(sum(case when lower(coalesce(adjustment_type,'')) IN ('credit','credit note') and lower(status)='posted' then amount else 0 end),0)
        INTO v_debits,v_credits FROM public.billing_adjustments WHERE bill_id=v_bill.id;
      v_effective := greatest(0,coalesce(v_bill.net_amount,coalesce(v_bill.amount,0)-coalesce(v_bill.discount,0))+v_debits-v_credits);
      IF abs(v_effective-coalesce((v_expected->>'effectiveNet')::numeric,0))>.009 THEN
        RAISE EXCEPTION 'Bill % has newer adjustments. Reload and review the invoice.',v_bill_code;
      END IF;
      -- Serialize this revision against payment-trigger invoice updates.
      PERFORM id FROM public.invoices WHERE bill_code=v_bill_code FOR UPDATE;
      SELECT greatest(coalesce(sum(a.allocated_amount),0),coalesce(max(i.paid_amount_snapshot),0))
        INTO v_paid FROM public.invoices i
        LEFT JOIN public.payment_invoice_allocations a ON a.invoice_id=i.id
       WHERE i.bill_code=v_bill_code;
      IF v_kind IN ('draft_update','draft_void') AND lower(coalesce(v_bill.status,''))<>'draft' THEN
        RAISE EXCEPTION 'Only Draft bills can be repriced or voided.';
      END IF;
      IF v_kind IN ('issued_revision','issued_remove') AND lower(coalesce(v_bill.status,''))='draft' THEN
        RAISE EXCEPTION 'Draft bills use the draft editor, not issued corrections.';
      END IF;
      IF v_kind IN ('draft_update','draft_void','issued_remove') AND v_paid>.009 THEN
        RAISE EXCEPTION 'Bill % already has paid invoice amounts. Use an authorized payment/credit review before changing it.',v_bill_code;
      END IF;
      IF v_kind='issued_remove' AND v_effective>.009 AND EXISTS(
        SELECT 1 FROM public.billing_adjustments a WHERE a.bill_id=v_bill.id AND lower(a.status)='posted' AND lower(a.adjustment_type) IN ('credit','credit note')
      ) THEN
        -- Existing credits already affect the outstanding value; never silently
        -- create a second blanket removal credit without an explicit review.
        RAISE EXCEPTION 'Bill % has existing credit notes. Use the audited Credit / Debit Notes review.',v_bill_code;
      END IF;
    END IF;

    IF v_kind NOT IN ('draft_void','issued_remove') THEN
      v_category := trim(coalesce(v_next->>'category',''));
      v_service := trim(coalesce(v_next->>'service',''));
      v_notes := trim(coalesce(v_next->>'notes',''));
      IF v_category NOT IN ('Engineering Bill','Other Services Bill','Supervision Bill')
         OR length(v_service)<1 OR length(v_service)>250 OR length(v_notes)>2000
      THEN RAISE EXCEPTION 'Invalid category, service or notes on row %.',v_index; END IF;
      IF (v_kind IN ('create','draft_update') OR coalesce(v_next->>'date','')<>'')
         AND coalesce(v_next->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' THEN
        RAISE EXCEPTION 'Invalid bill date on row %.',v_index;
      END IF;
      v_next_date := nullif(v_next->>'date','')::date;
      v_gross := (v_next->>'gross')::numeric;
      v_discount := (v_next->>'discount')::numeric;
      v_qty := (v_next->>'quantity')::numeric;
      v_price := (v_next->>'unitPrice')::numeric;
      IF v_gross<=0 OR v_gross>1000000000 OR v_discount<0 OR v_discount>v_gross
       OR (v_kind IN ('create','draft_update') AND (v_qty<=0 OR v_price<=0 OR abs(v_qty*v_price-v_gross)>.02))
       THEN
        RAISE EXCEPTION 'Invalid gross, discount, quantity or unit rate on row %.',v_index;
      END IF;
      IF v_kind='issued_revision' THEN
        IF abs(v_gross-v_bill.amount)>.009 OR abs(v_qty-coalesce(v_bill.quantity,0))>.009
          OR abs(v_price-coalesce(v_bill.unit_price,0))>.009 THEN
          RAISE EXCEPTION 'Issued bill gross, rate and quantity cannot be rewritten.';
        END IF;
        IF v_paid>.009 AND
          (v_category<>coalesce(v_bill.billing_category,v_bill.category,'') OR v_service<>trim(regexp_replace(coalesce(v_bill.description,''),'^\[(Engineering Bill|Design Books|Supervision Bill|Other Services Bill)\]\s*','','i')))
        THEN RAISE EXCEPTION 'A paid service cannot be reassigned to a different category or service.'; END IF;
        IF v_gross-v_discount+v_debits-v_credits+0.009<v_paid THEN
          RAISE EXCEPTION 'Revised invoice value cannot be below already allocated money.';
        END IF;
      END IF;
      IF v_kind='create' AND coalesce(v_next->>'status','') NOT IN ('Draft','Issued') THEN
        RAISE EXCEPTION 'New service must be Draft or Issued.';
      END IF;
    END IF;
  END LOOP;

  IF p_preview THEN RETURN jsonb_build_object('preview',true,'valid',true,'changeCount',v_count); END IF;

  -- Pass 2: all changes and the final immutable revision audit run within one
  -- PostgreSQL transaction. A failed trigger, constraint or audit rolls back ALL.
  v_index := 0;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_operations) LOOP
    v_index := v_index+1;
    v_credit_code := NULL;
    v_effective := 0;
    v_kind := v_item->>'kind';
    v_next := coalesce(v_item->'next','{}'::jsonb);
    v_bill_code := coalesce(v_item->>'billCode','');
    IF v_kind<>'create' THEN
      SELECT * INTO v_bill FROM public.bills WHERE project_id=v_project.id AND bill_code=v_bill_code FOR UPDATE;
      v_before := jsonb_build_object(
        'billCode',v_bill.bill_code,'status',v_bill.status,'date',v_bill.bill_date,
        'category',v_bill.billing_category,'service',v_bill.description,
        'gross',v_bill.amount,'discount',v_bill.discount,'net',v_bill.net_amount,
        'quantity',v_bill.quantity,'unitPrice',v_bill.unit_price,'notes',v_bill.notes);
    ELSE v_before := NULL;
    END IF;
    IF v_kind='create' THEN
      v_bill_code := 'BILL-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
      INSERT INTO public.bills(bill_code,project_id,bill_date,billing_category,category,description,
        amount,discount,quantity,unit_price,status,notes,created_via,source_created_by,source_created_at,idempotency_key)
      VALUES(v_bill_code,v_project.id,(v_next->>'date')::date,v_next->>'category',v_next->>'category',
        '['||(v_next->>'category')||'] '||(v_next->>'service'),
        (v_next->>'gross')::numeric,(v_next->>'discount')::numeric,
        (v_next->>'quantity')::numeric,(v_next->>'unitPrice')::numeric,v_next->>'status',
        nullif(v_next->>'notes',''),'Full Bill Editor V4.2',p_actor,now(),v_event_key||':'||v_index)
      RETURNING * INTO v_bill;
      v_created_codes := v_created_codes||jsonb_build_array(v_bill.bill_code);
    ELSIF v_kind='draft_update' THEN
      UPDATE public.bills SET bill_date=(v_next->>'date')::date,billing_category=v_next->>'category',
        category=v_next->>'category',description='['||(v_next->>'category')||'] '||(v_next->>'service'),
        amount=(v_next->>'gross')::numeric,discount=(v_next->>'discount')::numeric,
        quantity=(v_next->>'quantity')::numeric,unit_price=(v_next->>'unitPrice')::numeric,
        notes=nullif(v_next->>'notes',''),source_updated_at=now()
      WHERE id=v_bill.id RETURNING * INTO v_bill;
    ELSIF v_kind='draft_void' THEN
      UPDATE public.bills SET status='Void',discount=amount,
        notes=concat_ws(E'\n',nullif(notes,''),'Draft voided via Full Bill Editor V4.2: '||p_reason),
        source_updated_at=now() WHERE id=v_bill.id RETURNING * INTO v_bill;
      UPDATE public.invoice_items SET net_amount=0,discount_amount=greatest(0,gross_amount),updated_at=now()
        WHERE bill_id=v_bill.id;
      UPDATE public.invoices SET status='VOID',amount=0,due_amount_snapshot=0,total_bill_snapshot=0,
        updated_at=now() WHERE bill_code=v_bill.bill_code;
    ELSIF v_kind='issued_revision' THEN
      UPDATE public.bills SET bill_date=nullif(v_next->>'date','')::date,billing_category=v_next->>'category',
        category=v_next->>'category',description='['||(v_next->>'category')||'] '||(v_next->>'service'),
        discount=(v_next->>'discount')::numeric,
        notes=nullif(v_next->>'notes',''),source_updated_at=now()
      WHERE id=v_bill.id RETURNING * INTO v_bill;
    ELSIF v_kind='issued_remove' THEN
      SELECT coalesce(sum(case when lower(adjustment_type) IN ('debit','debit note') AND lower(status)='posted' THEN amount ELSE 0 END),0),
        coalesce(sum(case when lower(adjustment_type) IN ('credit','credit note') AND lower(status)='posted' THEN amount ELSE 0 END),0)
        INTO v_debits,v_credits FROM public.billing_adjustments WHERE bill_id=v_bill.id;
      v_effective:=greatest(0,coalesce(v_bill.net_amount,v_bill.amount-v_bill.discount)+v_debits-v_credits);
      IF v_effective>.009 THEN
        v_credit_code:='CRN-'||v_project.project_code||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
        v_mirror_code:='CRB-'||v_project.project_code||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
        SELECT c.id INTO v_contract FROM public.project_contracts c WHERE c.project_id=v_project.id LIMIT 1;
        SELECT cs.id INTO v_contract_service FROM public.project_contract_services cs
          WHERE cs.contract_id=v_contract AND cs.service_key=public.billing_v2_service_key(
            public.billing_v2_legacy_service_name(v_bill.description,v_bill.billing_category)) LIMIT 1;
        INSERT INTO public.bills(bill_code,project_id,bill_date,billing_category,category,description,
          amount,discount,status,notes,created_via,source_created_by,source_created_at,
          legacy_source_id,idempotency_key,unit_price,quantity)
        VALUES(v_mirror_code,v_project.id,current_date,v_bill.billing_category,v_bill.category,
          v_bill.description,0,v_effective,'Posted',
          'Credit Note '||v_credit_code||' against '||v_bill.bill_code||'. Reason: '||p_reason,
          'Credit Note',p_actor,now(),v_bill.id::text,v_event_key||':credit:'||v_index,0,1)
        RETURNING * INTO v_mirror;
        INSERT INTO public.billing_adjustments(adjustment_code,project_id,project_code,bill_id,bill_code,
          mirror_bill_id,mirror_bill_code,contract_id,contract_service_id,service_name,service_key,
          billing_category,adjustment_type,amount,reason,notes,status,posted_by,posted_at)
        VALUES(v_credit_code,v_project.id,v_project.project_code,v_bill.id,v_bill.bill_code,
          v_mirror.id,v_mirror.bill_code,v_contract,v_contract_service,
          public.billing_v2_legacy_service_name(v_bill.description,v_bill.billing_category),
          public.billing_v2_service_key(public.billing_v2_legacy_service_name(v_bill.description,v_bill.billing_category)),
          v_bill.billing_category,'Credit Note',v_effective,p_reason,
          'Issued service removed through atomic Full Bill Editor V4.2','Posted',p_actor,now());
        INSERT INTO public.billing_events(project_id,project_code,contract_id,contract_service_id,
          event_type,event_key,service_name,amount,actor,details)
        VALUES(v_project.id,v_project.project_code,v_contract,v_contract_service,'credit_note_posted',
          v_event_key||':credit-note:'||v_index,
          public.billing_v2_legacy_service_name(v_bill.description,v_bill.billing_category),v_effective,p_actor,
          jsonb_build_object('creditNoteCode',v_credit_code,'originalBillCode',v_bill.bill_code,'mirrorBillCode',v_mirror.bill_code,'reason',p_reason));
      END IF;
    END IF;
    v_after := jsonb_build_object(
      'billCode',v_bill.bill_code,'status',v_bill.status,'date',v_bill.bill_date,
      'category',v_bill.billing_category,'service',v_bill.description,
      'gross',v_bill.amount,'discount',v_bill.discount,'net',v_bill.net_amount,
      'quantity',v_bill.quantity,'unitPrice',v_bill.unit_price,'notes',v_bill.notes);
    IF v_kind='issued_remove' THEN
      v_after:=v_after||jsonb_build_object('creditNoteCode',v_credit_code,'creditAmount',v_effective);
    END IF;
    v_history:=v_history||jsonb_build_array(jsonb_build_object('kind',v_kind,'before',v_before,'after',v_after));
  END LOOP;
  v_result:=jsonb_build_object('preview',false,'recovered',false,'projectCode',v_project.project_code,
     'revisionId',p_request_id,'changeCount',v_count,'newBillCodes',v_created_codes);
  INSERT INTO public.billing_events(project_id,project_code,event_type,event_key,service_name,amount,
    actor,details)
  VALUES(v_project.id,v_project.project_code,'full_bill_revision_v42',v_event_key,'Full Bill Editor',0,
    p_actor,jsonb_build_object('requestHash',p_request_hash,'reason',p_reason,
      'changes',v_history,'result',v_result,'version','4.2','operator',p_actor));
  RETURN v_result;
END;
$function$;
