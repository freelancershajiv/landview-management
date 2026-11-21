-- Prevent Site Supervision / Site Visit work from being generated as project To Dos.
-- Keep the billed Site Supervision service, its Project Workflow, payment/delivery gates,
-- and Site Visits scheduling/reports unchanged. Do not disable Soil Test / Digital Survey.
begin;
set local lock_timeout='5s';
create or replace function public.landview_service_todo_steps(p_service_key text)
returns table(step_key text,title_suffix text,workflow_stage text,step_order int,due_in_days int,priority text,depends_on_step text,is_delivery_step boolean)
language sql stable set search_path=public as $function$
  select t.step_key,t.title_suffix,t.workflow_stage,t.step_order,t.due_in_days,t.priority,t.depends_on_step,t.is_delivery_step
  from public.service_todo_step_templates t
  where t.service_key=p_service_key and t.enabled=true and p_service_key <> 'site-supervision'
  union all
  select generic.step_key,generic.title_suffix,'Design Stage'::text,generic.step_order,generic.due_in_days,
    generic.priority,generic.depends_on_step,generic.is_delivery_step
  from (values
    ('scope'::text,'Review service scope'::text,10,2,'Normal'::text,null::text,false),
    ('prepare','Complete service work',20,5,'High','scope',false),
    ('review','Internal QA and final document preparation',30,7,'High','prepare',false),
    ('release','Deliver final service file to client',40,8,'High','review',true)
  ) as generic(step_key,title_suffix,step_order,due_in_days,priority,depends_on_step,is_delivery_step)
  where p_service_key <> 'site-supervision' and not exists (select 1 from public.service_todo_step_templates t
                    where t.service_key=p_service_key and t.enabled=true)
  order by step_order;
$function$;
do $$
begin
  if exists(select 1 from public.landview_service_todo_steps('site-supervision')) then
    raise exception 'Site Supervision To Dos are still generated';end if;
  if not exists(select 1 from public.landview_service_todo_steps('soil-test')) then
    raise exception 'Soil Test project work was unexpectedly disabled';end if;
  if not exists(select 1 from public.landview_service_todo_steps('digital-survey')) then
    raise exception 'Digital Survey project work was unexpectedly disabled';end if;
end $$;
commit;
