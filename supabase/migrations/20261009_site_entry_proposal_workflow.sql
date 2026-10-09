alter table public.proposals
  add column if not exists entry_source text not null default 'Manual',
  add column if not exists approval_status text not null default 'Approved',
  add column if not exists submitted_role text,
  add column if not exists approved_by text,
  add column if not exists approved_at timestamptz,
  add column if not exists approval_notes text,
  add column if not exists site_visit_date date,
  add column if not exists site_latitude double precision,
  add column if not exists site_longitude double precision,
  add column if not exists site_location_accuracy_m double precision,
  add column if not exists site_location_captured_at timestamptz,
  add column if not exists division text,
  add column if not exists district text,
  add column if not exists upazila_thana text,
  add column if not exists local_body_type text,
  add column if not exists local_body_name text,
  add column if not exists ward_no text,
  add column if not exists village_area text,
  add column if not exists road_holding text,
  add column if not exists mouza text,
  add column if not exists jl_no text,
  add column if not exists dag_no text,
  add column if not exists khatian_no text,
  add column if not exists site_notes text;

create index if not exists proposals_site_entry_status_idx
  on public.proposals (entry_source, approval_status, updated_at desc);

create or replace function public.guard_site_entry_project_conversion()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.converted_project_code is distinct from old.converted_project_code
     and new.converted_project_code is not null
     and coalesce(new.approval_status, 'Approved') <> 'Approved' then
    raise exception 'This site-entry proposal must be approved by Management or Admin before conversion to a project.';
  end if;
  return new;
end;
$$;

drop trigger if exists proposals_guard_site_entry_conversion on public.proposals;
create trigger proposals_guard_site_entry_conversion
before update of converted_project_code on public.proposals
for each row
execute function public.guard_site_entry_project_conversion();

create or replace function public.sync_site_entry_location_to_project()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.converted_project_code is distinct from old.converted_project_code
     and new.converted_project_code is not null then
    update public.projects
    set
      site_latitude = coalesce(new.site_latitude, site_latitude),
      site_longitude = coalesce(new.site_longitude, site_longitude),
      location_tag = case
        when new.site_latitude is not null and new.site_longitude is not null
          then trim(to_char(new.site_latitude, 'FM999999990.000000')) || ', ' || trim(to_char(new.site_longitude, 'FM999999990.000000'))
        else location_tag
      end,
      division = coalesce(nullif(new.division, ''), division),
      district = coalesce(nullif(new.district, ''), district),
      upazila_thana = coalesce(nullif(new.upazila_thana, ''), upazila_thana),
      local_body_type = coalesce(nullif(new.local_body_type, ''), local_body_type),
      local_body_name = coalesce(nullif(new.local_body_name, ''), local_body_name),
      ward_no = coalesce(nullif(new.ward_no, ''), ward_no),
      village_area = coalesce(nullif(new.village_area, ''), village_area),
      road_holding = coalesce(nullif(new.road_holding, ''), road_holding),
      notes = concat_ws(E'\n', nullif(notes, ''),
        case when new.entry_source = 'Site Entry' then 'Site entry: ' || new.proposal_code else null end,
        case when new.mouza is not null or new.jl_no is not null or new.dag_no is not null or new.khatian_no is not null
          then 'Land record — Mouza: ' || coalesce(new.mouza, '—') || '; JL: ' || coalesce(new.jl_no, '—') || '; Dag: ' || coalesce(new.dag_no, '—') || '; Khatian: ' || coalesce(new.khatian_no, '—')
          else null end,
        nullif(new.site_notes, '')
      ),
      updated_at = now()
    where project_code = new.converted_project_code;
  end if;
  return new;
end;
$$;

drop trigger if exists proposals_sync_site_entry_location on public.proposals;
create trigger proposals_sync_site_entry_location
after update of converted_project_code on public.proposals
for each row
execute function public.sync_site_entry_location_to_project();
