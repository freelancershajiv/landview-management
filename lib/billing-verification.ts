import { createHmac, timingSafeEqual } from "node:crypto";

export type ProjectVerificationPayload = {
  version: 2;
  fileId: string;
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

export function signProjectVerification(fileId: string) {
  const normalized = String(fileId || "").trim().toUpperCase();
  if (!/^LV-\d+$/.test(normalized)) throw new Error("Invalid File ID.");
  const payload: ProjectVerificationPayload = { version: 2, fileId: normalized };
  const body = encode(JSON.stringify(payload));
  const signature = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyProjectVerification(token: string): ProjectVerificationPayload | null {
  const [body, signature, extra] = String(token || "").split(".");
  if (!body || !signature || extra) return null;

  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(decode(body)) as ProjectVerificationPayload;
    if (payload?.version !== 2 || !/^LV-\d+$/i.test(String(payload.fileId || ""))) return null;
    return { version: 2, fileId: String(payload.fileId).toUpperCase() };
  } catch {
    return null;
  }
}
