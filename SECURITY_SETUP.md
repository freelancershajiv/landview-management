# LAND VIEW Security Upgrade

This build moves authentication away from browser-readable tokens and adds a private gateway between Vercel and Google Apps Script.

## What changed

- Session token is stored in a host-only, HttpOnly, Secure, SameSite=Strict cookie on `app.landview.com.bd`.
- Browser JavaScript no longer stores the authentication token in `localStorage`.
- `/api/landview` injects the session token server-side.
- Google Apps Script now requires a private `LAND_VIEW_PROXY_SECRET` on every request, so the Apps Script `/exec` endpoint cannot be used directly without the Vercel gateway secret.
- Passwords are migrated from plaintext to salted, peppered, iterated SHA-256 hashes suitable for this Apps Script deployment model.
- Existing plaintext accounts are automatically migrated after a successful login, and can all be migrated at once by the one-time setup function below.
- Login throttling locks an identifier temporarily after repeated failures.
- Sessions expire after 8 hours, with a 45-minute idle timeout.
- Password changes and resets revoke existing sessions.
- Security headers and a Content Security Policy are enabled.
- Admin, employee, client, login, and API paths are marked not to be indexed.
- A security audit sheet records authentication events.
- The public office location links to Google Maps.

## REQUIRED deployment steps

### 1. Replace Apps Script Code.gs

Copy the included `Code.gs` into the LAND VIEW Apps Script project.

Save it, then run this function manually from the Apps Script editor once:

```text
initializeSecurityUpgrade
```

Authorize the script if Google asks. The function returns an object containing:

```text
proxySecret: "..."
```

Copy that value. Do not put it in GitHub or Google Sheets.

The same one-time function also adds these `Users` columns if needed:

- Password_Hash
- Password_Salt
- Password_Updated_At

and creates the `Audit Log` sheet.

### 2. Redeploy the Apps Script web app

After saving the new Code.gs, update/redeploy the web app and keep using the deployed `/exec` URL.

### 3. Add Vercel environment variables

In Vercel -> LAND VIEW -> Settings -> Environment Variables, configure:

```text
LAND_VIEW_API_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
LAND_VIEW_PROXY_SECRET=THE_VALUE_RETURNED_BY_initializeSecurityUpgrade
```

Keep both variables server-side only. Do not prefix them with `NEXT_PUBLIC_`.

For best isolation, add these secrets to Production only unless you intentionally want preview deployments to use the live company database.

### 4. Push this frontend to GitHub

Run:

```text
git add .
git commit -m "Secure LAND VIEW authentication"
git push
```

Vercel will redeploy automatically.

### 5. Test in this order

1. Open `https://www.landview.com.bd` and confirm the public site loads.
2. Confirm the Feni location link opens Google Maps.
3. Open `https://app.landview.com.bd` and confirm it redirects to `/login`.
4. Sign in as Admin.
5. Open browser DevTools -> Application -> Local Storage and verify there is no LAND VIEW session token.
6. In DevTools -> Cookies, `lv_session` should appear as HttpOnly and Secure.
7. Sign out and confirm `/admin` requires login again.
8. Test one Employee and one Client account and verify they can only see assigned/linked projects.
9. Change a password and confirm the portal requires sign-in again.
10. Confirm an `Audit Log` sheet was created in the LAND VIEW spreadsheet.

## Important

Do not delete the Apps Script Script Properties named `AUTH_PEPPER` or `PROXY_SHARED_SECRET`. The password hashes depend on the pepper and the Vercel gateway depends on the proxy secret.

Do not publish `.env.local` or actual secret values to GitHub.
