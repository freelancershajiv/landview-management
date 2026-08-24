# LAND VIEW Mobile

Expo + React Native mobile client for **LAND VIEW Engineers & Architects**.

## Current first milestone

- LAND VIEW branded sign-in screen
- Connects to `https://app.landview.com.bd/api/landview`
- Uses the existing LAND VIEW login action
- Role-aware dashboard for Admin/Manager, Employee and Client
- Local user-state persistence
- Logout support

## Run locally

```bash
cd mobile
npm install
npx expo start
```

For Android, install **Expo Go** on the phone and scan the QR code shown by Expo.

You can also use:

```bash
npm run android
```

when an Android emulator is configured.

## Next development modules

1. Projects list and project details
2. Employee dashboard and assigned projects
3. Client project/billing view
4. Documents
5. Site visits
6. Billing and invoices
7. Profile/password change
8. Notifications

## Backend note

The app intentionally talks to the LAND VIEW Next.js proxy rather than embedding `LAND_VIEW_PROXY_SECRET` in the mobile source. The proxy secret must remain server-side.
