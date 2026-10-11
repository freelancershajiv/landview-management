alter table public.project_management_ledger
  add column if not exists supplier_advance_applied numeric(14,2) not null default 0;

alter table public.project_management_ledger
  drop constraint if exists project_management_ledger_supplier_advance_applied_check;
alter table public.project_management_ledger
  add constraint project_management_ledger_supplier_advance_applied_check
  check (supplier_advance_applied >= 0 and supplier_advance_applied <= greatest(coalesce(credit,0),0));

-- Imported supplier rows marked PAID stay paid purchases. Only true Sattapur
-- advance deliveries are treated as non-cash deliveries.
update public.project_management_ledger l
set supplier_movement_type = case
  when l.debit > 0 then 'advance_fund'
  when l.credit > 0
       and a.supplier_key = public.normalize_supplier_key('Sattapur Brick Field')
       and l.entry_date not in (date '2025-11-20', date '2025-11-23') then 'delivery'
  when l.credit > 0 then 'direct_purchase'
  else coalesce(l.supplier_movement_type,'adjustment')
end,
supplier_advance_applied = 0
from public.project_supplier_accounts a
where l.supplier_account_id = a.id
  and coalesce(l.source_type,'') not in ('supplier_delivery','supplier_direct_purchase','supplier_advance_cash','supplier_advance_fund');

-- Apply explicit historical advances to the earliest paid purchases for each
-- non-Sattapur supplier. The remaining purchase value stays direct cash.
with funded as (
  select l.supplier_account_id,
         sum(case when l.supplier_movement_type='advance_fund' and coalesce(l.cheque_status,'') <> 'on_hold' then l.debit else 0 end) as funded
  from public.project_management_ledger l
  join public.project_supplier_accounts a on a.id=l.supplier_account_id
  where a.supplier_key <> public.normalize_supplier_key('Sattapur Brick Field')
  group by l.supplier_account_id
), purchases as (
  select l.id,l.supplier_account_id,l.credit,
         coalesce(sum(l.credit) over(
           partition by l.supplier_account_id
           order by l.entry_date,l.created_at,l.id
           rows between unbounded preceding and 1 preceding
         ),0) as prior_purchase
  from public.project_management_ledger l
  join public.project_supplier_accounts a on a.id=l.supplier_account_id
  where a.supplier_key <> public.normalize_supplier_key('Sattapur Brick Field')
    and l.supplier_movement_type='direct_purchase'
    and l.credit > 0
), allocation as (
  select p.id,
         greatest(0,least(p.credit,coalesce(f.funded,0)-p.prior_purchase)) as applied
  from purchases p
  left join funded f on f.supplier_account_id=p.supplier_account_id
)
update public.project_management_ledger l
set supplier_advance_applied = allocation.applied
from allocation
where l.id=allocation.id;

create index if not exists project_management_ledger_supplier_advance_applied_idx
  on public.project_management_ledger(project_id,supplier_account_id,supplier_advance_applied)
  where supplier_advance_applied > 0;