import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { hasCapability } from "@/lib/permissions";
import { recordAuditEvent } from "@/lib/audit-log";
import { insertRows, normalizeProjectCode, selectRows, supabaseGateway, updateRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BYTES = 10 * 1024 * 1024;
const TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
function value(raw: unknown, max = 160) { return String(raw ?? "").trim().slice(0, max); }
function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } });
}
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") === "same-origin" || process.env.NODE_ENV !== "production";
  try { return new URL(origin).origin === request.nextUrl.origin; } catch { return false; }
}
function writesEnabled() {
  return process.env.VERCEL_ENV === "production" &&
    process.env.LANDVIEW_V4_DOCUMENT_WRITES_ENABLED === "true" &&
    process.env.LANDVIEW_V4_DOCUMENT_BACKUP_VERIFIED === "true";
}
async function authorized(request: NextRequest, write: boolean) {
  const user = await requireLocalSession(request) as Row | null;
  if (!user) return null;
  const role = roleOf(user);
  return ["admin", "manager"].includes(role) &&
    hasCapability(role, write ? "documents.manage" : "documents.view") ? user : null;
}
async function lookupProject(code: unknown) {
  const projectCode = normalizeProjectCode(code);
  if (!projectCode) return null;
  const rows = await selectRows("projects", { filters: { project_code: projectCode }, limit: 1 });
  return rows[0] as Row | undefined || null;
}
async function lookupReceipt(projectId: string, id: unknown) {
  if (!UUID.test(value(id, 80))) return null;
  const rows = await selectRows("client_document_register", {
    filters: { project_id: projectId, id: value(id, 80) }, limit: 1,
  });
  return rows[0] as Row | undefined || null;
}
async function lookupFile(projectId: string, receiptId: string, fileId: unknown) {
  if (!UUID.test(value(fileId, 80))) return null;
  const rows = await selectRows("project_client_document_files", {
    filters: { id: value(fileId, 80), project_id: projectId, register_id: receiptId }, limit: 1,
  });
  return rows[0] as Row | undefined || null;
}
function present(row: Row) {
  return {
    id: value(row.id, 80),
    name: value(row.file_name, 160),
    type: value(row.content_type, 80),
    bytes: Number(row.file_size || 0),
    status: value(row.status, 30),
    createdAt: value(row.created_at, 40),
    storedAt: value(row.stored_at, 40),
  };
}
function actor(user: Row) {
  return value(user.employeeId || user.Employee_ID || user.userId || user.User_ID ||
    user.username || user.Username || user.name || user.Name, 120) || "LAND VIEW";
}

export async function GET(request: NextRequest) {
  try {
    const user = await authorized(request, false);
    if (!user) return json({ success: false, error: "Management document permission required." }, 403);
    const project = await lookupProject(request.nextUrl.searchParams.get("projectId"));
    if (!project) return json({ success: false, error: "Project not found." }, 404);
    const projectId = value(project.id, 80);
    const receipt = await lookupReceipt(projectId, request.nextUrl.searchParams.get("registerId"));
    if (!receipt) return json({ success: false, error: "Receiving record does not belong to this project." }, 404);
    const fileId = request.nextUrl.searchParams.get("downloadFileId");
    if (fileId) {
      const file = await lookupFile(projectId, value(receipt.id, 80), fileId);
      if (!file || file.status !== "stored") return json({ success: false, error: "Stored file not found." }, 404);
      const signed = await supabaseGateway("signClientDocumentDownload", { path: file.storage_path }) as { url: string };
      return json({ success: true, data: { url: signed.url, expiresIn: 60 } });
    }
    try {
      const files = await selectRows("project_client_document_files", {
        filters: { project_id: projectId, register_id: value(receipt.id, 80) },
        order: "created_at:desc", limit: 200,
      });
      return json({ success: true, data: {
        available: true, uploadEnabled: writesEnabled(),
        files: files.filter((file) => file.status === "stored").map(present),
      } });
    } catch {
      return json({ success: true, data: { available: false, uploadEnabled: false, files: [],
        reason: "Private document storage is not deployed. Existing records are unchanged." } });
    }
  } catch (error) {
    console.error("Client document file read failed:", error);
    return json({ success: false, error: "Could not read private project document files." }, 500);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ success: false, error: "Invalid request origin." }, 403);
  try {
    const user = await authorized(request, true);
    if (!user) return json({ success: false, error: "Document management permission required." }, 403);
    if (!writesEnabled()) return json({ success: false,
      error: "Uploads are locked until the production backup and release checks are verified." }, 423);
    const input = await request.json() as Row;
    const project = await lookupProject(input.projectId);
    if (!project) return json({ success: false, error: "Project not found." }, 404);
    const projectId = value(project.id, 80);
    const receipt = await lookupReceipt(projectId, input.registerId);
    if (!receipt) return json({ success: false, error: "Receiving record is not in this project." }, 404);
    const registerId = value(receipt.id, 80);

    if (input.action === "prepare") {
      const type = value(input.contentType, 80).toLowerCase();
      const extension = TYPES[type];
      const size = Number(input.fileSize);
      const filename = value(input.fileName, 160);
      if (!extension || !Number.isSafeInteger(size) || size <= 0 || size > MAX_BYTES ||
          !filename || filename.length > 160 || /[\\/\x00-\x1f]/.test(filename) ||
          !/\.(pdf|jpe?g|png|webp)$/i.test(filename)) {
        return json({ success: false, error: "Only PDF, JPG, PNG and WebP files up to 10 MB are accepted." }, 400);
      }
      const expected = filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
      if (expected !== extension && !(extension === "jpg" && expected === "jpeg"))
        return json({ success: false, error: "File extension and type do not match." }, 400);
      const path = `projects/${projectId}/receipts/${registerId}/${crypto.randomUUID()}.${extension}`;
      const rows = await insertRows("project_client_document_files", {
        project_id: projectId, register_id: registerId, storage_path: path,
        file_name: filename, file_size: size, content_type: type,
        created_by: actor(user), status: "pending",
      });
      if (!rows.length) throw new Error("Could not create a pending upload.");
      // Never send the service-role key to the browser. A generated path is immutable.
      const signed = await supabaseGateway("signClientDocumentUpload", { path }) as { url: string };
      return json({ success: true, data: { fileId: value(rows[0].id, 80), uploadUrl: signed.url } });
    }

    if (input.action === "complete") {
      const file = await lookupFile(projectId, registerId, input.fileId);
      if (!file) return json({ success: false, error: "Upload record not found." }, 404);
      if (file.status === "stored") return json({ success: true, duplicate: true, data: present(file) });
      if (file.status !== "pending") return json({ success: false, error: "Upload is not pending." }, 409);
      await supabaseGateway("clientDocumentObjectInfo", { path: file.storage_path });
      const updated = await updateRows("project_client_document_files",
        { id: file.id, project_id: projectId, register_id: registerId, status: "pending" },
        { status: "stored", stored_at: new Date().toISOString() });
      if (!updated.length) return json({ success: false, error: "Upload changed concurrently. Refresh and retry." }, 409);
      await recordAuditEvent({ user, request, action: "v4_client_document_file_stored",
        entityType: "project_client_document_files", entityId: value(file.id, 80),
        details: { projectCode: value(project.project_code, 80), registerId, type: value(file.content_type, 80) },
        source: "project-v4-private-document-upload" });
      return json({ success: true, data: present(updated[0]) });
    }
    return json({ success: false, error: "Unsupported upload action." }, 400);
  } catch (error) {
    console.error("Client document file write failed:", error);
    return json({ success: false, error: "Private document upload could not be completed." }, 500);
  }
}
