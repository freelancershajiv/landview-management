-- Central WhatsApp operations layer for LAND VIEW.
-- Keeps existing finance/site/client outboxes intact while adding shared policy,
-- priority, template and recipient metadata for a single Admin control center.

create table if not exists public.whatsapp_templates (
  template_key text primary key,
  label text not null,
  module text not null,
  description text,
  body text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_templates_key_check check (template_key ~ '^[a-z0-9._-]{2,80}$'),
  constraint whatsapp_templates_message_token_check check (position('{{message}}' in body) > 0)
);

create table if not exists public.whatsapp_recipient_groups (
  slug text primary key,
  name text not null,
  destination_kind text not null default 'dynamic',
  target text,
  sender_employee_id text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_recipient_groups_slug_check check (slug ~ '^[a-z0-9._-]{2,80}$'),
  constraint whatsapp_recipient_groups_kind_check check (destination_kind in ('group','client','dynamic_project_group','dynamic'))
);

create table if not exists public.whatsapp_notification_rules (
  event_key text primary key,
  label text not null,
  module text not null,
  enabled boolean not null default true,
  priority text not null default 'routine',
  recipient_group_slug text,
  template_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_notification_rules_key_check check (event_key ~ '^[a-z0-9._-]{2,100}$'),
  constraint whatsapp_notification_rules_priority_check check (priority in ('critical','important','routine')),
  constraint whatsapp_notification_rules_group_fkey foreign key (recipient_group_slug) references public.whatsapp_recipient_groups(slug) on update cascade on delete set null,
  constraint whatsapp_notification_rules_template_fkey foreign key (template_key) references public.whatsapp_templates(template_key) on update cascade on delete set null
);

alter table public.whatsapp_templates enable row level security;
alter table public.whatsapp_recipient_groups enable row level security;
alter table public.whatsapp_notification_rules enable row level security;
revoke all on table public.whatsapp_templates from anon, authenticated;
revoke all on table public.whatsapp_recipient_groups from anon, authenticated;
revoke all on table public.whatsapp_notification_rules from anon, authenticated;
grant all on table public.whatsapp_templates to service_role;
grant all on table public.whatsapp_recipient_groups to service_role;
grant all on table public.whatsapp_notification_rules to service_role;

insert into public.whatsapp_templates (template_key,label,module,description,body,enabled)
values
  ('finance.payment','Payment Update','Finance','Wrapper for compact project finance updates.','{{message}}',true),
  ('finance.ledger','Finance Ledger','Finance','Wrapper for office/client ledger notifications.','{{message}}',true),
  ('billing.created','Bill Created','Billing','Wrapper for LAND VIEW bill notifications.','{{message}}',true),
  ('site.visit','Site Visit','Site Visit','Wrapper for site visit notifications.','{{message}}',true),
  ('client.project_update','Client Project Update','Client','Wrapper for direct client project updates.','{{message}}',true),
  ('contractor.update','Contractor Update','Project Management','Wrapper for contractor bill/progress updates.','{{message}}',true)
on conflict (template_key) do nothing;

insert into public.whatsapp_recipient_groups (slug,name,destination_kind,target,sender_employee_id,enabled)
values
  ('project-group','Project WhatsApp Group','dynamic_project_group',null,'EMP-0002',true),
  ('landview-finance','LAND VIEW Finance','group','name:LAND VIEW Finance','EMP-0002',true),
  ('site-team','Site / Project Team','dynamic_project_group',null,'EMP-0002',true),
  ('client','Registered Client','client',null,'EMP-0002',true),
  ('management','Management','group','IyK3AgVZUwB4g3XJ0qokmT','EMP-0002',true)
on conflict (slug) do nothing;

insert into public.whatsapp_notification_rules (event_key,label,module,enabled,priority,recipient_group_slug,template_key)
values
  ('finance.income','Project income','Finance',true,'important','project-group','finance.payment'),
  ('finance.expense','Project expense','Finance',true,'important','project-group','finance.payment'),
  ('finance.supplier_delivery','Supplier delivery','Finance',true,'routine','project-group','finance.payment'),
  ('finance.supplier_fund','Supplier fund','Finance',true,'important','project-group','finance.payment'),
  ('finance.cheque_cashed','Cheque cashed','Finance',true,'important','project-group','finance.payment'),
  ('finance.ledger','LAND VIEW ledger update','Finance',true,'important','landview-finance','finance.ledger'),
  ('billing.created','Bill created','Billing',true,'important','landview-finance','billing.created'),
  ('contractor.bill','Contractor bill certified','Project Management',true,'important','project-group','contractor.update'),
  ('contractor.progress','Contractor progress','Project Management',true,'routine','project-group','contractor.update'),
  ('site.visit','Site visit','Site Visit',true,'important','site-team','site.visit'),
  ('client.project_update','Client project update','Client',true,'routine','client','client.project_update'),
  ('client.reply','Admin/client reply','Client',true,'important','client',null),
  ('finance.update','Other project finance update','Finance',true,'routine','project-group','finance.payment')
