# LAND VIEW — Vercel to Cloudflare Workers migration

Status (2026-11-12): **PREPARATION ONLY — DO NOT SWITCH LIVE TRAFFIC.**

## Scope

Migrate the public site `landview.com.bd`, `www.landview.com.bd`, and the management portal `app.landview.com.bd` from the single Next.js 16 Vercel project `landview-management` to Cloudflare Workers using vinext. Keep GitHub, Supabase, existing Cloudflare R2 storage and the Render-hosted WhatsApp service.

Cloudflare account and DNS zone: `landview.com.bd` zone exists in **pending** status. Authoritative DNS remains at BTCL (`dns.btcl.net.bd`, `slave.btcl.net.bd`). A preliminary 5-record DNS set was staged in Cloudflare, *not* proven to be a full DNS export. **Do not change nameservers until all current BTCL DNS records have been inventoried.**

## Tested

- `npx vinext check`: **97% static compatibility**, 17 supported, 1 partial (turbopack), 0 flagged issues. This is not an end-to-end test.
- `vinext init --platform=cloudflare` generated Workers config in an isolated test.
- `npm run build:vinext` finished successfully in an isolated test.
- Functional runtime/login tests and Cloudflare staging deployment are **not yet verified**.

## Critical security blockers (must fix before production)

1. **Vercel OIDC is required for privileged backend operations.** `getVercelOidcToken()` is used across `lib/supabase-*.ts`, finance, todo, and other routes. Multiple Supabase Edge Functions strictly verify the Vercel OIDC issuer/JWKS and audience/project subject. Workers do not automatically produce Vercel's tokens. Implement and audit a new short-lived authenticated service-to-service identity mechanism with issuer, audience, expiry, key rotation and strict project/role separation; update both the application and Supabase verifiers, and test negative authorization cases. Never disable signature verification or authorize admin operations using public client secrets.
2. **Google Drive direct-upload WIF.** `lib/google-drive-wif.ts` exchanges Vercel OIDC via Google STS for a service-account token. Configure an equivalent supported federation/trust path or carefully scoped secure backend broker; avoid shipping a GCP service account private key to clients.
3. **Application secrets.** Recreate all relevant server-side values in Workers encrypted secrets (e.g. `LAND_VIEW_API_URL`, `LAND_VIEW_PROXY_SECRET`, WhatsApp service credentials, R2 access credentials, Resend credentials, retry/sync/cron tokens, and GCP federation settings). Verify each value's purpose; never commit actual values.
4. **Node compatibility.** Many API routes specify `runtime = "nodejs"`, and Next/Workers semantics differ. Audit any unsupported Node APIs, PDF/print rendering, file uploads, requests/limits, cookies and sessions.
5. **Vercel-specific analytics.** Replace `@vercel/analytics` and speed insights with Cloudflare-compatible analytics before removing the Vercel integration.
6. **Background jobs.** Inventory every Vercel cron or webhook sender/retry integration before migration. Vercel configuration currently lists no `crons`, which does not rule out external scheduled calls.

## Cloudflare staging instructions

Use a dedicated Git branch. Keep `next dev` / `next build` and existing Vercel deployment intact while introducing vinext. Use Cloudflare's maintained migration guide: https://developers.cloudflare.com/workers/static-assets/migration-guides/vercel-to-workers/nextjs/

Review and run:

```bash
npm ci
npx vinext check
npm run build:vinext
npm run start:vinext
npx cf auth login
npx @vinext/cloudflare deploy --dry-run
# Only after secrets, auth, runtime and endpoint tests pass:
npx @vinext/cloudflare deploy
```

Never attach production domains to a test Worker. Provide `NEXT_PUBLIC_*` values at **build time** and non-public credentials only as Worker secrets.

## Acceptance checklist

- [ ] Verify staged public homepage, project pages, sitemap/robots, 404s, metadata, favicon, static assets, SSL and security headers
- [ ] Verify app-host landing redirect and login, admin, manager, employee and client sessions; permissions including denied/expired sessions
- [ ] Verify read and write of projects, proposals, invoice generation, bill payment allocation, PDF download/printing, finance and registers
- [ ] Verify no duplicate bill/payment events; ensure no staging writes hit production unless explicitly permitted for a controlled test
- [ ] Verify Supabase service identities + negative authorization tests and GCP WIF upload path
- [ ] Verify R2 images and downloads, site-visit photo uploads, WhatsApp group/client notifications and Resend emails
- [ ] Verify all timed jobs and inbound webhooks target the correct host and authenticate correctly
- [ ] Inventory and export complete BTCL DNS zone: A/AAAA/CNAME/MX/TXT/CAA/SRV, email SPF/DKIM/DMARC, subdomains
- [ ] Dry-run a deployment and live smoke tests on temporary `workers.dev` address
- [ ] Arrange a rollback to the current Vercel host and its DNS records
- [ ] Only when everything passes: activate Cloudflare authoritative nameservers, bind Worker custom domains, monitor errors and functional requests, then remove Vercel hosting when no longer needed

Do not assume the static compatibility report proves runtime authorization or integration compatibility.
