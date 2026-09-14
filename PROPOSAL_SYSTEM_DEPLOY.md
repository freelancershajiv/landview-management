# LAND VIEW Proposal System

The proposal module stores prospects and proposals in the dedicated Google Sheet `LAND VIEW — Proposal & Prospective Client Database` and keeps them outside active project/accounting records until acceptance.

Workflow: save prospect and pricing → review and mark Prepared → print/save PDF (status becomes Sent) → record client outcome → convert Accepted proposal using a LAND VIEW Project ID.

Employee proposal access and actions are controlled by the V2 permission matrix. Employees see only proposals they created or were assigned unless `proposals.view_all` is enabled.

Certificate Requests and Certificates also honor explicit Employee permissions: Requests View, Certificates View, Certificates Process, and Certificates Issue.

## Apps Script deployment

`ManagementWorkspaceV2.gs` and `zz_ManagementWorkspacePolicyV2.gs` must be present in the Apps Script project used by `LAND_VIEW_API_URL`. After source changes, publish a new Apps Script web-app version so the production Next.js app can use the new backend behavior.
