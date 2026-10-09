alter table public.proposals
  add column if not exists referred_by text,
  add column if not exists ref_contact text,
  add column if not exists location_tag text,
  add column if not exists start_date date,
  add column if not exists design_stage_status text,
  add column if not exists approval_stage_status text,
  add column if not exists supervision_stage_status text,
  add column if not exists site_geofence_radius_m integer;

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
      project_name = coalesce(nullif(new.project_title, ''), project_name),
      client_name_snapshot = coalesce(nullif(new.client_name, ''), client_name_snapshot),
      phone_number_snapshot = coalesce(nullif(new.phone, ''), phone_number_snapshot),
      referred_by = coalesce(nullif(new.referred_by, ''), referred_by),
      ref_contact = coalesce(nullif(new.ref_contact, ''), ref_contact),
      project_type = coalesce(nullif(new.project_type, ''), project_type),
      location = coalesce(nullif(new.project_location, ''), location),
      location_tag = coalesce(
        nullif(new.location_tag, ''),
        case
          when new.site_latitude is not null and new.site_longitude is not null
            then 'https://www.google.com/maps?q=' || trim(to_char(new.site_latitude, 'FM999999990.00000000')) || ',' || trim(to_char(new.site_longitude, 'FM999999990.00000000'))
          else null
        end,
        location_tag
      ),
      project_area_text = coalesce(nullif(new.plot_area, ''), project_area_text),
      number_of_stories_text = coalesce(nullif(new.floors, ''), number_of_stories_text),
      floors = case
        when new.floors ~ '^\s*\d+\s*$' then new.floors::integer
        else floors
      end,
      start_date = coalesce(new.start_date, start_date),
      design_stage_status = coalesce(nullif(new.design_stage_status, ''), design_stage_status),
      approval_stage_status = coalesce(nullif(new.approval_stage_status, ''), approval_stage_status),
      supervision_stage_status = coalesce(nullif(new.supervision_stage_status, ''), supervision_stage_status),
      site_latitude = coalesce(new.site_latitude, site_latitude),
      site_longitude = coalesce(new.site_longitude, site_longitude),
      site_geofence_radius_m = coalesce(new.site_geofence_radius_m, site_geofence_radius_m),
      public_map_enabled = case
        when nullif(new.location_tag, '') is not null or (new.site_latitude is not null and new.site_longitude is not null) then true
        else public_map_enabled
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
