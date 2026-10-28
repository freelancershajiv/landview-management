-- Canonical project identity layer: UUID for relationships, LV code for human-facing identity.
create schema if not exists private;

create or replace function private.normalize_land_view_project_code(p_code text)
returns text
language sql
immutable
set search_path to ''
as $$
  select case
    when p_code is null or trim(p_code) = '' then null
    when upper(trim(p_code)) ~ '^LV-0*[0-9]+$'
      then 'LV-' || ((substring(upper(trim(p_code)) from '([0-9]+)$'))::bigint)::text
    else upper(trim(p_code))
  end
$$;

create or replace function private.resolve_project_id_from_code(p_code text)
returns uuid
language plpgsql
stable
set search_path to ''
as $$
declare
  v_ids uuid[];
begin
  if private.normalize_land_view_project_code(p_code) is null then return null; end if;
  select array_agg(p.id order by p.project_code)
    into v_ids
  from public.projects p
  where private.normalize_land_view_project_code(p.project_code)=private.normalize_land_view_project_code(p_code);
  if coalesce(array_length(v_ids,1),0)=1 then return v_ids[1]; end if;
  return null;
end;
$$;

create or replace function private.canonical_project_code(p_project_id uuid)
returns text
language sql
stable
set search_path to ''
as $$
  select p.project_code from public.projects p where p.id=p_project_id
$$;

create unique index if not exists projects_normalized_project_code_uidx
on public.projects ((private.normalize_land_view_project_code(project_code)))
where project_code is not null;

create or replace function private.sync_project_code_pair()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  v_id uuid;
  v_code text;
begin
  if new.project_id is not null then
    v_code := private.canonical_project_code(new.project_id);
    if v_code is not null then new.project_code := v_code; end if;
  elsif nullif(trim(coalesce(new.project_code,'')),'') is not null then
    v_id := private.resolve_project_id_from_code(new.project_code);
    if v_id is not null then
      new.project_id := v_id;
      new.project_code := private.canonical_project_code(v_id);
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.sync_project_snapshot_pair()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  v_id uuid;
  v_code text;
begin
  if new.project_id is null and nullif(trim(coalesce(new.project_code_snapshot,'')),'') is not null then
    v_id := private.resolve_project_id_from_code(new.project_code_snapshot);
    if v_id is not null then new.project_id := v_id; end if;
  end if;
  if new.project_id is not null then
    v_code := private.canonical_project_code(new.project_id);
    if v_code is not null and (
      nullif(trim(coalesce(new.project_code_snapshot,'')),'') is null
      or private.normalize_land_view_project_code(new.project_code_snapshot)=private.normalize_land_view_project_code(v_code)
    ) then
      new.project_code_snapshot := v_code;
    end if;
  end if;
  return new;
end;
$$;

alter table public.certificate_requests add column if not exists project_id uuid;
alter table public.drawing_submissions add column if not exists project_id uuid;
alter table public.quotations add column if not exists project_id uuid;
alter table public.website_testimonials add column if not exists project_id uuid;

do $$
begin
  if not exists(select 1 from pg_constraint where conname='certificate_requests_project_id_fkey') then
    alter table public.certificate_requests add constraint certificate_requests_project_id_fkey foreign key(project_id) references public.projects(id) on update cascade on delete set null;
  end if;
  if not exists(select 1 from pg_constraint where conname='drawing_submissions_project_id_fkey') then
    alter table public.drawing_submissions add constraint drawing_submissions_project_id_fkey foreign key(project_id) references public.projects(id) on update cascade on delete set null;
  end if;
  if not exists(select 1 from pg_constraint where conname='quotations_project_id_fkey') then
    alter table public.quotations add constraint quotations_project_id_fkey foreign key(project_id) references public.projects(id) on update cascade on delete set null;
  end if;
  if not exists(select 1 from pg_constraint where conname='website_testimonials_project_id_fkey') then
    alter table public.website_testimonials add constraint website_testimonials_project_id_fkey foreign key(project_id) references public.projects(id) on update cascade on delete set null;
  end if;
  if not exists(select 1 from pg_constraint where conname='project_supplier_delivery_archive_project_id_fkey') then
    alter table public.project_supplier_delivery_archive add constraint project_supplier_delivery_archive_project_id_fkey foreign key(project_id) references public.projects(id) on update cascade on delete set null;
  end if;
