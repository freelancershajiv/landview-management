# Work Management 2.0 release gate

All five phases are staged on work-management-v2. Do not promote based on the Phase 1 preview.

1. Run npm ci, npx tsc --noEmit, npm run build, and node --test tests/todo-review-policy.test.cjs tests/work-task-links.test.cjs tests/work-day-policy.test.cjs tests/work-intelligence.test.cjs tests/bill-todo-automation.test.cjs tests/bill-issued-workflow.test.cjs.
2. Verify current production branch has not diverged; merge/reconcile before creating a release preview.
3. Back up the todo_items schema and records using approved secure backup procedures. Verify the existing bill-issued generation and payment delivery triggers remain active.
4. Apply the two additive scripts in supabase/release as tracked migrations, in order: work-management-v2-review.sql then work-management-v2-planning.sql. Prefer an isolated database for testing; if only the production DB is available, obtain approval before applying migrations, and keep old application behavior compatible. No mass review backfill.
5. Verify admin/manager and employee authorization, task submission/revision/approval, state reset on assignment change, blocked task and payment delivery checks, scoped links, personal plan and work estimates, team dashboard, CSV export and small screen layout. Do not test mutations on live business records.
6. Use one consolidated release preview, only after code checks. Validate authenticated runtime and verify production remains unchanged. Promote only after checks pass and any migration risks are resolved.
7. Rollback application code by prior verified deployment if necessary. Do not drop review/planning columns after real users have created review records; preserve data and plan a forward fix. Existing finance records must not be changed.
