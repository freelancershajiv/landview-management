alter table public.projects
  add column if not exists project_management_enabled boolean not null default false;

alter table public.project_management_ledger
  add column if not exists serial_no bigint,
  add column if not exists entry_type text,
  add column if not exists payment_method text,
  add column if not exists cheque_status text,
  add column if not exists reference_no text,
  add column if not exists bank_name text,
  add column if not exists source_type text,
  add column if not exists source_id text,
  add column if not exists approval_status text not null default 'approved',
  add column if not exists approved_by text,
  add column if not exists approved_at timestamptz,
  add column if not exists updated_by text;

update public.projects p
set project_management_enabled = true
where p.project_management_enabled = false
  and (
    exists (select 1 from public.project_management_ledger l where l.project_id = p.id)
    or exists (select 1 from public.project_management_summary s where s.project_id = p.id)
    or exists (select 1 from public.project_contractor_contracts c where c.project_id = p.id)
    or exists (select 1 from public.project_contractor_bills b where b.project_id = p.id)
  );

with numbered as (
  select id,
         row_number() over (
           partition by project_id
           order by entry_date asc, created_at asc, id asc
         )::bigint as rn
  from public.project_management_ledger
  where serial_no is null
)
update public.project_management_ledger l
set serial_no = numbered.rn
from numbered
where l.id = numbered.id;

update public.project_management_ledger
set entry_type = case
      when debit > 0 and credit = 0 then 'income'
      when credit > 0 and debit = 0 then 'expense'
      else 'adjustment'
    end,
    payment_method = case
      when lower(trim(coalesce(category,''))) = 'cheque' then 'cheque'
      when lower(trim(coalesce(category,''))) = 'bank transfer' then 'bank_transfer'
      when lower(trim(coalesce(category,''))) in ('cash','scrap selling') then 'cash'
      else coalesce(payment_method,'unspecified')
    end,
    cheque_status = case
      when lower(trim(coalesce(category,''))) <> 'cheque' then null
      when coalesce(memo,'') ~* '^CHEQUE_STATUS:ON_HOLD' then 'on_hold'
      when coalesce(memo,'') ~* '^CHEQUE_STATUS:CASHED' then 'cashed'
      else coalesce(cheque_status,'cashed')
    end,
    source_type = coalesce(nullif(source_type,''), source),
    source_id = coalesce(
      nullif(source_id,''),
      substring(coalesce(memo,'') from '^MASTER_LEDGER:(?:transaction|expense):(.+)$')
    ),
    approval_status = coalesce(nullif(approval_status,''),'approved'),
    approved_by = coalesce(approved_by, created_by),
    approved_at = coalesce(approved_at, created_at),
    updated_by = coalesce(updated_by, created_by)
where true;

create unique index if not exists project_management_ledger_project_serial_uq
  on public.project_management_ledger(project_id, serial_no)
  where serial_no is not null;

create index if not exists projects_project_management_enabled_idx
  on public.projects(project_management_enabled)
  where project_management_enabled = true;

create index if not exists project_management_ledger_cheque_status_idx
  on public.project_management_ledger(project_id, cheque_status)
  where cheque_status is not null;

create or replace function public.normalize_project_management_ledger()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if new.serial_no is null then
    perform pg_advisory_xact_lock(hashtext(new.project_id::text));
    select coalesce(max(l.serial_no),0) + 1
      into new.serial_no
    from public.project_management_ledger l
    where l.project_id = new.project_id;
  end if;

  new.entry_type := case
    when coalesce(new.debit,0) > 0 and coalesce(new.credit,0) = 0 then 'income'
    when coalesce(new.credit,0) > 0 and coalesce(new.debit,0) = 0 then 'expense'
    else 'adjustment'
  end;

  if lower(trim(coalesce(new.category,''))) = 'cheque' then
    new.payment_method := 'cheque';
    if coalesce(new.memo,'') ~* '^CHEQUE_STATUS:ON_HOLD' then
      new.cheque_status := 'on_hold';
    elsif coalesce(new.memo,'') ~* '^CHEQUE_STATUS:CASHED' then
      new.cheque_status := 'cashed';
    else
      new.cheque_status := coalesce(nullif(new.cheque_status,''),'cashed');
    end if;
  else
    new.cheque_status := null;
    new.payment_method := coalesce(
      nullif(new.payment_method,''),
      case
        when lower(trim(coalesce(new.category,''))) = 'bank transfer' then 'bank_transfer'
        when lower(trim(coalesce(new.category,''))) in ('cash','scrap selling') then 'cash'
        else 'unspecified'
      end
    );
  end if;

  new.source_type := coalesce(nullif(new.source_type,''), new.source);
  if new.source_id is null and coalesce(new.memo,'') ~ '^MASTER_LEDGER:(transaction|expense):' then
    new.source_id := substring(new.memo from '^MASTER_LEDGER:(?:transaction|expense):(.+)$');
  end if;

  new.approval_status := coalesce(nullif(new.approval_status,''),'approved');
  new.approved_by := coalesce(new.approved_by,new.created_by);
  new.approved_at := coalesce(new.approved_at,new.created_at,now());
  new.updated_by := coalesce(new.updated_by,new.created_by);
  if tg_op = 'UPDATE' then new.updated_at := now(); end if;
  return new;
end;
$function$;

drop trigger if exists trg_normalize_project_management_ledger on public.project_management_ledger;
create trigger trg_normalize_project_management_ledger
before insert or update on public.project_management_ledger
for each row execute function public.normalize_project_management_ledger();

create or replace function public.audit_project_management_ledger()
returns trigger
language plpgsql
set search_path = public
as $function$
declare
  v_row public.project_management_ledger;
  v_actor text;
  v_action text;
begin
  if tg_op = 'DELETE' then
    v_row := old;
    v_actor := coalesce(old.updated_by,old.created_by,'LAND VIEW');
    v_action := 'project_management.delete';
  elsif tg_op = 'UPDATE' then
    v_row := new;
    v_actor := coalesce(new.updated_by,new.created_by,'LAND VIEW');
    v_action := 'project_management.update';
  else
    v_row := new;
    v_actor := coalesce(new.created_by,'LAND VIEW');
    v_action := 'project_management.create';
  end if;

  insert into public.app_audit_log(
    actor_user_key, action, target, outcome, details,
    actor_name, entity_type, entity_id, before_data, after_data, source
  ) values (
    v_actor,
    v_action,
    coalesce(v_row.project_code_snapshot,'PROJECT') || ' · PM-' || lpad(coalesce(v_row.serial_no,0)::text,6,'0'),
    'success',
    jsonb_build_object(
      'project_id',v_row.project_id,
      'project_code',v_row.project_code_snapshot,
      'serial_no',v_row.serial_no,
      'entry_type',v_row.entry_type,
      'payment_method',v_row.payment_method,
      'cheque_status',v_row.cheque_status
    ),
    v_actor,
    'project_management_ledger',
    v_row.id::text,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end,
    'database_trigger'
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

drop trigger if exists trg_audit_project_management_ledger on public.project_management_ledger;
create trigger trg_audit_project_management_ledger
after insert or update or delete on public.project_management_ledger
for each row execute function public.audit_project_management_ledger();
