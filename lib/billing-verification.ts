import { createHmac, timingSafeEqual } from "node:crypto";

export type VerificationCategory = {
  name: string;
  gross: number;
  discount: number;
  paid: number;
  due: number;
};

export type VerificationSnapshot = {
  clientName: string;
  issueDate: string;
  categories: VerificationCategory[];
  totals: { gross: number; discount: number; paid: number; due: number };
};

export type ProjectVerificationPayload = {
  version: 2 | 3;
  fileId: string;
  snapshot?: VerificationSnapshot;
};

type CompactPayload = {
  v: 3;
  f: string;
  n: string;
  i: string;
  c: Array<[string, number, number, number, number]>;
  t: [number, number, number, number];
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

function cleanNumber(value: unknown) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function cleanText(value: unknown, max: number) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

function cleanSnapshot(input: VerificationSnapshot): VerificationSnapshot {
  const categories = Array.isArray(input?.categories) ? input.categories.slice(0, 6).map((category) => ({
    name: cleanText(category?.name, 24) || "Billing",
    gross: cleanNumber(category?.gross),
    discount: cleanNumber(category?.discount),
    paid: cleanNumber(category?.paid),
    due: cleanNumber(category?.due),
  })) : [];

  return {
    clientName: cleanText(input?.clientName, 80),
    issueDate: cleanText(input?.issueDate, 30),
    categories,
    totals: {
      gross: cleanNumber(input?.totals?.gross),
      discount: cleanNumber(input?.totals?.discount),
      paid: cleanNumber(input?.totals?.paid),
      due: cleanNumber(input?.totals?.due),
    },
  };
}

export function signProjectVerification(fileId: string, snapshot?: VerificationSnapshot) {
  const normalized = String(fileId || "").trim().toUpperCase();
  if (!/^LV-\d+$/.test(normalized)) throw new Error("Invalid File ID.");

  let payload: { version: 2; fileId: string } | CompactPayload;
  if (snapshot) {
    const safe = cleanSnapshot(snapshot);
    payload = {
      v: 3,
      f: normalized,
      n: safe.clientName,
      i: safe.issueDate,
      c: safe.categories.map((category) => [category.name, category.gross, category.discount, category.paid, category.due]),
      t: [safe.totals.gross, safe.totals.discount, safe.totals.paid, safe.totals.due],
    };
  } else {
    payload = { version: 2, fileId: normalized };
  }

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
    const payload = JSON.parse(decode(body)) as any;

    if (Number(payload?.v) === 3) {
      const fileId = String(payload?.f || "").trim().toUpperCase();
      if (!/^LV-\d+$/.test(fileId) || !Array.isArray(payload?.c) || !Array.isArray(payload?.t)) return null;
      const snapshot = cleanSnapshot({
        clientName: payload?.n,
        issueDate: payload?.i,
        categories: payload.c.map((row: any[]) => ({
          name: row?.[0], gross: row?.[1], discount: row?.[2], paid: row?.[3], due: row?.[4],
        })),
        totals: { gross: payload.t[0], discount: payload.t[1], paid: payload.t[2], due: payload.t[3] },
      });
      return { version: 3, fileId, snapshot };
    }

    const fileId = String(payload?.fileId || "").trim().toUpperCase();
    if (![1, 2].includes(Number(payload?.version)) || !/^LV-\d+$/.test(fileId)) return null;
    return { version: 2, fileId };
  } catch {
    return null;
  }
}
