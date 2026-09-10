import { createHmac, timingSafeEqual } from "node:crypto";

export type BillingVerificationPayload = {
  version: 1;
  fileId: string;
  clientName: string;
  projectType: string;
  issuedAt: string;
  totals: {
    gross: number;
    discount: number;
    paid: number;
    due: number;
  };
  categories: Array<{
    name: string;
    gross: number;
    discount: number;
    paid: number;
    due: number;
  }>;
};

function secret() {
  const value = process.env.LAND_VIEW_VERIFICATION_SECRET || process.env.LAND_VIEW_PROXY_SECRET || "";
  if (!value) throw new Error("LAND_VIEW_VERIFICATION_SECRET is not configured.");
  return value;
}

function encode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

export function signBillingVerification(payload: BillingVerificationPayload) {
  const body = encode(JSON.stringify(payload));
  const signature = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyBillingVerification(token: string): BillingVerificationPayload | null {
  const [body, signature, extra] = String(token || "").split(".");
  if (!body || !signature || extra) return null;

  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(decode(body)) as BillingVerificationPayload;
    if (
      payload?.version !== 1 ||
      !/^LV-\d+$/i.test(String(payload.fileId || "")) ||
      !Array.isArray(payload.categories) ||
      !payload.totals ||
      !Number.isFinite(payload.totals.due)
    ) return null;
    return payload;
  } catch {
    return null;
  }
}