end $$;

create index if not exists certificate_requests_project_id_idx on public.certificate_requests(project_id);
create index if not exists drawing_submissions_project_id_idx on public.drawing_submissions(project_id);
create index if not exists quotations_project_id_idx on public.quotations(project_id);
create index if not exists website_testimonials_project_id_idx on public.website_testimonials(project_id);
create index if not exists project_supplier_delivery_archive_project_id_idx on public.project_supplier_delivery_archive(project_id);

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'billing_adjustments','billing_events','billing_gate_overrides','billing_milestones',
    'payment_invoice_allocations','payment_receipts','payment_service_allocations',
    'project_contract_services','project_contracts','project_lifecycle_transitions','project_service_documents',
    'project_service_workflows','supervision_billing_rules','whatsapp_client_conversations',
    'certificate_requests','drawing_submissions','quotations','website_testimonials'
  ] loop
    execute format('drop trigger if exists trg_00_sync_project_identity on public.%I',v_table);
    execute format('create trigger trg_00_sync_project_identity before insert or update of project_id, project_code on public.%I for each row execute function private.sync_project_code_pair()',v_table);
  end loop;
end $$;

drop trigger if exists trg_00_sync_project_identity on public.transactions;
create trigger trg_00_sync_project_identity before insert or update of project_id, project_code_snapshot on public.transactions for each row execute function private.sync_project_snapshot_pair();

drop trigger if exists trg_00_sync_project_identity on public.project_management_ledger;
create trigger trg_00_sync_project_identity before insert or update of project_id, project_code_snapshot on public.project_management_ledger for each row execute function private.sync_project_snapshot_pair();

drop trigger if exists trg_00_sync_project_identity on public.project_supplier_delivery_archive;
create trigger trg_00_sync_project_identity before insert or update of project_id, project_code_snapshot on public.project_supplier_delivery_archive for each row execute function private.sync_project_snapshot_pair();

create or replace function private.resolve_payment_project_identity()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  v_code text;
  v_id uuid;
begin
  if new.project_id is null then
    v_code := substring(upper(concat_ws(' ',new.payment_for,new.notes,new.reference_no)) from 'LV-[0-9]+');
    v_id := private.resolve_project_id_from_code(v_code);
    if v_id is not null then new.project_id := v_id; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_00_resolve_payment_project on public.payments;
create trigger trg_00_resolve_payment_project before insert or update of project_id,payment_for,notes,reference_no on public.payments for each row execute function private.resolve_payment_project_identity();

alter table public.expenses add column if not exists is_legacy_manual boolean not null default false;
comment on column public.expenses.is_legacy_manual is 'Historical/manual expense already represented by a legacy ledger transaction; do not create a second automatic ledger entry.';

create or replace function private.resolve_expense_project_identity()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  v_code text;
  v_id uuid;
  v_name text;
begin
  if new.project_id is null then
    v_code := coalesce(nullif(trim(new.file_id),''),substring(upper(concat_ws(' ',new.description,new.notes,new.reference,new.reference_no)) from 'LV-[0-9]+'));
    v_id := private.resolve_project_id_from_code(v_code);
    if v_id is not null then new.project_id := v_id; end if;
  end if;
  if new.project_id is not null then
    v_code := private.canonical_project_code(new.project_id);
    select p.project_name into v_name from public.projects p where p.id=new.project_id;
    if v_code is not null and (nullif(trim(coalesce(new.file_id,'')),'') is null or private.normalize_land_view_project_code(new.file_id)=private.normalize_land_view_project_code(v_code)) then new.file_id := v_code; end if;
    if nullif(trim(coalesce(new.project_name_snapshot,'')),'') is null and v_name is not null then new.project_name_snapshot:=v_name; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_00_resolve_expense_project on public.expenses;
