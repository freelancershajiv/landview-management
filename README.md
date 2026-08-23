# LAND VIEW — Website + Management System

Next.js frontend for LAND VIEW Architects & Engineers.

## Routes

- `/` — public website
- `/login` — Admin / Employee / Client sign-in
- `/admin` — administration portal
- `/employee` — employee portal
- `/client` — client portal

## Authentication

The app uses LAND VIEW's own session login backed by Google Apps Script. Cloudflare Turnstile/CAPTCHA authentication has been removed from this build.

## Backend configuration

Create `.env.local` locally with:

```env
LAND_VIEW_API_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
```

The Apps Script deployment must be the `/exec` URL and must be accessible to the Vercel server.

For Vercel, create the same environment variable in **Project → Settings → Environment Variables**:

- Name: `LAND_VIEW_API_URL`
- Value: your deployed Apps Script `/exec` URL
- Environments: Production, Preview, Development

Do not commit `.env.local`.

## Local commands

```bash
npm install
npm run build
npm run dev
```

## Deployment

Push the project to GitHub, import the repository into Vercel, configure `LAND_VIEW_API_URL`, deploy, then add `landview.com.bd` under Vercel Domains.

## Security deployment

Before deploying this secured build, follow `SECURITY_SETUP.md`. It includes the required Apps Script migration and the `LAND_VIEW_PROXY_SECRET` Vercel configuration.
