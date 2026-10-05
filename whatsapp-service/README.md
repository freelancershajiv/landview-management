# LAND VIEW WhatsApp Bot

Self-hosted Baileys sender for LAND VIEW Site Visit announcements.

## How it works

1. The LAND VIEW Next.js app saves the Site Visit normally.
2. The formatted WhatsApp announcement is queued in Supabase.
3. This service connects to WhatsApp as a linked device and drains the queue into the configured normal WhatsApp group.
4. Baileys authentication keys are persisted in Supabase, so Render restarts do not normally require a new QR scan.

## Required environment variables

- `BOT_API_TOKEN` — shared server-side token. It must match `WHATSAPP_BOT_API_TOKEN` in the Vercel project.
- `BOT_STORE_URL` — defaults to the LAND VIEW Supabase bot-store Edge Function.
- `WHATSAPP_SESSION_ID` — defaults to `land-view-site-visits`.
- `WHATSAPP_GROUP_INVITE_CODE` — the normal WhatsApp group invite code or link.

## Pairing

After deployment, open:

`https://YOUR-RENDER-SERVICE.onrender.com/pair?key=YOUR_BOT_API_TOKEN`

Then scan the displayed QR from WhatsApp → Linked devices → Link a device.

The pairing page is protected by the same server-side bot token. Do not share the pairing URL.

## Reset pairing

Send an authenticated POST request to `/admin/reset`. This deletes only this bot's stored Baileys session and starts a fresh QR pairing flow.

## Notes

Baileys is an unofficial WhatsApp Web library. This integration is intended only for LAND VIEW's own operational group and should not be used for bulk or unsolicited messaging.
