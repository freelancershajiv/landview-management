import { getVercelOidcToken } from "@vercel/oidc";

type CachedToken = {
  accessToken: string;
  expiresAt: number;
};

export type GoogleSheetValueRange = {
  range?: string;
  majorDimension?: string;
  values?: string[][];
};

export type GoogleSheetBatchValues = {
  spreadsheetId?: string;
  valueRanges?: GoogleSheetValueRange[];
};

let cachedToken: CachedToken | null = null;
let tokenPromise: Promise<string> | null = null;

const STS_URL = "https://sts.googleapis.com/v1/token";
const SHEETS_READ_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";

function requiredEnv(name: string) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

export function googleWifConfig() {
  return {
    projectNumber: requiredEnv("GCP_PROJECT_NUMBER"),
    serviceAccountEmail: requiredEnv("GCP_SERVICE_ACCOUNT_EMAIL"),
    poolId: requiredEnv("GCP_WORKLOAD_IDENTITY_POOL_ID"),
    providerId: requiredEnv("GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID"),
  };
}

async function googleError(response: Response, fallback: string) {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text);
    const message = parsed?.error?.message || parsed?.error_description || parsed?.error || parsed?.message;
    if (message) return String(message);
  } catch {
    // Keep the fallback below. Never surface raw token responses or HTML bodies.
  }
  return fallback;
}

async function mintGoogleSheetsAccessToken() {
  const startedAt = Date.now();
  const oidcToken = String(await getVercelOidcToken()).trim();
  if (!oidcToken) {
    throw new Error("Vercel OIDC token is unavailable.");
  }

  const { projectNumber, serviceAccountEmail, poolId, providerId } = googleWifConfig();
  const audience = `//iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`;

  const stsResponse = await fetch(STS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      audience,
      grantType: "urn:ietf:params:oauth:grant-type:token-exchange",
      requestedTokenType: "urn:ietf:params:oauth:token-type:access_token",
      scope: "https://www.googleapis.com/auth/cloud-platform",
      subjectTokenType: "urn:ietf:params:oauth:token-type:jwt",
      subjectToken: oidcToken,
    }),
    cache: "no-store",
  });

  if (!stsResponse.ok) {
    throw new Error(await googleError(stsResponse, `Google STS exchange failed (${stsResponse.status}).`));
  }

  const sts = (await stsResponse.json()) as { access_token?: string };
  if (!sts.access_token) throw new Error("Google STS did not return an access token.");

  const impersonationResponse = await fetch(
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(serviceAccountEmail)}:generateAccessToken`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sts.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        scope: [SHEETS_READ_SCOPE],
        lifetime: "900s",
      }),
      cache: "no-store",
    },
  );

  if (!impersonationResponse.ok) {
    throw new Error(
      await googleError(
        impersonationResponse,
        `Service-account impersonation failed (${impersonationResponse.status}).`,
      ),
    );
  }

  const impersonated = (await impersonationResponse.json()) as {
    accessToken?: string;
    expireTime?: string;
  };
  if (!impersonated.accessToken) throw new Error("Google IAM Credentials did not return an access token.");

  const parsedExpiry = impersonated.expireTime ? Date.parse(impersonated.expireTime) : NaN;
  cachedToken = {
    accessToken: impersonated.accessToken,
    expiresAt: Number.isFinite(parsedExpiry) ? parsedExpiry : startedAt + 10 * 60_000,
  };

  return cachedToken.accessToken;
}

export async function getGoogleSheetsAccessToken() {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - now > 60_000) {
    return cachedToken.accessToken;
  }

  if (!tokenPromise) {
    tokenPromise = mintGoogleSheetsAccessToken().finally(() => {
      tokenPromise = null;
    });
  }

  return tokenPromise;
}

export async function fetchGoogleSheetMetadata(spreadsheetId: string) {
  const accessToken = await getGoogleSheetsAccessToken();
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=spreadsheetId,properties.title,sheets.properties.title`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(await googleError(response, `Google Sheets API read failed (${response.status}).`));
  }

  return response.json() as Promise<{
    spreadsheetId?: string;
    properties?: { title?: string };
    sheets?: Array<{ properties?: { title?: string } }>;
  }>;
}

export async function fetchGoogleSheetBatchValues(
  spreadsheetId: string,
  ranges: string[],
): Promise<GoogleSheetBatchValues> {
  if (!spreadsheetId.trim()) throw new Error("Google spreadsheet ID is required.");
  if (!ranges.length) return { spreadsheetId, valueRanges: [] };

  const accessToken = await getGoogleSheetsAccessToken();
  const params = new URLSearchParams();
  for (const range of ranges) params.append("ranges", range);
  params.set("majorDimension", "ROWS");
  params.set("valueRenderOption", "FORMATTED_VALUE");
  params.set("dateTimeRenderOption", "FORMATTED_STRING");

  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchGet?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(await googleError(response, `Google Sheets batch read failed (${response.status}).`));
  }

  return response.json() as Promise<GoogleSheetBatchValues>;
}
