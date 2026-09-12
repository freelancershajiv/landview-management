# LAND VIEW portal redesign

Prepared on branch `design/distinct-responsive-portals`. Not pushed or deployed.

## Changes

- Management keeps its dark interface with a permanent desktop navigation rail and expandable mobile menu. Existing account, PIN, and role restrictions remain intact.
- Employees get a light, practical workspace with assignment summaries, an open-work queue, project documents, attendance and site visits. Header, navigation and card composition differ from management.
- Clients get a white project-focused space with a serif heading, rounded navigation, project overview before financial metrics, billing and certificate access. It differs from both other portals.
- Public home, services, service detail, team and shared navigation use the same signature red family as the app. Status colors remain meaningful.
- Mobile improvements include readable finance columns with contained horizontal scrolling, larger labels, stacked forms, accessible navigation states, visible sign-out controls, bounded dialogs, keyboard focus indicators and reduced motion.
- Login styles are scoped to the login page. On small screens, the sign-in form comes first; selecting a role changes its presentation. The logo now opens the public website instead of returning to the app login redirect.

## Review coverage

Inventoried all 22 page templates and their shared layouts, including public project details, all management pages, both portals, invoices and verification pages. Inspected the live public homepage, services, project listing, team and app login. Shared service-detail source covers ten service routes.

Private portal data and actions were reviewed in source only. No private records or authentication configuration were changed. Certificate and invoice verification layouts were retained.

## Validation and limitations

- Production build and TypeScript compilation passed.
- Git whitespace validation passed.
- Live private portals require authenticated sessions; their end-to-end workflows have not been tested.
- The available browser cannot open the local preview (`ERR_BLOCKED_BY_CLIENT`), so the new mobile and desktop layouts still need rendered visual verification on a preview deployment.
- Automatic approval review rejected the GitHub push because publishing source to the public repository was not explicitly authorized. This branch remains local.

## Before release

Authorize publishing this branch to `freelancershajiv/landview-management` and opening a draft pull request. Verify the preview on phone, tablet and desktop widths, and sign in with each role before merging. Production deployment is not included in that branch-publication approval.
