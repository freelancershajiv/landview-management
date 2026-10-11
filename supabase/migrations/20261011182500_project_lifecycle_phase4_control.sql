-- Phase 4: end-to-end Site Entry -> Proposal -> Project lifecycle control.
-- Additive only: preserves all existing proposals, projects and finance history.

alter table public.proposals
  add column if not exists source_lead_id uuid,
  add column if not exists source_lead_code text;

alter table public.projects
  add column if not exists source_lead_id uuid,
  add column if not exists source_lead_code text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'proposals_source_lead_id_fkey'
  ) then
    alter table public.proposals
      add constraint proposals_source_lead_id_fkey
      foreign key (source_lead_id) references public.website_leads(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'projects_source_lead_id_fkey'
  ) then
    alter table public.projects
      add constraint projects_source_lead_id_fkey
      foreign key (source_lead_id) references public.website_leads(id) on delete set null;
  end if;
end $$;

create index if not exists idx_proposals_source_lead_id on public.proposals(source_lead_id);
create index if not exists idx_projects_source_lead_id on public.projects(source_lead_id);

create table if not exists public.project_lifecycle_transitions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  project_code text not null,
  from_phase text,
  to_phase text not null,
  transition_type text not null default 'advance',
  reason text,
  changed_by text,
  changed_by_role text,
  source text not null default 'lifecycle-center',
  created_at timestamptz not null default now(),
  constraint project_lifecycle_transition_type_check
    check (transition_type in ('registration', 'advance', 'correction', 'backfill')),
  constraint project_lifecycle_to_phase_check
    check (to_phase in ('Design Stage', 'Approval Stage', 'Supervision / Construction Stage', 'Completed'))
);

create index if not exists idx_project_lifecycle_transitions_project
  on public.project_lifecycle_transitions(project_id, created_at desc);
create index if not exists idx_project_lifecycle_transitions_code
  on public.project_lifecycle_transitions(project_code, created_at desc);

alter table public.project_lifecycle_transitions enable row level security;

-- Backfill explicit source relationships for previously converted website enquiries.
update public.proposals p
set source_lead_id = wl.id,
    source_lead_code = wl.lead_code
from public.website_leads wl
where wl.converted_proposal_code = p.proposal_code
  and p.source_lead_id is null;

update public.projects p
set source_lead_id = wl.id,
    source_lead_code = wl.lead_code
from public.website_leads wl
where wl.converted_project_code = p.project_code
  and p.source_lead_id is null;

-- Preserve the proposal -> project link for converted historical proposals when it is missing.
update public.projects p
set reclassified_proposal_code = q.proposal_code
from public.proposals q
where q.converted_project_code = p.project_code
  and nullif(trim(coalesce(p.reclassified_proposal_code, '')), '') is null;

-- Record today's baseline without changing any existing project stage.
insert into public.project_lifecycle_transitions (
  project_id,
  project_code,
  from_phase,
  to_phase,
  transition_type,
  reason,
  changed_by,
  changed_by_role,
  source
)
select
  p.id,
  p.project_code,
  null,
  case
    when p.lifecycle_phase in ('Design Stage', 'Approval Stage', 'Supervision / Construction Stage', 'Completed')
      then p.lifecycle_phase
    else 'Design Stage'
  end,
  'backfill',
  'Baseline captured during Phase 4 lifecycle rollout.',
  'system',
  'system',
  'phase4-backfill'
from public.projects p
where not exists (
  select 1
  from public.project_lifecycle_transitions t
  where t.project_id = p.id
    and t.transition_type = 'backfill'
);
