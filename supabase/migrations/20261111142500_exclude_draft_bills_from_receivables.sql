create or replace view public.project_billing as
 WITH bill_totals AS (
         SELECT b.project_id,
            sum(b.net_amount) FILTER (WHERE COALESCE(upper(b.status), 'ACTIVE'::text) <> ALL (ARRAY['VOID'::text, 'CANCELLED'::text, 'REJECTED'::text, 'DRAFT'::text]))::numeric(16,2) AS total_bill
           FROM bills b
          GROUP BY b.project_id
        ), payment_totals AS (
         SELECT pay.project_id,
            sum(pay.amount) FILTER (WHERE COALESCE(upper(pay.approval_status), 'APPROVED'::text) = 'APPROVED'::text AND (COALESCE(upper(pay.status), 'POSTED'::text) <> ALL (ARRAY['VOID'::text, 'CANCELLED'::text, 'REJECTED'::text])))::numeric(16,2) AS total_paid,
            max(pay.payment_date) FILTER (WHERE COALESCE(upper(pay.approval_status), 'APPROVED'::text) = 'APPROVED'::text AND (COALESCE(upper(pay.status), 'POSTED'::text) <> ALL (ARRAY['VOID'::text, 'CANCELLED'::text, 'REJECTED'::text]))) AS last_payment_date
           FROM payments pay
          GROUP BY pay.project_id
        ), writeoff_totals AS (
         SELECT w.project_id,
            GREATEST(sum(
                CASE
                    WHEN w.event_type = 'write_off'::text THEN w.amount
                    WHEN w.event_type = 'recovery'::text THEN - w.amount
                    ELSE 0::numeric
                END), 0::numeric)::numeric(16,2) AS active_writeoff
           FROM billing_writeoff_log w
          GROUP BY w.project_id
        )
 SELECT p.id AS project_id,
    p.project_code,
    p.project_name,
    p.client_id,
    c.client_code,
    COALESCE(c.name, p.client_name_snapshot) AS client_name,
    COALESCE(NULLIF(bt.total_bill, 0::numeric), p.design_bill, 0::numeric)::numeric(16,2) AS total_bill,
    COALESCE(pt.total_paid, 0::numeric)::numeric(16,2) AS paid_amount,
    GREATEST(COALESCE(NULLIF(bt.total_bill, 0::numeric), p.design_bill, 0::numeric) - COALESCE(pt.total_paid, 0::numeric) - COALESCE(wt.active_writeoff, 0::numeric), 0::numeric)::numeric(16,2) AS due_amount,
        CASE
            WHEN (COALESCE(pt.total_paid, 0::numeric) + COALESCE(wt.active_writeoff, 0::numeric)) >= COALESCE(NULLIF(bt.total_bill, 0::numeric), p.design_bill, 0::numeric) THEN 'FULL_PAID'::text
            ELSE 'DUE'::text
        END AS payment_status,
    pt.last_payment_date,
    p.updated_at
   FROM projects p
     LEFT JOIN clients c ON c.id = p.client_id
     LEFT JOIN bill_totals bt ON bt.project_id = p.id
     LEFT JOIN payment_totals pt ON pt.project_id = p.id
     LEFT JOIN writeoff_totals wt ON wt.project_id = p.id
  WHERE ( SELECT private.can_view_finance() AS can_view_finance);;