on conflict (event_key) do nothing;

alter table public.whatsapp_finance_outbox add column if not exists event_key text;
alter table public.whatsapp_finance_outbox add column if not exists priority text not null default 'routine';
alter table public.whatsapp_finance_outbox add column if not exists recipient_group text;
alter table public.whatsapp_finance_outbox add column if not exists template_key text;
alter table public.whatsapp_site_visit_outbox add column if not exists event_key text;
alter table public.whatsapp_site_visit_outbox add column if not exists priority text not null default 'routine';
alter table public.whatsapp_site_visit_outbox add column if not exists recipient_group text;
alter table public.whatsapp_site_visit_outbox add column if not exists template_key text;
alter table public.whatsapp_client_outbox add column if not exists event_key text;
alter table public.whatsapp_client_outbox add column if not exists priority text not null default 'routine';
alter table public.whatsapp_client_outbox add column if not exists recipient_group text;
alter table public.whatsapp_client_outbox add column if not exists template_key text;

alter table public.whatsapp_finance_outbox drop constraint if exists whatsapp_finance_outbox_status_check;
alter table public.whatsapp_finance_outbox add constraint whatsapp_finance_outbox_status_check check (status in ('pending','sending','sent','failed','suppressed'));
alter table public.whatsapp_site_visit_outbox drop constraint if exists whatsapp_site_visit_outbox_status_check;
alter table public.whatsapp_site_visit_outbox add constraint whatsapp_site_visit_outbox_status_check check (status in ('pending','sending','sent','failed','suppressed'));
alter table public.whatsapp_client_outbox drop constraint if exists whatsapp_client_outbox_status_check;
alter table public.whatsapp_client_outbox add constraint whatsapp_client_outbox_status_check check (status in ('pending','sending','sent','failed','suppressed'));

alter table public.whatsapp_finance_outbox drop constraint if exists whatsapp_finance_outbox_priority_check;
alter table public.whatsapp_finance_outbox add constraint whatsapp_finance_outbox_priority_check check (priority in ('critical','important','routine'));
alter table public.whatsapp_site_visit_outbox drop constraint if exists whatsapp_site_visit_outbox_priority_check;
alter table public.whatsapp_site_visit_outbox add constraint whatsapp_site_visit_outbox_priority_check check (priority in ('critical','important','routine'));
alter table public.whatsapp_client_outbox drop constraint if exists whatsapp_client_outbox_priority_check;
alter table public.whatsapp_client_outbox add constraint whatsapp_client_outbox_priority_check check (priority in ('critical','important','routine'));

create index if not exists whatsapp_finance_outbox_event_status_idx on public.whatsapp_finance_outbox(event_key,status,created_at desc);
create index if not exists whatsapp_site_visit_outbox_event_status_idx on public.whatsapp_site_visit_outbox(event_key,status,created_at desc);
create index if not exists whatsapp_client_outbox_event_status_idx on public.whatsapp_client_outbox(event_key,status,created_at desc);

create or replace function public.apply_whatsapp_outbox_policy()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_rule public.whatsapp_notification_rules%rowtype;
  v_key text;
  v_template_body text;
  v_template_enabled boolean;
