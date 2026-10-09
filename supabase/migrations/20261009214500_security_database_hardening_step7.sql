-- LAND VIEW Step 7: Security & Database Hardening
-- Applied to production before this repository record was created.

-- Keep the automatic RLS event trigger, but do not expose its SECURITY DEFINER
-- function through PostgREST RPC to anonymous or signed-in users.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- Internal server/gateway tables. Direct client privileges are unnecessary after
-- the Supabase server-gateway cutover. RLS remains enabled as defense in depth.
revoke all privileges on table public._ledger_import_staging from anon, authenticated;
revoke all privileges on table public.employee_location_checks from anon, authenticated;
revoke all privileges on table public.project_contractor_bills from anon, authenticated;
revoke all privileges on table public.project_contractor_contracts from anon, authenticated;
revoke all privileges on table public.project_management_summary from anon, authenticated;
revoke all privileges on table public.site_visit_media_jobs from anon, authenticated;
revoke all privileges on table public.whatsapp_finance_outbox from anon, authenticated;

-- Cover foreign keys used by proposals, employee location checks and WhatsApp.
create index if not exists employee_location_checks_matched_project_id_idx
  on public.employee_location_checks (matched_project_id);

create index if not exists proposal_activity_proposal_code_idx
  on public.proposal_activity (proposal_code);

create index if not exists proposal_items_proposal_code_idx
  on public.proposal_items (proposal_code);

create index if not exists proposals_prospect_code_idx
  on public.proposals (prospect_code);

create index if not exists whatsapp_client_conversations_client_id_idx
  on public.whatsapp_client_conversations (client_id);

create index if not exists whatsapp_client_conversations_project_id_idx
  on public.whatsapp_client_conversations (project_id);

create index if not exists whatsapp_client_outbox_conversation_id_idx
  on public.whatsapp_client_outbox (conversation_id);

-- These two indexes were identical on (project_id, visit_date desc). Keep the
-- more explicit project_visit_date index and remove the duplicate copy.
drop index if exists public.site_visits_project_date_idx;
