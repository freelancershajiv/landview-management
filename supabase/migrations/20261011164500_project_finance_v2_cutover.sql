alter table public.project_management_summary
  add column if not exists finance_v2_opening_cash numeric(16,2),
  add column if not exists finance_v2_cutover_at timestamptz,
  add column if not exists finance_v2_enabled boolean not null default false;

comment on column public.project_management_summary.finance_v2_opening_cash is
  'Verified project cash position frozen at the Finance V2 cutover. Future semantic cash events move forward from this amount.';
comment on column public.project_management_summary.finance_v2_cutover_at is
  'Timestamp after which project_finance_v2 ledger rows are applied to the frozen opening cash balance.';

-- LV-157 is the only project currently enabled for Project Management.
-- Preserve every historical ledger row; derive the verified legacy cash position
-- using the existing Sattapur treatment, while excluding cheques that remain on hold.
with target as (
  select id
  from public.projects
  where project_code = 'LV-157'
    and project_management_enabled = true
  limit 1
), calculated as (
  select
    l.project_id,
    round(coalesce(sum(l.debit),0),2) as recorded_funding,
    round(coalesce(sum(
      case
        when (
          public.normalize_supplier_key(coalesce(nullif(l.paid_to,''),nullif(l.supplier,''),'')) = public.normalize_supplier_key('Sattapur Brick Field')
          or lower(coalesce(l.details,'')) like '%sattapur brick%'
        )
        and l.credit > 0
        and l.entry_date not in (date '2025-11-20', date '2025-11-23')
        and lower(trim(coalesce(l.category,''))) = 'bricks'
          then 0
        when (
          public.normalize_supplier_key(coalesce(nullif(l.paid_to,''),nullif(l.supplier,''),'')) = public.normalize_supplier_key('Sattapur Brick Field')
          or lower(coalesce(l.details,'')) like '%sattapur brick%'
        ) and l.debit > 0
          then l.debit
        else l.credit
      end
    ),0),2) as legacy_cash_out,
    round(coalesce(sum(
      case
        when lower(coalesce(l.payment_method,'')) = 'cheque'
         and lower(coalesce(l.cheque_status,'')) = 'on_hold'
          then l.debit
        else 0
      end
    ),0),2) as held_cheques
  from public.project_management_ledger l
  join target t on t.id = l.project_id
  where lower(coalesce(l.approval_status,'approved')) in ('approved','verified','posted','paid','complete','completed')
  group by l.project_id
), opening as (
  select project_id,
         round(recorded_funding - legacy_cash_out - held_cheques,2) as opening_cash
  from calculated
)
update public.project_management_summary s
set finance_v2_opening_cash = o.opening_cash,
    finance_v2_cutover_at = now(),
    finance_v2_enabled = true,
    updated_at = now()
from opening o
where s.project_id = o.project_id
  and s.finance_v2_opening_cash is null;

create index if not exists project_management_summary_finance_v2_enabled_idx
  on public.project_management_summary(project_id)
  where finance_v2_enabled = true;
