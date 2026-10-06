import { getVercelOidcToken } from "@vercel/oidc";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROOT_FOLDER_ID = "1zry2Qd8Qr-lo8CnSBqf8cea7scbEjwtu";

function requiredEnv(name: string) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

async function getGoogleAccessToken() {
  const projectNumber = requiredEnv("GCP_PROJECT_NUMBER");
  const poolId = requiredEnv("GCP_WORKLOAD_IDENTITY_POOL_ID");
  const providerId = requiredEnv("GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID");
  const serviceAccountEmail = requiredEnv("GCP_SERVICE_ACCOUNT_EMAIL");
  const oidcToken = await getVercelOidcToken();
  if (!oidcToken) throw new Error("Vercel OIDC token is unavailable.");

  const stsResponse = await fetch("https://sts.googleapis.com/v1/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      audience: `//iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`,
      grantType: "urn:ietf:params:oauth:grant-type:token-exchange",
      requestedTokenType: "urn:ietf:params:oauth:token-type:access_token",
      scope: "https://www.googleapis.com/auth/cloud-platform",
      subjectTokenType: "urn:ietf:params:oauth:token-type:jwt",
      subjectToken: oidcToken,
    }),
  });
  const sts = await stsResponse.json().catch(() => null) as any;
  if (!stsResponse.ok || !sts?.access_token) {
    throw new Error(`GCP STS failed (${stsResponse.status}): ${sts?.error_description || sts?.error || "unknown error"}`);
  }

  const impersonationResponse = await fetch(
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(serviceAccountEmail)}:generateAccessToken`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sts.access_token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify({ scope: ["https://www.googleapis.com/auth/drive"] }),
    },
  );
  const impersonation = await impersonationResponse.json().catch(() => null) as any;
  if (!impersonationResponse.ok || !impersonation?.accessToken) {
    throw new Error(`Service-account impersonation failed (${impersonationResponse.status}): ${impersonation?.error?.message || "unknown error"}`);
  }
  return String(impersonation.accessToken);
}

export async function GET() {
  let createdId = "";
  try {
    const token = await getGoogleAccessToken();
    const headers = { Authorization: `Bearer ${token}` };

    const folderResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${ROOT_FOLDER_ID}?fields=id,name,mimeType,capabilities(canAddChildren)&supportsAllDrives=true`,
      { headers, cache: "no-store" },
    );
    const folder = await folderResponse.json().catch(() => null) as any;
    if (!folderResponse.ok) {
      throw new Error(`Drive folder lookup failed (${folderResponse.status}): ${folder?.error?.message || "unknown error"}`);
    }

    const createResponse = await fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id,name", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        name: `.landview-site-visit-write-check-${Date.now()}.txt`,
        mimeType: "text/plain",
        parents: [ROOT_FOLDER_ID],
      }),
    });
    const created = await createResponse.json().catch(() => null) as any;
    if (!createResponse.ok || !created?.id) {
      throw new Error(`Drive write test failed (${createResponse.status}): ${created?.error?.message || "unknown error"}`);
    }
    createdId = String(created.id);

    const deleteResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${createdId}?supportsAllDrives=true`, {
      method: "DELETE",
      headers,
      cache: "no-store",
    });
    if (!deleteResponse.ok) {
      throw new Error(`Drive cleanup failed (${deleteResponse.status}).`);
    }

    return NextResponse.json({
      success: true,
      folder: { id: folder.id, name: folder.name, canAddChildren: folder?.capabilities?.canAddChildren === true },
      writeTest: "created-and-deleted",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      success: false,
      stage: createdId ? "cleanup" : "access-or-write",
      error: error instanceof Error ? error.message : "Direct Drive check failed.",
    }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
