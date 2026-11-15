# LAND VIEW private UI: centralized control contract

## Why this exists

The private portal has many legacy stylesheets and route/component-scoped rules. A bare
`.primary` is ambiguous: it can mean a solid red action, a soft selected tab, or
a green WhatsApp action. Setting `color: white !important` independently from
background produced hard-to-read labels in both themes.

**New work must never add page-specific filled-button background and text colors.**
Use the typed controls in `components/lv-controls.tsx` or place
`data-lv-button="<variant>"` on an existing button/link.

The authoritative screen-only CSS is `app/private-control-system.css`. Its variant
contract is imported **last** by Admin, Project Management, Employee, and Client
layouts. It is deliberately not used on the public site or print/PDF output.

## Supported variants

| Variant | Purpose | Foreground/background relationship |
|---|---|---|
| `primary` | Confirm, submit, navigation to a key action | White on solid LAND VIEW red |
| `secondary` | Neutral action, cancel, refresh | Primary text on the control surface |
| `outline` | Emphasized but not dominant | Red ink on neutral background with red border |
| `soft` | Quiet brand link/action | Dark red on light tint; pale red on dark tint |
| `tab-active` | Selected tab/filter | Accessible red ink on a soft selected surface |
| `success` | Soft approval/status action | Green ink on green tint |
| `success-solid` | Green-filled action (e.g. WhatsApp) | White on safe dark green |
| `danger` | Destructive action (soft) | Red ink on pale red tint |
| `danger-solid` | High-emphasis destructive confirmation | White on safe dark red |
| `warning` | Acknowledgement/risk action | Amber ink on amber tint |

Examples:

```tsx
import { LVButton, LVButtonLink } from "@/components/lv-controls";

<LVButton variant="primary" type="submit" disabled={saving}>Save</LVButton>
<LVButton variant="danger" type="button" onClick={remove}>Remove</LVButton>
<LVButtonLink href="/admin/projects" variant="secondary">Projects</LVButtonLink>

// A component with existing layout/handlers can migrate without restructuring:
<button className="old-feature-submit" data-lv-button="primary" onClick={save}>Save</button>
<button
  className={selected ? "tab active" : "tab"}
  data-lv-button={selected ? "tab-active" : "secondary"}
  aria-pressed={selected}
>
  Project Stage
</button>
```

## Cascade policy

1. `landview-design-tokens.css` establishes semantic colors.
2. Existing palette/compatibility and route styles remain for legacy layouts
   while they are progressively retired.
3. `private-control-system.css` is the last private button rule. It resolves
   background, foreground, border, hover, selected, focus and disabled together.
4. A bare `.primary`, `.active` or `.danger` must not be used to infer a
   foreground. Prefer the variant attribute over another `!important` patch.
5. Do not put business calculations, AJAX handlers, or portal permission rules
   inside the control system.
6. Keep print styles in their own print CSS; this system is `@media screen`.

## Regressions

The blocking GitHub quality workflow executes
`node --test tests/private-control-system.test.cjs` alongside other mobile
regressions. The contract test covers variant completeness, stylesheet ordering,
migrated controls, and light/dark contrast for normal-sized text (>=4.5:1).

The numerical checks are a safeguard, **not a substitute** for authenticated
browser testing in both themes. Before closing a rollout, visually check selected
buttons and page-specific inline styles on mobile and desktop.

## Migration scope

The initial migration covers Management Site Visits, Due Bills, Billing 2.0,
Bill Manager, New Site Entry (both versions), Employee WhatsApp, the Admin
dashboard, Projects filters, and Accounts income/expense tabs.

The repository still contains historical layout and appearance CSS. **Do not
delete unrelated stylesheets in one step.** Migrate remaining legacy buttons
by feature, remove obsolete selectors when no longer referenced, and retain
the single central control contract. Avoid creating another
`button-contrast-final-vN.css` override file.
