import { createHash, createHmac, randomUUID } from "node:crypto";

const R2_FILE_ID_PREFIX = "r2:";
const R2_REGION = "auto";
const R2_SERVICE = "s3";

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

type SiteVisitMediaKind = "visit" | "arrival" | "problem";

type UploadSiteVisitMediaInput = {
  projectCode: string;
  visitCode: string;
  kind: SiteVisitMediaKind;
  mimeType: string;
  base64?: string;
  bytes?: Uint8Array | Buffer;
  uniqueId?: string | number;
};

function env(name: string) {
  return String(process.env[name] || "").trim();
}

function getConfig(): R2Config {
  const config = {
    accountId: env("R2_ACCOUNT_ID"),
    accessKeyId: env("R2_ACCESS_KEY_ID"),
    secretAccessKey: env("R2_SECRET_ACCESS_KEY"),
    bucket: env("R2_BUCKET"),
  };
  const missing = Object.entries(config).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) {
    throw new Error(`Cloudflare R2 is not configured (${missing.join(", ")}).`);
  }
  if (!/^[a-f0-9]{32}$/i.test(config.accountId)) {
    throw new Error("R2_ACCOUNT_ID format is invalid. Use only the 32-character Cloudflare Account ID, not an endpoint URL.");
  }
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(config.bucket)) {
    throw new Error("R2_BUCKET format is invalid. Use only the Cloudflare R2 bucket name.");
  }
  return config;
}

export function isR2Configured() {
  return Boolean(env("R2_ACCOUNT_ID") && env("R2_ACCESS_KEY_ID") && env("R2_SECRET_ACCESS_KEY") && env("R2_BUCKET"));
}

export function isR2FileId(value: unknown) {
  return String(value || "").startsWith(R2_FILE_ID_PREFIX);
}

function safeSegment(value: unknown, fallback: string) {
  const cleaned = String(value || "")
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 120);
  return cleaned || fallback;
}

function extensionForMime(mimeType: string) {
  const mime = String(mimeType || "").toLowerCase();
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

function contentTypeForMime(mimeType: string) {
  const mime = String(mimeType || "").toLowerCase();
  if (["image/jpeg", "image/png", "image/webp"].includes(mime)) return mime;
  return "application/octet-stream";
}

function encodePath(value: string) {
  return value.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

function sha256Hex(value: string | Uint8Array | Buffer) {
  const hash = createHash("sha256");
  if (typeof value === "string") hash.update(value, "utf8");
  else hash.update(Buffer.from(value));
  return hash.digest("hex");
}

function hmac(key: string | Buffer, value: string) {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function awsTimestamp(now = new Date()) {
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

function r2NetworkError(error: unknown) {
  const err = error as any;
  const cause = err?.cause as any;
  const code = String(cause?.code || cause?.errno || "").trim();
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return new Error("Cloudflare R2 endpoint could not be resolved. Check that R2_ACCOUNT_ID is the 32-character Cloudflare Account ID.");
  }
  if (code.includes("TIMEOUT") || /timed? ?out/i.test(String(cause?.message || err?.message || ""))) {
    return new Error("Cloudflare R2 network request timed out.");
  }
  if (/certificate|tls|ssl/i.test(String(cause?.message || ""))) {
    return new Error("Cloudflare R2 TLS connection failed.");
  }
  return new Error(`Cloudflare R2 network request failed${code ? ` (${code})` : ""}.`);
}

async function signedR2Request(params: {
  method: "GET" | "PUT" | "DELETE";
  key: string;
  body?: Uint8Array | Buffer;
  contentType?: string;
}) {
  const config = getConfig();
  const host = `${config.accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${encodeURIComponent(config.bucket)}/${encodePath(params.key)}`;
  const url = `https://${host}${canonicalUri}`;
  const payload = params.body ? Buffer.from(params.body) : Buffer.alloc(0);
  const payloadHash = sha256Hex(payload);
  const { amzDate, dateStamp } = awsTimestamp();

  const canonicalHeaderMap: Record<string, string> = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (params.contentType) canonicalHeaderMap["content-type"] = params.contentType;

  const headerNames = Object.keys(canonicalHeaderMap).sort();
  const canonicalHeaders = headerNames
    .map((name) => `${name}:${canonicalHeaderMap[name].trim().replace(/\s+/g, " ")}`)
    .join("\n");
  const signedHeaders = headerNames.join(";");
  const canonicalRequest = [
    params.method,
    canonicalUri,
    "",
    canonicalHeaders,
    "",
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${R2_REGION}/${R2_SERVICE}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const dateKey = hmac(`AWS4${config.secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, R2_REGION);
  const serviceKey = hmac(regionKey, R2_SERVICE);
  const signingKey = hmac(serviceKey, "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");
  const authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const headers: Record<string, string> = {
    Authorization: authorization,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (params.contentType) headers["Content-Type"] = params.contentType;

  let response: Response;
  try {
    response = await fetch(url, {
      method: params.method,
      headers,
      body: params.method === "PUT" ? (payload as unknown as BodyInit) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw r2NetworkError(error);
  }

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).replace(/\s+/g, " ").trim().slice(0, 500);
    throw new Error(`Cloudflare R2 ${params.method} failed (${response.status})${detail ? `: ${detail}` : "."}`);
  }
  return response;
}

function buildSiteVisitObjectKey(input: UploadSiteVisitMediaInput) {
  const project = safeSegment(input.projectCode, "project");
  const visit = safeSegment(input.visitCode, "visit");
  const kind = input.kind === "problem" ? "problem" : "visit";
  const unique = safeSegment(input.uniqueId || randomUUID(), randomUUID());
  const extension = extensionForMime(input.mimeType);
  return `site-visits/${project}/${visit}/${kind}-${unique}.${extension}`;
}

export async function uploadSiteVisitMediaToR2(input: UploadSiteVisitMediaInput) {
  const bytes = input.bytes
    ? Buffer.from(input.bytes)
    : Buffer.from(String(input.base64 || ""), "base64");
  if (!bytes.length) throw new Error("Cloudflare R2 upload received an empty file.");

  const key = buildSiteVisitObjectKey(input);
  const contentType = contentTypeForMime(input.mimeType);
  await signedR2Request({ method: "PUT", key, body: bytes, contentType });

  return {
    fileId: `${R2_FILE_ID_PREFIX}${key}`,
    fileUrl: "",
    key,
    contentType,
    size: bytes.length,
  };
}

export async function readSiteVisitMediaFromR2(fileId: string) {
  if (!isR2FileId(fileId)) throw new Error("This is not a Cloudflare R2 media reference.");
  const key = fileId.slice(R2_FILE_ID_PREFIX.length);
  if (!key) throw new Error("Cloudflare R2 media key is missing.");

  const response = await signedR2Request({ method: "GET", key });
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error("Cloudflare R2 returned an empty media object.");

  return {
    bytes,
    contentType: response.headers.get("content-type") || "image/jpeg",
    fileName: key.split("/").pop() || "site-visit.jpg",
    key,
  };
}
