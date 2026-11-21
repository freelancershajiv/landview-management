-- LAND VIEW: keep the scheduled Site Visit / construction supervision domain out of To Do.
-- Run as one Supabase tracked migration BEFORE deploying the related application commit.
-- No DELETE, no workflow modifications, no changes to Site Visit reports or tasks.
begin;
set local lock_timeout='5s';
alter table public.todo_items add column if not exists work_area text not null default 'projects';
update public.todo_items set work_area='site_visits'
where todo_code in ('TODO-EBEEC91244','TODO-C97A96C6E4','TODO-46606DD1B3')
  and title ilike 'Start Site Supervision%'
  and work_area='projects';
do $$
declare n integer;
begin
  select count(*) into n from public.todo_items
  where todo_code in ('TODO-EBEEC91244','TODO-C97A96C6E4','TODO-46606DD1B3') and work_area='site_visits';
  if n<>3 then raise exception 'Expected exactly three historical Site Supervision To Dos, found %',n;end if;
  if exists(select 1 from public.todo_items where work_area='projects' and
    (title ~* 'site[[:space:]]+visits?|site[[:space:]]+inspections?' or title ~* '^start[[:space:]]+site[[:space:]]+supervision' or title ~* '^resolve[[:space:]]+site[[:space:]]+issue')) then
    raise exception 'Unclassified site visit To Dos found; review them before migrating';
  end if;
end $$;
alter table public.todo_items add constraint todo_items_work_area_check
  check (work_area in ('projects','site_visits'));
alter table public.todo_items add constraint todo_items_no_new_site_visit_todos
  check (work_area='site_visits' or not (
      title ~* 'site[[:space:]]+visits?|site[[:space:]]+inspections?'
      or title ~* '^start[[:space:]]+site[[:space:]]+supervision'
      or title ~* '^resolve[[:space:]]+site[[:space:]]+issue'
    ));
-- Site Visit corrective actions belong to the Site Visits module, not project To Do automation.
update public.todo_automation_rules set enabled=false,updated_at=now()
where rule_key='site_issue' and enabled=true;
commit;