begin
  v_key := nullif(trim(coalesce(new.event_key,'')), '');

  if v_key is null then
    if tg_table_name = 'whatsapp_site_visit_outbox' then
      v_key := 'site.visit';
    elsif tg_table_name = 'whatsapp_client_outbox' then
      if lower(trim(coalesce(new.source,''))) in ('admin','bot','auto-reply','client-reply') then v_key := 'client.reply'; else v_key := 'client.project_update'; end if;
    elsif tg_table_name = 'whatsapp_finance_outbox' then
      if coalesce(new.dedupe_key,'') like 'landview-bill:%' then v_key := 'billing.created';
      elsif coalesce(new.dedupe_key,'') like 'landview-ledger:%' then v_key := 'finance.ledger';
      elsif coalesce(new.dedupe_key,'') like 'project-finance-cheque-cashed:%' then v_key := 'finance.cheque_cashed';
      elsif coalesce(new.dedupe_key,'') like 'project-finance:supplier_delivery:%' then v_key := 'finance.supplier_delivery';
      elsif coalesce(new.dedupe_key,'') like 'project-finance:supplier_advance_fund:%' then v_key := 'finance.supplier_fund';
      elsif coalesce(new.dedupe_key,'') like 'project-contractor-bill-certified:%' then v_key := 'contractor.bill';
      elsif coalesce(new.dedupe_key,'') like 'project-contractor-progress:%' then v_key := 'contractor.progress';
      elsif coalesce(new.message,'') ~* '(^|\n)Expense:' then v_key := 'finance.expense';
      elsif coalesce(new.message,'') ~* '(^|\n)Income:' then v_key := 'finance.income';
      elsif coalesce(new.message,'') ~* 'Client Payment|Received:' then v_key := 'finance.income';
      elsif coalesce(new.message,'') ~* 'Office Expense|Expense \|' then v_key := 'finance.expense';
      else v_key := 'finance.update';
      end if;
    end if;
  end if;

  new.event_key := v_key;
  select * into v_rule from public.whatsapp_notification_rules where event_key = v_key limit 1;
  if found then
    new.priority := coalesce(v_rule.priority,'routine');
    new.recipient_group := v_rule.recipient_group_slug;
    new.template_key := v_rule.template_key;
    if not coalesce(v_rule.enabled,true) then
      new.status := 'suppressed';
      new.last_error := 'Suppressed by WhatsApp notification rule.';
      return new;
    end if;
    if v_rule.template_key is not null then
      select body, enabled into v_template_body, v_template_enabled from public.whatsapp_templates where template_key=v_rule.template_key limit 1;
      if coalesce(v_template_enabled,false) and position('{{message}}' in coalesce(v_template_body,'')) > 0 then
        new.message := left(replace(v_template_body,'{{message}}',new.message),4000);
      end if;
    end if;
  else
    new.priority := coalesce(nullif(new.priority,''),'routine');
  end if;
  return new;
end;
$function$;

drop trigger if exists whatsapp_finance_outbox_policy on public.whatsapp_finance_outbox;
create trigger whatsapp_finance_outbox_policy before insert on public.whatsapp_finance_outbox for each row execute function public.apply_whatsapp_outbox_policy();
drop trigger if exists whatsapp_site_visit_outbox_policy on public.whatsapp_site_visit_outbox;
create trigger whatsapp_site_visit_outbox_policy before insert on public.whatsapp_site_visit_outbox for each row execute function public.apply_whatsapp_outbox_policy();
drop trigger if exists whatsapp_client_outbox_policy on public.whatsapp_client_outbox;
create trigger whatsapp_client_outbox_policy before insert on public.whatsapp_client_outbox for each row execute function public.apply_whatsapp_outbox_policy();

update public.whatsapp_finance_outbox set event_key = case
  when dedupe_key like 'landview-bill:%' then 'billing.created'
  when dedupe_key like 'landview-ledger:%' then 'finance.ledger'
  when dedupe_key like 'project-finance-cheque-cashed:%' then 'finance.cheque_cashed'
  when dedupe_key like 'project-finance:supplier_delivery:%' then 'finance.supplier_delivery'
  when dedupe_key like 'project-finance:supplier_advance_fund:%' then 'finance.supplier_fund'
  when dedupe_key like 'project-contractor-bill-certified:%' then 'contractor.bill'
  when dedupe_key like 'project-contractor-progress:%' then 'contractor.progress'
  when message ~* '(^|\n)Expense:' then 'finance.expense'
  when message ~* '(^|\n)Income:' then 'finance.income'
  when message ~* 'Client Payment|Received:' then 'finance.income'
  when message ~* 'Office Expense|Expense \|' then 'finance.expense'
  else 'finance.update' end
where event_key is null;
update public.whatsapp_site_visit_outbox set event_key='site.visit' where event_key is null;
update public.whatsapp_client_outbox set event_key=case when lower(trim(coalesce(source,''))) in ('admin','bot','auto-reply','client-reply') then 'client.reply' else 'client.project_update' end where event_key is null;

update public.whatsapp_finance_outbox o set priority=r.priority, recipient_group=r.recipient_group_slug, template_key=r.template_key from public.whatsapp_notification_rules r where r.event_key=o.event_key;
update public.whatsapp_site_visit_outbox o set priority=r.priority, recipient_group=r.recipient_group_slug, template_key=r.template_key from public.whatsapp_notification_rules r where r.event_key=o.event_key;
update public.whatsapp_client_outbox o set priority=r.priority, recipient_group=r.recipient_group_slug, template_key=r.template_key from public.whatsapp_notification_rules r where r.event_key=o.event_key;
