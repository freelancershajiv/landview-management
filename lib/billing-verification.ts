import { createHmac, timingSafeEqual } from "node:crypto";

export type ProjectVerificationPayload = {
  version: 4;
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

function signatureFor(body: string) {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}

export function signProjectVerification(fileId: string) {
  const normalized = String(fileId || "").trim().toUpperCase();
  if (!/^LV-\d+$/.test(normalized)) throw new Error("Invalid File ID.");

  // Deterministic project-only payload: every invoice for one project receives
  // exactly the same QR. Billing figures are intentionally NOT embedded here.
  const body = encode(JSON.stringify({ v: 4, f: normalized }));
  return `${body}.${signatureFor(body)}`;
}

export function verifyProjectVerification(token: string): ProjectVerificationPayload | null {
  const [body, signature, extra] = String(token || "").split(".");
  if (!body || !signature || extra) return null;

  const expected = signatureFor(body);
  const suppliedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (suppliedBuffer.length !== expectedBuffer.length || !timingSafeEqual(suppliedBuffer, expectedBuffer)) return null;

  try {
    const payload = JSON.parse(decode(body)) as any;

    // Current permanent project QR.
    if (Number(payload?.v) === 4) {
      const fileId = String(payload?.f || "").trim().toUpperCase();
      if (!/^LV-\d+$/.test(fileId)) return null;
      return { version: 4, fileId };
    }

    // Backward compatibility: previously printed snapshot QRs (v3) and the
    // earlier project-only QRs (v1/v2) now resolve to the SAME live project page.
    // Snapshot amounts are deliberately ignored so an old invoice QR still shows
    // the project's current billing when scanned today.
    if (Number(payload?.v) === 3) {
      const fileId = String(payload?.f || "").trim().toUpperCase();
      if (!/^LV-\d+$/.test(fileId)) return null;
      return { version: 4, fileId };
    }

    const fileId = String(payload?.fileId || "").trim().toUpperCase();
    if (![1, 2].includes(Number(payload?.version)) || !/^LV-\d+$/.test(fileId)) return null;
    return { version: 4, fileId };
  } catch {
    return null;
  }
}
