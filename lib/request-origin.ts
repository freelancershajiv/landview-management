import type { NextRequest } from "next/server";

function normalizeHost(value: string | null | undefined) {
  return String(value || "")
    .split(":")[0]
    .trim()
    .toLowerCase();
}

export function trustedAppHosts() {
  return new Set(
    [
      "app.landview.com.bd",
      "localhost",
      "127.0.0.1",
      process.env.VERCEL_URL,
      process.env.VERCEL_BRANCH_URL,
      process.env.VERCEL_PROJECT_PRODUCTION_URL,
    ]
      .map(normalizeHost)
      .filter(Boolean),
  );
}

export function isTrustedAppHost(value: string | null | undefined) {
  return trustedAppHosts().has(normalizeHost(value));
}

export function isAllowedRequestOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) {
    return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  }

  try {
    return isTrustedAppHost(new URL(origin).hostname);
  } catch {
    return false;
  }
}
