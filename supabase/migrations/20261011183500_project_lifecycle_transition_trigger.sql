-- Capture project lifecycle history regardless of which application path changes a project.
create or replace function public.capture_project_lifecycle_transition()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.lifecycle_phase in ('Design Stage', 'Approval Stage', 'Supervision / Construction Stage', 'Completed') then
      insert into public.project_lifecycle_transitions (
        project_id, project_code, from_phase, to_phase, transition_type,
        reason, changed_by, changed_by_role, source, created_at
      ) values (
        new.id, new.project_code, null, new.lifecycle_phase, 'registration',
        'Project registered in LAND VIEW.', new.lifecycle_changed_by, null, 'project-lifecycle-trigger', now()
      );
    end if;
    return new;
  end if;

  if old.lifecycle_phase is distinct from new.lifecycle_phase
     and new.lifecycle_phase in ('Design Stage', 'Approval Stage', 'Supervision / Construction Stage', 'Completed') then
    insert into public.project_lifecycle_transitions (
      project_id, project_code, from_phase, to_phase, transition_type,
      reason, changed_by, changed_by_role, source, created_at
    ) values (
      new.id, new.project_code, old.lifecycle_phase, new.lifecycle_phase, 'advance',
      null, new.lifecycle_changed_by, null, 'project-lifecycle-trigger', now()
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_capture_project_lifecycle_transition on public.projects;
create trigger trg_capture_project_lifecycle_transition
after insert or update of lifecycle_phase on public.projects
for each row execute function public.capture_project_lifecycle_transition();
