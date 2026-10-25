create index if not exists billing_events_contract_idx on public.billing_events(contract_id);
create index if not exists billing_events_contract_service_idx on public.billing_events(contract_service_id);
create index if not exists billing_events_milestone_idx on public.billing_events(milestone_id);
create index if not exists billing_milestones_bill_idx on public.billing_milestones(bill_id);
create index if not exists billing_milestones_contract_idx on public.billing_milestones(contract_id);
