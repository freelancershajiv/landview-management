-- Run against a database with at least one project. All fixture writes roll back.
begin;
do $verify$
declare
 pc text; a text; b text; result jsonb; expected jsonb; n jsonb; req text; net numeric; op jsonb;
begin
 select project_code into strict pc from public.projects where project_code ~ '^LV-[0-9]{3,8}$' limit 1;
 n:=jsonb_build_object('date',current_date,'category','Engineering Bill','service','Revision validation service','gross',1000,'discount',0,'quantity',1,'unitPrice',1000,'notes','','status','Issued');
 result:=public.billing_v42_apply_full_revision(pc,gen_random_uuid()::text,repeat('a',64),'Revision verifier','Rollback verification of revision save',jsonb_build_array(jsonb_build_object('kind','create','next',n),jsonb_build_object('kind','create','next',n||'{"status":"Draft"}'::jsonb)),false);
 a:=result->'newBillCodes'->>0; b:=result->'newBillCodes'->>1;
 expected:=n||'{"effectiveNet":1000}'::jsonb;
 op:=jsonb_build_array(jsonb_build_object('kind','issued_revision','billCode',a,'expected',expected,'next',n||'{"discount":125}'::jsonb));
 req:=gen_random_uuid()::text;
 result:=public.billing_v42_apply_full_revision(pc,req,repeat('b',64),'Revision verifier','Rollback verification of issued discount',op,true);
 if result->>'valid' is distinct from 'true' then raise exception 'Preview failed'; end if;
 result:=public.billing_v42_apply_full_revision(pc,req,repeat('b',64),'Revision verifier','Rollback verification of issued discount',op,false);
 select net_amount into strict net from public.bills where bill_code=a;
 if net is distinct from 875 or (select net_amount from public.bills where bill_code=b) is distinct from 1000 then raise exception 'Incorrect net or sibling change'; end if;
 if not exists(select 1 from public.billing_events where event_key='full-bill-v42:'||req and (details#>>'{changes,0,after,net}')::numeric=875) then raise exception 'Missing revision audit'; end if;
 result:=public.billing_v42_apply_full_revision(pc,req,repeat('b',64),'Revision verifier','Rollback verification of issued discount',op,false);
 if result->>'recovered' is distinct from 'true' then raise exception 'Retry failed'; end if;
 expected:=expected||'{"status":"Draft"}'::jsonb;
 op:=jsonb_build_array(jsonb_build_object('kind','draft_update','billCode',b,'expected',expected,'next',n||'{"status":"Draft","discount":100}'::jsonb));
 perform public.billing_v42_apply_full_revision(pc,gen_random_uuid()::text,repeat('c',64),'Revision verifier','Rollback verification of draft discount',op,false);
 expected:=expected||'{"effectiveNet":900,"discount":100}'::jsonb;
 perform public.billing_v42_apply_full_revision(pc,gen_random_uuid()::text,repeat('d',64),'Revision verifier','Rollback verification of draft void',jsonb_build_array(jsonb_build_object('kind','draft_void','billCode',b,'expected',expected)),false);
 if (select net_amount from public.bills where bill_code=b) is distinct from 0 then raise exception 'Draft void failed'; end if;
end; $verify$;
rollback;
