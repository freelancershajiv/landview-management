# LAND VIEW Mobile

Native companion app for LAND VIEW Architects & Engineers.

## Current v1 modules

- Staff login with the existing LAND VIEW User ID/password
- Client login with File ID + registered mobile number
- Role-aware dashboard for Admin, Manager, Employee and Client
- Projects and current project stage
- Site Visit history
- Employee/Admin expense history
- Team directory for Admin/Manager
- Management `Check Location` requests
- Employee GPS response using the same registered project locations as the web system
- Automatic access-token refresh
- Encrypted device session storage with `expo-secure-store`

The app uses the existing production API at `https://app.landview.com.bd/api/mobile`; it does not create a second LAND VIEW database.

## Local development

Requires Node.js 22.13+ for Expo SDK 57.

```bash
cd mobile
npm install
npx expo install --fix
npx expo-doctor
npx expo start
```

Use Expo Go for initial testing. For a closer-to-production test, use an EAS development or preview build.

## Android preview APK

After signing in to Expo/EAS on the development machine:

```bash
cd mobile
npx eas build --platform android --profile preview
```

The preview profile is configured for an installable APK.

## Production build

```bash
npx eas build --platform android --profile production
npx eas build --platform ios --profile production
```

Store credentials, signing keys, Expo account ownership and App Store / Play Console submission are intentionally not committed to GitHub.

## Privacy model for location checks

A management location check is a one-time request. The employee explicitly initiates the GPS reading from the app. The backend compares that reading with registered LAND VIEW project coordinates. The location-check audit record stores the matched project, distance, GPS accuracy, status and timestamps; it does not store unrelated raw latitude/longitude in the location-check table.
