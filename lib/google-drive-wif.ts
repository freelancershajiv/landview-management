import { getVercelOidcToken } from "@vercel/oidc";

type Row = Record<string, any>;
type TokenCache = { token: string; expiresAt: number } | null;
let tokenCache: TokenCache = null;

function clean(value: unknown, max = 300) {
  return String(value ?? "").replace(/[\u0000-\u001f<>:"/\\|?*]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function env(name: string) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Google Drive direct upload is missing ${name}.`);
  return value;
}

function googleProviderPath() {
  return `projects/${env("GCP_PROJECT_NUMBER")}/locations/global/workloadIdentityPools/${env("GCP_WORKLOAD_IDENTITY_POOL_ID")}/providers/${env("GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID")}`;
}

function googleOidcAudience() {
  return `https://iam.googleapis.com/${googleProviderPath()}`;
}

function googleStsAudience() {
  return `//iam.googleapis.com/${googleProviderPath()}`;
}

async function googleAccessToken() {
  if (tokenCache && tokenCache.expiresAt - Date.now() > 60_000) return tokenCache.token;

  const oidcAudience = googleOidcAudience();
  const subjectToken = await getVercelOidcToken({ audience: oidcAudience });
  if (!subjectToken) throw new Error("Vercel OIDC token is unavailable for Google Drive.");

  const exchange = new URLSearchParams({
    audience: googleStsAudience(),
    grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
    requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
    scope: "https://www.googleapis.com/auth/cloud-platform",
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    subject_token: subjectToken,
  });
  const stsResponse = await fetch("https://sts.googleapis.com/v1/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: exchange,
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  const sts = await stsResponse.json().catch(() => null) as any;
  if (!stsResponse.ok || !sts?.access_token) {
    throw new Error(`Google identity exchange failed (${stsResponse.status}): ${String(sts?.error_description || sts?.error || "unknown error").slice(0, 500)}`);
  }

  const serviceAccount = env("GCP_SERVICE_ACCOUNT_EMAIL");
  const impersonationResponse = await fetch(
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(serviceAccount)}:generateAccessToken`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${sts.access_token}`, "content-type": "application/json" },
      body: JSON.stringify({ scope: ["https://www.googleapis.com/auth/drive"], lifetime: "1800s" }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    },
  );
  const impersonated = await impersonationResponse.json().catch(() => null) as any;
  if (!impersonationResponse.ok || !impersonated?.accessToken) {
    throw new Error(`Google service-account impersonation failed (${impersonationResponse.status}): ${String(impersonated?.error?.message || "unknown error").slice(0, 500)}`);
  }

  const expireTime = new Date(String(impersonated.expireTime || "")).getTime();
  tokenCache = {
    token: String(impersonated.accessToken),
    expiresAt: Number.isFinite(expireTime) ? expireTime : Date.now() + 25 * 60_000,
  };
  return tokenCache.token;
}

async function driveRequest(path: string, init: RequestInit = {}, timeoutMs = 10_000) {
  const token = await googleAccessToken();
  const headers = new Headers(init.headers || {});
  headers.set("authorization", `Bearer ${token}`);
  const response = await fetch(`https://www.googleapis.com${path}`, {
    ...init,
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const responseText = await response.text();
  let json: any = null;
  try { json = responseText ? JSON.parse(responseText) : null; } catch { json = null; }
  if (!response.ok) {
    throw new Error(`Google Drive API ${response.status}: ${String(json?.error?.message || responseText || "request failed").slice(0, 700)}`);
  }
  return json as Row;
}

function q(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function findChild(parentId: string, name: string, mimeType?: string) {
  const params = new URLSearchParams({
    q: `'${q(parentId)}' in parents and name = '${q(name)}' and trashed = false${mimeType ? ` and mimeType = '${q(mimeType)}'` : ""}`,
    fields: "files(id,name,mimeType,webViewLink,createdTime)",
    pageSize: "10",
    spaces: "drive",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  const result = await driveRequest(`/drive/v3/files?${params.toString()}`);
  return Array.isArray(result?.files) && result.files.length ? result.files[0] as Row : null;
}

async function ensureFolder(parentId: string, name: string) {
  const folderName = clean(name, 180) || "Site Visit";
  const existing = await findChild(parentId, folderName, "application/vnd.google-apps.folder");
  if (existing?.id) return String(existing.id);

  const created = await driveRequest("/drive/v3/files?fields=id,name,webViewLink&supportsAllDrives=true", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: folderName, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
  });
  if (!created?.id) throw new Error("Google Drive did not return a folder ID.");
  return String(created.id);
}

function multipartBody(metadata: Row, mimeType: string, bytes: Uint8Array) {
  const boundary = `landview_${crypto.randomUUID().replace(/-/g, "")}`;
  const head = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    "utf8",
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  return { boundary, body: Buffer.concat([head, Buffer.from(bytes), tail]) };
}

export async function uploadSiteVisitPhotoToDrive(input: {
  projectCode: string;
  projectName: string;
  visitCode: string;
  kind: "visit" | "problem";
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  latitude?: number | null;
  longitude?: number | null;
  accuracyM?: number | null;
}) {
  const rootId = env("SITE_VISIT_MEDIA_DRIVE_FOLDER_ID");
  const projectCode = clean(input.projectCode, 60) || "LAND-VIEW";
  const projectName = clean(input.projectName, 140) || projectCode;
  const visitCode = clean(input.visitCode, 100) || "Site Visit";
  const fileName = clean(input.fileName, 180) || `${input.kind}-photo.jpg`;

  const projectFolderId = await ensureFolder(rootId, `${projectCode} - ${projectName}`);
  const visitFolderId = await ensureFolder(projectFolderId, visitCode);

  // A Site Visit has at most one canonical photo of each kind. Reusing a matching file makes worker retries idempotent.
  const existing = await findChild(visitFolderId, fileName);
  if (existing?.id) {
    return {
      fileId: String(existing.id),
      fileUrl: String(existing.webViewLink || `https://drive.google.com/file/d/${existing.id}/view`),
      projectFolderId,
      visitFolderId,
      reused: true,
    };
  }

  const appProperties: Record<string, string> = {
    landviewProject: projectCode,
    landviewVisit: visitCode,
    landviewMediaKind: input.kind,
  };
  if (Number.isFinite(input.latitude)) appProperties.latitude = String(input.latitude);
  if (Number.isFinite(input.longitude)) appProperties.longitude = String(input.longitude);
  if (Number.isFinite(input.accuracyM)) appProperties.accuracyM = String(input.accuracyM);

  const { boundary, body } = multipartBody({ name: fileName, parents: [visitFolderId], appProperties }, input.mimeType, input.bytes);
  const uploaded = await driveRequest(
    "/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink,parents&supportsAllDrives=true",
    {
      method: "POST",
      headers: { "content-type": `multipart/related; boundary=${boundary}` },
      body,
    },
    18_000,
  );
  if (!uploaded?.id) throw new Error("Google Drive upload completed without a file ID.");

  return {
    fileId: String(uploaded.id),
    fileUrl: String(uploaded.webViewLink || `https://drive.google.com/file/d/${uploaded.id}/view`),
    projectFolderId,
    visitFolderId,
    reused: false,
  };
}
