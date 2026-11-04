-- LAND VIEW: bill-issued service -> To Do generation.
-- Existing manual To Dos, prior delivered services, and historical bills are preserved.
-- A single project/service creates at most one set of To Do steps, irrespective of invoices or bill edits.

alter table public.todo_items add column if not exists automation_key text;
alter table public.todo_items add column if not exists automation_source text;
alter table public.todo_items add column if not exists service_key text;
alter table public.todo_items add column if not exists workflow_stage text;
alter table public.todo_items add column if not exists dependency_todo_code text;
alter table public.todo_items add column if not exists is_delivery_step boolean not null default false;

create unique index if not exists todo_items_automation_key_uq
  on public.todo_items (automation_key) where automation_key is not null;

alter table public.todo_items
  drop constraint if exists todo_items_dependency_code_fkey;
alter table public.todo_items
  add constraint todo_items_dependency_code_fkey
    foreign key (dependency_todo_code) references public.todo_items(todo_code)
    on delete set null;
create index if not exists todo_items_auto_workflow_idx
  on public.todo_items(workflow_id,service_key) where automation_key is not null;

create table if not exists public.service_todo_step_templates (
  service_key text not null,
  service_name text not null,
  step_key text not null,
  title_suffix text not null,
  workflow_stage text not null,
  step_order int not null,
  due_in_days int not null check (due_in_days between 0 and 3650),
  priority text not null default 'Normal' check (priority in ('Low','Normal','High','Urgent')),
  depends_on_step text,
  is_delivery_step boolean not null default false,
  enabled boolean not null default true,
  primary key(service_key,step_key),
  unique(service_key,step_order)
);

