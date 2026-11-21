-- Keep the displayed workflow payment snapshot tied to the same calculation
-- as the final-delivery assertion. Invoice allocations and ledger rows
-- remain owned by the existing billing lifecycle.
create or replace function public.landview_store_verified_workflow_payment()
returns trigger language plpgsql set search_path = public as $$
begin
  new.paid_amount := public.landview_verified_service_paid(
    new.project_id, new.service_key, new.billing_category
  );
  return new;
end;
$$;

create or replace function public.landview_refresh_payment_workflows()
returns trigger language plpgsql set search_path = public as $$
declare
  old_project uuid;
  new_project uuid;
begin
  if tg_op <> 'INSERT' then old_project := old.project_id; end if;
  if tg_op <> 'DELETE' then new_project := new.project_id; end if;

  -- Acquire locks in a stable order before recomputing so simultaneous
  -- changes to separate receipts for the same service converge.
  perform id from public.project_service_workflows
    where project_id in (old_project, new_project)
    order by id for update;

  update public.project_service_workflows
    set paid_amount = paid_amount
    where project_id in (old_project, new_project);
  return null;
end;
$$;

revoke all on function public.landview_store_verified_workflow_payment() from public, anon, authenticated;
revoke all on function public.landview_refresh_payment_workflows() from public, anon, authenticated;
grant execute on function public.landview_store_verified_workflow_payment() to service_role;
grant execute on function public.landview_refresh_payment_workflows() to service_role;

create trigger trg_landview_verified_workflow_payment
before insert or update of paid_amount, project_id, service_key, billing_category
on public.project_service_workflows for each row
execute function public.landview_store_verified_workflow_payment();

create trigger trg_landview_refresh_workflows_from_payment
after insert or delete or update of project_id, amount, status, approval_status,
  affects_business_balance, transaction_type, payment_for, income_category, service_type
on public.payments for each row
execute function public.landview_refresh_payment_workflows();

create trigger trg_landview_refresh_workflows_from_service_allocation
after insert or delete or update of project_id, payment_id, service_key, allocated_amount
on public.payment_service_allocations for each row
execute function public.landview_refresh_payment_workflows();