create trigger trg_00_resolve_expense_project before insert or update of project_id,file_id,description,notes,reference,reference_no on public.expenses for each row execute function private.resolve_expense_project_identity();

do $patch$
declare v_def text; v_old text; v_new text;
begin
  select pg_get_functiondef('private.sync_expense_transaction()'::regprocedure) into v_def;
  if position('coalesce(new.is_legacy_manual, false)' in v_def)=0 then
    v_old := E'begin\n  v_approval_status :=';
    v_new := E'begin\n  if coalesce(new.is_legacy_manual, false) then\n    delete from public.transactions where transaction_code = ''TXN-EXP-'' || new.expense_code;\n    return new;\n  end if;\n\n  v_approval_status :=';
    if position(v_old in v_def)=0 then raise exception 'Could not patch sync_expense_transaction legacy guard.'; end if;
    execute replace(v_def,v_old,v_new);
  end if;
end $patch$;

do $patch$
declare v_def text; v_old text; v_new text;
begin
  select pg_get_functiondef('public.billing_v2_payment_lifecycle_trigger()'::regprocedure) into v_def;
  if position('v_payment_status' in v_def)=0 then
    v_old := E'  v_status text;\n  v_actor text;';
    v_new := E'  v_status text;\n  v_payment_status text;\n  v_actor text;';
    if position(v_old in v_def)=0 then raise exception 'Could not patch billing payment lifecycle declarations.'; end if;
    v_def := replace(v_def,v_old,v_new);
    v_old := E'begin\n  if new.project_id is null then return new; end if;';
    v_new := E'begin\n  if new.project_id is null then return new; end if;\n  v_payment_status := lower(regexp_replace(coalesce(new.status, ''''), ''[_-]+'', '' '', ''g''));\n  if v_payment_status in (''void'',''voided'',''cancelled'',''canceled'',''rejected'') then return new; end if;';
    if position(v_old in v_def)=0 then raise exception 'Could not patch billing payment lifecycle status guard.'; end if;
    execute replace(v_def,v_old,v_new);
  end if;
end $patch$;

update public.transactions t
set project_id=private.resolve_project_id_from_code(t.project_code_snapshot),
    project_code_snapshot=private.canonical_project_code(private.resolve_project_id_from_code(t.project_code_snapshot))
where t.project_id is null and private.resolve_project_id_from_code(t.project_code_snapshot) is not null;

update public.transactions t
set project_code_snapshot=p.project_code
from public.projects p
where t.project_id=p.id
  and nullif(trim(coalesce(t.project_code_snapshot,'')),'') is not null
  and private.normalize_land_view_project_code(t.project_code_snapshot)=private.normalize_land_view_project_code(p.project_code)
  and t.project_code_snapshot is distinct from p.project_code;

update public.payments pay
set project_id=p.id,
    is_legacy_manual=true,
    affects_business_balance=false,
    ledger_transaction_id=t.id,
    ledger_transaction_code=t.transaction_code,
    ledger_verification_status='verified',
    ledger_verified_at=now(),
    ledger_verification_notes='Project identity consolidated against the existing manual-import ledger transaction; no duplicate ledger posting.'
from public.projects p
join public.transactions t on t.source_type='MANUAL_IMPORT'
where pay.project_id is null
  and lower(coalesce(pay.status,'')) not in ('void','voided','cancelled','canceled','rejected')
  and private.normalize_land_view_project_code(substring(upper(concat_ws(' ',pay.payment_for,pay.notes)) from 'LV-[0-9]+'))=private.normalize_land_view_project_code(p.project_code)
  and t.project_id=p.id
  and t.transaction_date=pay.payment_date
  and round(coalesce(t.credit,0),2)=round(coalesce(pay.amount,0),2)
  and private.normalize_land_view_project_code(t.project_code_snapshot)=private.normalize_land_view_project_code(p.project_code)
  and lower(trim(coalesce(t.description,'')))=lower(trim(coalesce(pay.payment_for,'')));

update public.payments pay
set project_id=private.resolve_project_id_from_code(substring(upper(concat_ws(' ',pay.payment_for,pay.notes,pay.reference_no)) from 'LV-[0-9]+'))
where pay.project_id is null
  and private.resolve_project_id_from_code(substring(upper(concat_ws(' ',pay.payment_for,pay.notes,pay.reference_no)) from 'LV-[0-9]+')) is not null;

update public.expenses e
set project_id=p.id,file_id=p.project_code,project_name_snapshot=p.project_name,is_legacy_manual=true
from public.projects p
join public.transactions t on t.source_type='MANUAL_IMPORT'
where e.project_id is null
  and lower(coalesce(e.status,'')) not in ('void','voided','cancelled','canceled','rejected')
  and private.normalize_land_view_project_code(substring(upper(concat_ws(' ',e.file_id,e.description,e.notes)) from 'LV-[0-9]+'))=private.normalize_land_view_project_code(p.project_code)
  and t.project_id=p.id
  and t.transaction_date=e.expense_date
  and round(coalesce(t.debit,0),2)=round(coalesce(e.amount,0),2)
  and lower(trim(coalesce(t.description,'')))=lower(trim(coalesce(e.description,'')));

update public.expenses e
set project_id=private.resolve_project_id_from_code(coalesce(nullif(trim(e.file_id),''),substring(upper(concat_ws(' ',e.description,e.notes,e.reference,e.reference_no)) from 'LV-[0-9]+')))
where e.project_id is null
  and private.resolve_project_id_from_code(coalesce(nullif(trim(e.file_id),''),substring(upper(concat_ws(' ',e.description,e.notes,e.reference,e.reference_no)) from 'LV-[0-9]+'))) is not null;

create or replace function private.sync_project_origin_conversion_codes()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if nullif(trim(coalesce(new.reclassified_proposal_code,'')),'') is not null then
    update public.proposals set converted_project_code=new.project_code,updated_at=now()
    where proposal_code=new.reclassified_proposal_code and converted_project_code is distinct from new.project_code;
  end if;
  if new.source_lead_id is not null then
    update public.website_leads set converted_project_code=new.project_code,updated_at=now()
    where id=new.source_lead_id and converted_project_code is distinct from new.project_code;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_project_origin_conversion_codes on public.projects;
create trigger trg_sync_project_origin_conversion_codes after insert or update of project_code,reclassified_proposal_code,source_lead_id on public.projects for each row execute function private.sync_project_origin_conversion_codes();

do $$
declare v_table text;
begin
  foreach v_table in array array[
    'billing_adjustments','billing_events','billing_gate_overrides','billing_milestones',
    'payment_invoice_allocations','payment_receipts','payment_service_allocations',
    'project_contract_services','project_contracts','project_lifecycle_transitions','project_service_documents',
    'project_service_workflows','supervision_billing_rules','whatsapp_client_conversations',
    'certificate_requests','drawing_submissions','quotations','website_testimonials'
  ] loop
    execute format('update public.%I x set project_id=private.resolve_project_id_from_code(x.project_code) where x.project_id is null and private.resolve_project_id_from_code(x.project_code) is not null',v_table);
    execute format('update public.%I x set project_code=private.canonical_project_code(x.project_id) where x.project_id is not null and private.canonical_project_code(x.project_id) is not null and x.project_code is distinct from private.canonical_project_code(x.project_id)',v_table);
  end loop;
end $$;
