do $$
begin
  if exists (select 1 from cron.job where jobid = 7) then
    perform cron.unschedule(7);
  end if;
end $$;

update public.supervision_billing_rules
set status = 'Stopped', updated_at = now()
where coalesce(status, '') <> 'Stopped';

update public.project_contract_services
set billing_model = 'manual', updated_at = now()
where lower(coalesce(billing_model, '')) = 'monthly';

create or replace function public.billing_v2_generate_monthly_supervision(p_as_of date default current_date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Monthly supervision automation was retired by LAND VIEW.
  -- Site supervision billing is manual / milestone-based only.
  return 0;
end;
$$;

comment on function public.billing_v2_generate_monthly_supervision(date)
is 'Retired compatibility stub. LAND VIEW does not use monthly supervision billing.';
