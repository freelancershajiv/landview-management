import { createHash, createHmac, randomUUID } from "node:crypto";

const PREFIX = "r2:";
const REGION = "auto";
const SERVICE = "s3";

type Config = { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string };

function env(name: string) { return String(process.env[name] || "").trim(); }
function normalizeAccountId(value: string) {
  const raw = String(value || "").trim();
  if (/^[a-f0-9]{32}$/i.test(raw)) return raw;
  return raw.match(/(?:https?:\/\/)?([a-f0-9]{32})\.r2\.cloudflarestorage\.com(?:[/:]|$)/i)?.[1] || raw;
}
function config(): Config {
  const next = { accountId: normalizeAccountId(env("R2_ACCOUNT_ID")), accessKeyId: env("R2_ACCESS_KEY_ID"), secretAccessKey: env("R2_SECRET_ACCESS_KEY"), bucket: env("R2_BUCKET") };
  if (!next.accountId || !next.accessKeyId || !next.secretAccessKey || !next.bucket) throw new Error("Cloudflare R2 is not configured.");
  return next;
}
function safeSegment(value: unknown, fallback: string) {
  const cleaned = String(value || "").normalize("NFKC").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 120);
  return cleaned || fallback;
}
function safeFileName(value: unknown) {
  const raw = String(value || "attachment").normalize("NFKC").replace(/[\\/\x00-\x1f\x7f]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 180);
  return raw || "attachment";
}
function encodePath(value: string) { return value.split("/").map((part) => encodeURIComponent(part)).join("/"); }
function sha256(value: string | Uint8Array | Buffer) { const h = createHash("sha256"); h.update(typeof value === "string" ? value : Buffer.from(value)); return h.digest("hex"); }
function hmac(key: string | Buffer, value: string) { return createHmac("sha256", key).update(value, "utf8").digest(); }
function timestamp(now = new Date()) { const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ""); return { amzDate, dateStamp: amzDate.slice(0, 8) }; }

async function request(method: "GET" | "PUT" | "DELETE", key: string, body?: Buffer, contentType?: string) {
  const c = config();
  const host = `${c.accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${encodeURIComponent(c.bucket)}/${encodePath(key)}`;
  const url = `https://${host}${canonicalUri}`;
  const payload = body || Buffer.alloc(0);
  const payloadHash = sha256(payload);
  const { amzDate, dateStamp } = timestamp();
  const headerMap: Record<string, string> = { host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate };
  if (contentType) headerMap["content-type"] = contentType;
  const names = Object.keys(headerMap).sort();
  const canonicalHeaders = names.map((name) => `${name}:${headerMap[name].trim().replace(/\s+/g, " ")}`).join("\n");
  const signedHeaders = names.join(";");
  const canonicalRequest = [method, canonicalUri, "", canonicalHeaders, "", signedHeaders, payloadHash].join("\n");
  const scope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonicalRequest)].join("\n");
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${c.secretAccessKey}`, dateStamp), REGION), SERVICE), "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");
  const headers: Record<string, string> = {
    Authorization: `AWS4-HMAC-SHA256 Credential=${c.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (contentType) headers["Content-Type"] = contentType;
  const response = await fetch(url, { method, headers, body: method === "PUT" ? (payload as unknown as BodyInit) : undefined, cache: "no-store", signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).replace(/\s+/g, " ").trim().slice(0, 400);
    throw new Error(`Cloudflare R2 ${method} failed (${response.status})${detail ? `: ${detail}` : "."}`);
  }
  return response;
}

function keyFromFileId(fileId: string) {
  if (!String(fileId || "").startsWith(`${PREFIX}todo-attachments/`)) throw new Error("Invalid To Do attachment storage reference.");
  return fileId.slice(PREFIX.length);
}

export async function uploadTodoAttachment(input: { todoCode: string; fileName: string; contentType: string; bytes: Buffer }) {
  if (!input.bytes.length) throw new Error("Attachment is empty.");
  const todo = safeSegment(input.todoCode, "todo");
  const fileName = safeFileName(input.fileName);
  const key = `todo-attachments/${todo}/${safeSegment(randomUUID(), "file")}-${safeSegment(fileName, "attachment")}`;
  const contentType = String(input.contentType || "application/octet-stream").trim().slice(0, 180) || "application/octet-stream";
  await request("PUT", key, input.bytes, contentType);
  return { fileId: `${PREFIX}${key}`, fileName, contentType, size: input.bytes.length };
}

export async function readTodoAttachment(fileId: string) {
  const key = keyFromFileId(fileId);
  const response = await request("GET", key);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error("Attachment file is empty.");
  return { bytes, contentType: response.headers.get("content-type") || "application/octet-stream", key };
}

export async function deleteTodoAttachment(fileId: string) {
  const key = keyFromFileId(fileId);
  await request("DELETE", key);
  return true;
}
