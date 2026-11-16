# LAND VIEW private CSS audit and theme migration

Scope: repository source on 17 November 2026; Admin, Project Management, Employee, Client. This is a code audit, not a logged-in browser screenshot regression run.

## Findings
- 1,159 tracked paths, 79 CSS files within app, of which 51 are private/shared theme or portal styles.
- 101 private route page files and 21 nested private route layouts.
- Root layout imports multiple palette/typography/contrast authority files; Admin and Project Management re-import several, with additional mobile and finance overrides.
- Historical .primary and .active classes mean different things across navigation, tabs and buttons. Never set their foreground globally.
- Big sources of cascade risk: app/globals.css, app/theme-colors.css, app/admin/admin-brand-theme.css, app/admin/admin-mobile-v5.css, project-finance theme files, and inline TSX style tags.

## Phase 1 implementation
- Single imported entrypoint app/private-theme.css in all four private top-level layouts, imported after legacy route CSS.
- Explicit semantic palette for both light/dark modes; LAND VIEW red preserved (#d61f26).
- The existing app/private-control-system.css button-variant contract is imported by this entrypoint, rather than repeated per layout.
- Opt-in reusable classes for cards, headings, labels, inputs, tables, badges and action rows.
- Accessible focus, disabled/error, mobile touch targets and reduced motion.
- Screen-only rules preserve current invoice, receipt and report print styles.
- Add source-level regression tests for imports, tokens and AA contrast.

## Ongoing migration order
1. Admin dashboard/sidebar/dock, Projects and Project Detail.
2. Billing, Due Bills, Invoice Center, Accounts and Project Management.
3. Proposals, registers, Employees and Site Visits.
4. Client and Employee portals plus smaller nested routes.
5. Remove redundant legacy authority files only after selector migration and visual testing.

## Rules for new code
Use --lv-surface-*, --lv-text-*, --lv-brand-*, --lv-control-* and semantic status tokens. Use components/lv-controls.tsx (data-lv-button variants), never bare .primary for a new button. Apply opt-in .lv-ui-* building blocks and keep module CSS for geometry only. Do not edit print/PDF styling as part of the screen theme.

## Release gates
Run npm test, npm run lint, npm run build; test 360/390/768 px and desktop widths, both modes, all four roles, sidebar/drawer/dock, dialogs, forms, tables, error/disabled, invoice print preview. Use one integrated preview rather than serial deployments. Do not promote to production without verification.

Important: the entrypoint establishes a single authority for new and migrated styles, but does not claim that every legacy inline color/style is already converted.