create table if not exists public.service_todo_assignment_rules (
  service_key text primary key,
  assigned_employee_id uuid not null references public.employees(id) on delete cascade,
  assigned_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keeps a permanent idempotency record even if a user deletes a generated To Do.
create table if not exists public.service_todo_generation_log (
  automation_key text primary key,
  workflow_id uuid references public.project_service_workflows(id) on delete set null,
  todo_code text not null,
  generated_at timestamptz not null default now()
);

alter table public.service_todo_step_templates enable row level security;
alter table public.service_todo_assignment_rules enable row level security;
alter table public.service_todo_generation_log enable row level security;
revoke all on public.service_todo_step_templates,public.service_todo_assignment_rules,public.service_todo_generation_log
  from public,anon,authenticated;
grant select,insert,update,delete on public.service_todo_step_templates to service_role;
grant select,insert,update,delete on public.service_todo_assignment_rules to service_role;
grant select,insert,update,delete on public.service_todo_generation_log to service_role;

-- Design disciplines share the same auditable production/review/approval chain.
with service_list(service_name) as (values
  ('Architectural Design'),('Structural Design'),
  ('3D Design - Exterior'),('3D Design - Interior'),
  ('Electrical Design'),('Fire Safety Design'),('Plumbing Design'),
  ('Re-Design Fees')
), steps(step_key,title_suffix,step_order,due_in_days,priority,depends_on_step,is_delivery_step) as (values
  ('prepare','Prepare initial design',10,3,'Normal',null::text,false),
  ('internal-review','Internal design review',20,5,'High','prepare',false),
  ('client-feedback','Review feedback / revisions (preview only)',30,7,'Normal','internal-review',false),
  ('ready','Prepare approved final files (internal only)',40,10,'High','client-feedback',false),
  ('release','Deliver final approved files to client',50,11,'High','ready',true)
)
insert into public.service_todo_step_templates
(service_key,service_name,step_key,title_suffix,workflow_stage,step_order,due_in_days,priority,depends_on_step,is_delivery_step)
select public.billing_v2_service_key(s.service_name),s.service_name,t.step_key,t.title_suffix,'Design Stage',
       t.step_order,t.due_in_days,t.priority,t.depends_on_step,t.is_delivery_step
from service_list s cross join steps t on conflict do nothing;

with steps(step_key,title_suffix,step_order,due_in_days,priority,depends_on_step,is_delivery_step) as (values
  ('prepare','Prepare plan approval drawings',10,3,'Normal',null::text,false),
  ('review','Internal design review',20,5,'High','prepare',false),
  ('ready','Finalize approval drawing set (internal only)',30,8,'High','review',false),
  ('release','Deliver final plan approval drawing set',40,9,'High','ready',true)
)
insert into public.service_todo_step_templates
(service_key,service_name,step_key,title_suffix,workflow_stage,step_order,due_in_days,priority,depends_on_step,is_delivery_step)
select public.billing_v2_service_key('Plan Approval Design'),'Plan Approval Design',
       step_key,title_suffix,'Design Stage',step_order,due_in_days,priority,depends_on_step,is_delivery_step
from steps on conflict do nothing;

with steps(step_key,title_suffix,step_order,due_in_days,priority,depends_on_step,is_delivery_step) as (values
  ('takeoff','Complete quantity take-off',10,4,'Normal',null::text,false),
  ('prepare','Prepare estimate and costing',20,7,'High','takeoff',false),
  ('review','Internal estimate review',30,9,'High','prepare',false),
  ('ready','Prepare final approved BOQ / estimate',40,10,'High','review',false),
  ('release','Deliver approved estimate to client',50,11,'High','ready',true)
)
insert into public.service_todo_step_templates
(service_key,service_name,step_key,title_suffix,workflow_stage,step_order,due_in_days,priority,depends_on_step,is_delivery_step)
select public.billing_v2_service_key('Estimate & Costing'),'Estimate & Costing',
       step_key,title_suffix,'Design Stage',step_order,due_in_days,priority,depends_on_step,is_delivery_step
from steps on conflict do nothing;

with steps(step_key,title_suffix,step_order,due_in_days,priority,depends_on_step,is_delivery_step) as (values
  ('compile','Compile design book set',10,3,'Normal',null::text,false),
  ('review','QA and completeness review',20,5,'High','compile',false),
  ('ready','Ready final design book files for release',30,6,'Normal','review',false),
  ('release','Deliver design books to client',40,7,'High','ready',true)
)
insert into public.service_todo_step_templates
(service_key,service_name,step_key,title_suffix,workflow_stage,step_order,due_in_days,priority,depends_on_step,is_delivery_step)
select public.billing_v2_service_key('Design Books'),'Design Books',
       step_key,title_suffix,'Design Stage',step_order,due_in_days,priority,depends_on_step,is_delivery_step
from steps on conflict do nothing;

with service_list(service_name) as (values
  ('Municipality Land NOC'),('Municipality Approval Contract'),
  ('Municipality Approval'),('Fire Service Approval'),('District Vetting Committee Approval')
), steps(step_key,title_suffix,step_order,due_in_days,priority,depends_on_step,is_delivery_step) as (values
  ('prepare','Prepare drawings and application documents',10,3,'High',null::text,false),
  ('submit','Submit file to relevant authority',20,5,'High','prepare',false),
  ('followup','Follow up / address corrections',30,12,'Normal','submit',false),
  ('ready','Receive / verify final approval',40,20,'High','followup',false),
  ('release','Hand over final approval file to client',50,22,'High','ready',true)
)
insert into public.service_todo_step_templates
(service_key,service_name,step_key,title_suffix,workflow_stage,step_order,due_in_days,priority,depends_on_step,is_delivery_step)
select public.billing_v2_service_key(s.service_name),s.service_name,t.step_key,t.title_suffix,'Approval Stage',
       t.step_order,t.due_in_days,t.priority,t.depends_on_step,t.is_delivery_step
from service_list s cross join steps t on conflict do nothing;

with service_list(service_name,due_field,due_review) as (values
  ('Soil Test',5,10),('Digital Survey',4,6)
), steps(step_key,title_suffix,step_order,priority,depends_on_step,is_delivery_step) as (values
  ('schedule','Schedule field work',10,'High',null::text,false),
  ('field','Complete field work / inspection',20,'High','schedule',false),
  ('review','Receive and check report',30,'High','field',false),
  ('release','Deliver approved report to client',40,'High','review',true)
)
insert into public.service_todo_step_templates
(service_key,service_name,step_key,title_suffix,workflow_stage,step_order,due_in_days,priority,depends_on_step,is_delivery_step)
select public.billing_v2_service_key(s.service_name),s.service_name,t.step_key,t.title_suffix,'Design Stage',
       t.step_order,case t.step_key when 'schedule' then 2 when 'field' then s.due_field
         when 'review' then s.due_review else s.due_review+1 end,
       t.priority,t.depends_on_step,t.is_delivery_step
from service_list s cross join steps t on conflict do nothing;

with steps(step_key,title_suffix,step_order,due_in_days,priority,depends_on_step,is_delivery_step) as (values
  ('setup','Assign site engineer and setup supervision plan',10,2,'High',null::text,false),
  ('visit','Arrange initial site visit',20,5,'Normal','setup',false),
  ('review','Prepare and review supervision report',30,30,'High','visit',false),
  ('release','Deliver approved supervision report',40,31,'High','review',true)
)
insert into public.service_todo_step_templates
(service_key,service_name,step_key,title_suffix,workflow_stage,step_order,due_in_days,priority,depends_on_step,is_delivery_step)
select public.billing_v2_service_key('Site Supervision'),'Site Supervision',
       step_key,title_suffix,'Supervision / Construction Stage',step_order,due_in_days,priority,depends_on_step,is_delivery_step
from steps on conflict do nothing;

-- Fallback for any billable service without a discipline-specific template.
create or replace function public.landview_service_todo_steps(p_service_key text)
returns table(step_key text,title_suffix text,workflow_stage text,step_order int,due_in_days int,priority text,depends_on_step text,is_delivery_step boolean)
language sql stable set search_path=public as $function$
  select t.step_key,t.title_suffix,t.workflow_stage,t.step_order,t.due_in_days,t.priority,t.depends_on_step,t.is_delivery_step
  from public.service_todo_step_templates t
  where t.service_key=p_service_key and t.enabled=true
  union all
  select generic.step_key,generic.title_suffix,'Design Stage'::text,generic.step_order,generic.due_in_days,
    generic.priority,generic.depends_on_step,generic.is_delivery_step
  from (values
    ('scope'::text,'Review service scope'::text,10,2,'Normal'::text,null::text,false),
    ('prepare','Complete service work',20,5,'High','scope',false),
    ('review','Internal QA and final document preparation',30,7,'High','prepare',false),
    ('release','Deliver final service file to client',40,8,'High','review',true)
  ) as generic(step_key,title_suffix,step_order,due_in_days,priority,depends_on_step,is_delivery_step)
  where not exists (select 1 from public.service_todo_step_templates t
                    where t.service_key=p_service_key and t.enabled=true)
  order by step_order;
$function$;

-- Single idempotent generator, invoked within the same transaction as bill issuance.
create or replace function public.landview_generate_service_todos(p_workflow_id uuid)
returns integer language plpgsql set search_path=public as $function$
declare
  w public.project_service_workflows%rowtype;
  t record;
  v_key text;
  v_parent text;
  v_code text;
  v_emp uuid;
  v_name text;
  v_start date := (now() at time zone 'Asia/Dhaka')::date;
  v_count int := 0;
begin
  select * into w from public.project_service_workflows where id=p_workflow_id;
  if w.id is null or w.service_key is null then return 0; end if;
  -- A paid or unpaid *issued* bill, not merely a proposal, must exist.
  if public.landview_issued_service_total(w.project_id,w.service_key) < 0.01 then return 0; end if;
  -- Never reactivate closed historical projects.
  if exists(select 1 from public.projects p where p.id=w.project_id and p.lifecycle_phase='Completed') then return 0; end if;

  -- Prefer the responsibility owner already explicitly assigned to this project's service.
  select task.assigned_employee_id into v_emp
  from public.tasks task join public.employees emp on emp.id=task.assigned_employee_id
  where task.project_id=w.project_id
    and lower(coalesce(emp.status,''))='active'
    and public.billing_v2_service_key(coalesce(task.source_service,''))=w.service_key
  order by task.updated_at desc nulls last limit 1;
  if v_emp is null then
    select r.assigned_employee_id into v_emp
      from public.service_todo_assignment_rules r join public.employees emp
        on emp.id=r.assigned_employee_id and lower(coalesce(emp.status,''))='active'
      where r.service_key=w.service_key limit 1;
  end if;
  if v_emp is not null then
    select concat_ws(' · ',e.employee_code,e.name) into v_name from public.employees e where e.id=v_emp;
  end if;

  for t in select * from public.landview_service_todo_steps(w.service_key) loop
    v_key := 'BILLTODO::'||w.project_code||'::'||w.service_key||'::'||t.step_key;
    -- Honor deleted/cancelled generated items; bill edits must not recreate them.
    if exists(select 1 from public.service_todo_generation_log l where l.automation_key=v_key) then continue; end if;
    select dependency.todo_code into v_parent from public.todo_items dependency
      where dependency.automation_key=
        'BILLTODO::'||w.project_code||'::'||w.service_key||'::'||coalesce(t.depends_on_step,'')
      limit 1;
    v_code := 'TODO-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
    insert into public.todo_items (
      todo_code,title,description,status,priority,due_date,reference_type,project_code,
      workflow_id,assigned_employee_id,assigned_to,created_by,automation_key,automation_source,
      service_key,workflow_stage,dependency_todo_code,is_delivery_step
    ) values (
      v_code,left(w.service_name||': '||t.title_suffix,240),
      left('Created from issued service bill. Stage: '||t.workflow_stage||
        case when t.depends_on_step is not null then '. Finish the prior To Do first' else '' end||
        case when t.is_delivery_step then '. FINAL DELIVERY requires verified full service payment and approval' else '' end,4000),
      'To Do',t.priority,v_start+t.due_in_days,'Project',w.project_code,w.id,
      v_emp,v_name,'Bill Issued Automation',v_key,'Bill Issued',w.service_key,
      t.workflow_stage,v_parent,t.is_delivery_step
    ) on conflict (automation_key) where automation_key is not null do nothing;
    if found then
      insert into public.service_todo_generation_log(automation_key,workflow_id,todo_code)
        values (v_key,w.id,v_code) on conflict do nothing;
      v_count:=v_count+1;
    end if;
  end loop;
  return v_count;
end;
$function$;

create or replace function public.landview_generate_todos_on_bill_issue()
returns trigger language plpgsql set search_path=public as $function$
declare
  v_service text;
  v_key text;
  v_workflow_id uuid;
begin
  if lower(trim(coalesce(new.status,''))) not in ('issued','unpaid','partially paid','paid','open')
     or coalesce(new.amount,0)-coalesce(new.discount,0)<=0
     or lower(coalesce(new.created_via,'')) like '%credit note%'
     or lower(coalesce(new.created_via,'')) like '%debit note%' then return new; end if;
  -- Handles issuance, a valid service correction, and transitions from draft.
  v_service := public.landview_bill_service_label(new.description,coalesce(new.billing_category,new.category,''));
  v_key := public.billing_v2_service_key(v_service);
  if nullif(v_key,'') is null then return new; end if;
  select w.id into v_workflow_id from public.project_service_workflows w
  where w.project_id=new.project_id and w.service_key=v_key limit 1;
  if v_workflow_id is not null then perform public.landview_generate_service_todos(v_workflow_id); end if;
  return new;
end;
$function$;

-- Must run AFTER trg_landview_bill_issued_starts_work (alphabetical trigger order).
drop trigger if exists zz_landview_generate_todos_on_bill_issue on public.bills;
create trigger zz_landview_generate_todos_on_bill_issue
after insert or update of status,amount,discount,description,billing_category,category
on public.bills for each row execute function public.landview_generate_todos_on_bill_issue();

-- Protect automated task links and enforce dependencies plus full payment at completion.
create or replace function public.landview_validate_automated_todo()
returns trigger language plpgsql set search_path=public as $function$
declare
  parent_status text;
  w public.project_service_workflows%rowtype;
begin
  if old.automation_source is distinct from 'Bill Issued' then return new; end if;
  if new.automation_key is distinct from old.automation_key
     or new.automation_source is distinct from old.automation_source
     or new.workflow_stage is distinct from old.workflow_stage
     or new.service_key is distinct from old.service_key
     or new.workflow_id is distinct from old.workflow_id
     or new.project_code is distinct from old.project_code
     or new.reference_type is distinct from old.reference_type
     or new.dependency_todo_code is distinct from old.dependency_todo_code
     or new.is_delivery_step is distinct from old.is_delivery_step then
    raise exception 'An automatically generated bill task cannot be relinked. Edit its title, deadline, or assignee instead.';
  end if;
  if new.status='Done' and old.status is distinct from 'Done' then
    if new.dependency_todo_code is not null then
      select status into parent_status from public.todo_items where todo_code=new.dependency_todo_code;
      if parent_status is distinct from 'Done' then
        raise exception 'Complete the preceding To Do (%) before this task.',new.dependency_todo_code;
      end if;
    end if;
    if new.is_delivery_step then
      select * into w from public.project_service_workflows where id=new.workflow_id;
      if w.id is null then raise exception 'Service workflow is required for final delivery.'; end if;
      perform public.landview_assert_service_fully_paid(w.project_id,w.service_key,w.billing_category,w.service_name);
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists todo_items_validate_bill_automation on public.todo_items;
create trigger todo_items_validate_bill_automation before update on public.todo_items
for each row execute function public.landview_validate_automated_todo();

-- Configuring a default owner fills existing unassigned automated To Dos without
-- overwriting manual assignments or completed items.
create or replace function public.landview_apply_todo_default_owner()
returns trigger language plpgsql set search_path=public as $function$
declare v_name text;
begin
  select concat_ws(' · ',e.employee_code,e.name) into v_name
    from public.employees e where e.id=new.assigned_employee_id and lower(coalesce(e.status,''))='active';
  if v_name is null then raise exception 'A service owner must be an active employee.'; end if;
  update public.todo_items t
     set assigned_employee_id=new.assigned_employee_id,assigned_to=v_name,updated_at=now()
   where t.automation_source='Bill Issued' and t.service_key=new.service_key
     and t.assigned_employee_id is null and t.status<>'Done';
  return new;
end;
$function$;

drop trigger if exists service_todo_assignment_fill_unassigned on public.service_todo_assignment_rules;
create trigger service_todo_assignment_fill_unassigned
after insert or update of assigned_employee_id on public.service_todo_assignment_rules
for each row execute function public.landview_apply_todo_default_owner();

-- These are internal server-side functions, never direct client RPCs.
revoke all on function public.landview_service_todo_steps(text) from public,anon,authenticated;
revoke all on function public.landview_generate_service_todos(uuid) from public,anon,authenticated;
revoke all on function public.landview_generate_todos_on_bill_issue() from public,anon,authenticated;
revoke all on function public.landview_validate_automated_todo() from public,anon,authenticated;
revoke all on function public.landview_apply_todo_default_owner() from public,anon,authenticated;
grant execute on function public.landview_service_todo_steps(text) to service_role;
grant execute on function public.landview_generate_service_todos(uuid) to service_role;
grant execute on function public.landview_generate_todos_on_bill_issue() to service_role;
grant execute on function public.landview_validate_automated_todo() to service_role;
grant execute on function public.landview_apply_todo_default_owner() to service_role;
