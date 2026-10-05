import { createHmac, timingSafeEqual } from "node:crypto";

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
  return createHmac("sha256", secret()).update(`estimate|${body}`).digest("base64url");
}

function text(value: unknown, max = 100) {
  return String(value ?? "").trim().slice(0, max);
}

function amount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
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
  // Compact field names keep the QR easy to scan while the signed payload remains
  // a complete immutable verification snapshot of the issued estimate.
  const compact = {
    v: 1,
    i: normalized.estimateId,
    d: normalized.issueDate,
    r: normalized.referenceId,
    o: normalized.ownerName,
    p: normalized.contactNo,
    n: normalized.projectTitle,
    l: normalized.location,
    t: normalized.projectType,
    f: normalized.floorStory,
    a: normalized.landArea,
    s: normalized.status,
    ta: normalized.totalArea,
    rt: normalized.ratePerSft,
    b: normalized.baseCost,
    al: normalized.allowanceTotal,
    c: normalized.contingency,
    g: normalized.grandTotal,
  };
  const body = encode(JSON.stringify(compact));
  return `${body}.${signatureFor(body)}`;
}

export function verifyEstimateVerification(token: string): EstimateVerificationSnapshot | null {
  const [body, signature, extra] = String(token || "").split(".");
  if (!body || !signature || extra || body.length > 6000) return null;

  const expected = signatureFor(body);
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
