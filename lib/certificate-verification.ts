import { createHmac, timingSafeEqual } from "node:crypto";

export type CertificateType = "project" | "employee" | "building";

export type CertificatePayload = {
  v: 1;
  id: string;
  t: CertificateType;
  n: string;
  a: string;
  p: string;
  s: string;
  r: string;
  d: string;
  i: string;
  x?: string;
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

function clean(value: unknown, max = 240) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

export function signCertificate(input: Omit<CertificatePayload, "v">) {
  const payload: CertificatePayload = {
    v: 1,
    id: clean(input.id, 48).toUpperCase(),
    t: input.t,
    n: clean(input.n, 120),
    a: clean(input.a, 220),
    p: clean(input.p, 120),
    s: clean(input.s, 140),
    r: clean(input.r, 80),
    d: clean(input.d, 900),
    i: clean(input.i, 40),
    ...(input.x ? { x: clean(input.x, 40) } : {}),
  };

  if (!/^LVC-[A-Z]{3}-\d{8}-[A-Z0-9]{6}$/.test(payload.id)) throw new Error("Invalid certificate ID.");
  if (!["project", "employee", "building"].includes(payload.t)) throw new Error("Invalid certificate type.");
  if (!payload.n) throw new Error("Certificate name is required.");
  if (!payload.i) throw new Error("Issue date is required.");

  const body = encode(JSON.stringify(payload));
  const signature = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyCertificate(token: string): CertificatePayload | null {
  const [body, signature, extra] = String(token || "").split(".");
  if (!body || !signature || extra) return null;

  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(decode(body)) as CertificatePayload;
    if (payload?.v !== 1) return null;
    if (!/^LVC-[A-Z]{3}-\d{8}-[A-Z0-9]{6}$/.test(String(payload.id || ""))) return null;
    if (!["project", "employee", "building"].includes(String(payload.t || ""))) return null;
    if (!String(payload.n || "").trim() || !String(payload.i || "").trim()) return null;
    return payload;
  } catch {
    return null;
  }
}
