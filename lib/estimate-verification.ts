import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type EstimateVerificationSnapshot = {
  version: 1;
  estimateId: string;
  issueDate: string;
  referenceId: string;
  ownerName: string;
  contactNo: string;
  projectTitle: string;
  location: string;
  projectType: string;
  floorStory: string;
  landArea: string;
  status: string;
  totalArea: number;
  ratePerSft: number;
  baseCost: number;
  allowanceTotal: number;
  contingency: number;
  grandTotal: number;
};

export type CompactEstimateVerification = {
  version: 2;
  estimateId: string;
  issueDate: string;
  referenceId: string;
  grandTotal: number;
  fingerprint: string;
};

export type EstimateVerificationRecord = EstimateVerificationSnapshot | CompactEstimateVerification;

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

function legacySignatureFor(body: string) {
  return createHmac("sha256", secret()).update(`estimate|${body}`).digest("base64url");
}

function compactSignatureFor(body: string) {
  return createHmac("sha256", secret()).update(`estimate-v2|${body}`).digest().subarray(0, 16).toString("base64url");
}

function text(value: unknown, max = 100) {
  return String(value ?? "").trim().slice(0, max);
}

function amount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function safeCompactText(value: string, max: number) {
  return text(value, max).toUpperCase().replace(/[^A-Z0-9._/-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function compactDate(value: string) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[1]}${match[2]}${match[3]}` : "00000000";
}

function expandDate(value: string) {
  return /^\d{8}$/.test(value) ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}` : "";
}

function snapshotFingerprint(snapshot: EstimateVerificationSnapshot) {
  const canonical = JSON.stringify(snapshot);
  return createHash("sha256").update(canonical).digest().subarray(0, 8).toString("base64url");
}

export function normalizeEstimateVerificationSnapshot(value: any): EstimateVerificationSnapshot {
  const estimateId = text(value?.estimateId, 50).toUpperCase() || "EST-NEW";
  if (!/^[A-Z0-9._/-]+$/.test(estimateId)) throw new Error("Invalid Estimate ID.");

  return {
    version: 1,
    estimateId,
    issueDate: text(value?.issueDate, 20),
    referenceId: text(value?.referenceId, 50).toUpperCase(),
    ownerName: text(value?.ownerName, 100),
    contactNo: text(value?.contactNo, 40),
    projectTitle: text(value?.projectTitle, 120),
    location: text(value?.location, 140),
    projectType: text(value?.projectType, 80),
    floorStory: text(value?.floorStory, 50),
    landArea: text(value?.landArea, 50),
    status: text(value?.status, 40) || "Draft",
    totalArea: amount(value?.totalArea),
    ratePerSft: amount(value?.ratePerSft),
    baseCost: amount(value?.baseCost),
    allowanceTotal: amount(value?.allowanceTotal),
    contingency: amount(value?.contingency),
    grandTotal: amount(value?.grandTotal),
  };
}

export function signEstimateVerification(snapshot: EstimateVerificationSnapshot) {
  const normalized = normalizeEstimateVerificationSnapshot(snapshot);
  const estimateId = safeCompactText(normalized.estimateId, 50) || "EST-NEW";
  const referenceId = safeCompactText(normalized.referenceId, 50);
  const grandCents = Math.round(normalized.grandTotal * 100);
  const fingerprint = snapshotFingerprint(normalized);

  // V2 intentionally mirrors the Billing QR approach: only a short signed
  // reference is encoded in the QR. The fingerprint binds it to the full
  // issued estimate without embedding all client/project fields in the QR.
  const body = encode(`${estimateId}|${compactDate(normalized.issueDate)}|${referenceId}|${grandCents}|${fingerprint}`);
  return `2.${body}.${compactSignatureFor(body)}`;
}

function verifyCompact(token: string): CompactEstimateVerification | null {
  const [version, body, signature, extra] = String(token || "").split(".");
  if (version !== "2" || !body || !signature || extra || body.length > 500) return null;

  const expected = compactSignatureFor(body);
  const supplied = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (supplied.length !== expectedBuffer.length || !timingSafeEqual(supplied, expectedBuffer)) return null;

  try {
    const [estimateId, date, referenceId, grandCentsText, fingerprint, extraField] = decode(body).split("|");
    if (!estimateId || extraField !== undefined || !/^\d{8}$/.test(date || "") || !/^[A-Za-z0-9_-]{8,16}$/.test(fingerprint || "")) return null;
    const grandCents = Number(grandCentsText);
    if (!Number.isSafeInteger(grandCents) || grandCents < 0) return null;
    return {
      version: 2,
      estimateId,
      issueDate: expandDate(date),
      referenceId: referenceId || "",
      grandTotal: grandCents / 100,
      fingerprint,
    };
  } catch {
    return null;
  }
}

function verifyLegacy(token: string): EstimateVerificationSnapshot | null {
  const [body, signature, extra] = String(token || "").split(".");
  if (!body || !signature || extra || body.length > 6000) return null;

  const expected = legacySignatureFor(body);
  const supplied = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (supplied.length !== expectedBuffer.length || !timingSafeEqual(supplied, expectedBuffer)) return null;

  try {
    const value = JSON.parse(decode(body)) as any;
    if (Number(value?.v) !== 1) return null;
    return normalizeEstimateVerificationSnapshot({
      estimateId: value.i,
      issueDate: value.d,
      referenceId: value.r,
      ownerName: value.o,
      contactNo: value.p,
      projectTitle: value.n,
      location: value.l,
      projectType: value.t,
      floorStory: value.f,
      landArea: value.a,
      status: value.s,
      totalArea: value.ta,
      ratePerSft: value.rt,
      baseCost: value.b,
      allowanceTotal: value.al,
      contingency: value.c,
      grandTotal: value.g,
    });
  } catch {
    return null;
  }
}

export function verifyEstimateVerification(token: string): EstimateVerificationRecord | null {
  return String(token || "").startsWith("2.") ? verifyCompact(token) : verifyLegacy(token);
}
