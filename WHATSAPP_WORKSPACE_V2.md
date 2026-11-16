# LAND VIEW WhatsApp Workspace V2

## Goal
One scan-friendly interface that separates everyday client messaging from pairing and advanced delivery configuration. Preserve the current WhatsApp provider, account sessions, permissions, message routes, and data.

## User journey
1. Inbox & connection (/admin/whatsapp) opens to the client inbox with a compact summary of connection health, unread conversations, failed deliveries and queued messages.
2. Search client conversations by name, phone or project code. Filter all, unread and human replies. The chosen conversation remains selected through list polling.
3. The message panel shows reply history and the existing human-handoff action. Replies use the existing backend and number.
4. Phone & pairing is a secondary view with QR instructions and guarded troubleshooting. Managers retain their individual employee connection.
5. Delivery & rules (/admin/whatsapp/operations) begins with delivery health and grouped navigation: daily work (overview, history, failures) then settings (rules, templates, recipient groups).
6. Message log and failures can be searched and filtered by queue. Status cards deep-link into the relevant delivery tab.

## Safeguards
- Unknown summary values render as a dash, never fabricated zeros.
- Connection errors are distinct from logged-out and QR states.
- Message responses are checked against the active conversation so late responses from a prior client do not replace the selected chat.
- Connection and conversation polling are 15-second intervals; summary polling is 60 seconds. The slow WhatsApp service's in-flight guard remains.
- Reset remains confirmation-gated behind advanced troubleshooting.
- CSS is scoped to WhatsApp routes and consumes central light/dark semantic variables. No print styling.
- No new schema, payment allocation, message action, provider credential, or backend write route was changed.

## Release checks
- Automated V2 behavior and structure regression tests
- GitHub quality gate, TypeScript and production build
- One Vercel preview; authenticated manual desktop/mobile and QR/reply/failed-retry smoke checks still recommended before production
