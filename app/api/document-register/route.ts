import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { recordAuditEvent } from "@/lib/audit-log";
import { insertRows, selectRows, updateRows } from "@/lib/supabase-data";
import {
  DOCUMENT_WORKFLOW_STATUSES,
  documentRegisterSnapshot,
  initializeDocumentChecklist,
  syncWorkflowFromDocuments,
} from "@/lib/service-document-register";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;
function text(value: unknown, max = 1000) { return String(value ?? "").trim().slice(0, max); }
function num(value: unknown) { const n = Number(String(value ?? 0).replace(/,/g, "").replace(/[^0-9.-]/g, "")); return Number.isFinite(n) ? n : 0; }
function bool(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  const raw = text(value, 20).toLowerCase();
  if (!raw) return fallback;
  return ["true", "1", "yes", "y", "required"].includes(raw);
}
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}
function json(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store, max-age=0" } }); }
function actor(user: Row) { return text(user.employeeId || user.Employee_ID || user.userId || user.User_ID || user.username || user.Username || user.name || user.Name, 160) || "LAND VIEW"; }
async function session(request: NextRequest, edit = false) {
  const user = await requireLocalSession(request) as Row | null;
  if (!user) throw new Error("Session expired.");
  const role = roleOf(user);
  const allowed = edit ? ["admin", "manager"] : ["admin", "manager", "accounts", "employee"];
  if (!allowed.includes(role)) throw new Error(edit ? "Management permission is required." : "Document Register access is not available for this role.");
  return user;
}
function cleanDate(value: unknown) {
  const raw = text(value, 20);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}
function cleanUrl(value: unknown) {
  const raw = text(value, 2000);
  if (!raw) return null;
  try { const url = new URL(raw); return ["http:", "https:"].includes(url.protocol) ? raw : null; } catch { return null; }
}
function statusTimestamps(status: string) {
  const now = new Date().toISOString();
  const index = DOCUMENT_WORKFLOW_STATUSES.indexOf(status as never);
  return {
    ...(index >= DOCUMENT_WORKFLOW_STATUSES.indexOf("Approved") ? { approved_at: now } : {}),
    ...(index >= DOCUMENT_WORKFLOW_STATUSES.indexOf("Ready to Print") ? { ready_to_print_at: now } : {}),
    ...(index >= DOCUMENT_WORKFLOW_STATUSES.indexOf("Printed") ? { printed_at: now } : {}),
    ...(index >= DOCUMENT_WORKFLOW_STATUSES.indexOf("Delivered") ? { delivered_at: now } : {}),
  };
}

export async function GET(request: NextRequest) {
  try {
    await session(request, false);
    const workflowId = text(request.nextUrl.searchParams.get("workflowId"), 100);
    if (!workflowId) throw new Error("Service workflow is required.");
    return json({ success: true, data: await documentRegisterSnapshot(workflowId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load Document Register.";
    return json({ success: false, error: message }, /session/i.test(message) ? 401 : /permission|access|role/i.test(message) ? 403 : 400);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ success: false, error: "Invalid request origin." }, 403);
  let user: Row | null = null;
  try {
    user = await session(request, true);
    const input = await request.json() as Row;
    const action = text(input.action, 80).toLowerCase();
    const workflowId = text(input.workflowId, 100);
    const who = actor(user);
    if (!workflowId) throw new Error("Service workflow is required.");

    if (action === "initializechecklist") {
      const result = await initializeDocumentChecklist(workflowId, who);
      await recordAuditEvent({ user, request, action: "workflow_document_checklist_initialize", entityType: "project_service_workflow", entityId: workflowId, after: { inserted: result.inserted }, source: "document-register" });
      return json({ success: true, data: result.snapshot, inserted: result.inserted });
    }

    if (action === "createdocument") {
      const snapshot = await documentRegisterSnapshot(workflowId);
      const documentName = text(input.documentName, 300);
      const revisionNo = text(input.revisionNo, 80) || "R0";
      if (!documentName) throw new Error("Document / drawing name is required.");
      const status = text(input.status, 80) || "Working";
      if (!DOCUMENT_WORKFLOW_STATUSES.includes(status as never)) throw new Error("Choose a valid document status.");

      const sameName = snapshot.documents.filter((row: Row) => text(row.document_name, 300).toLowerCase() === documentName.toLowerCase());
      const duplicate = sameName.some((row: Row) => text(row.revision_no, 80).toLowerCase() === revisionNo.toLowerCase());
      if (duplicate) throw new Error(`${documentName} ${revisionNo} already exists. Use a new revision number.`);
      for (const prior of sameName.filter((row: Row) => row.is_required !== false)) {
        await updateRows("documents", { id: prior.id }, { is_required: false, updated_by_text: who, updated_at: new Date().toISOString() });
      }

      const now = new Date().toISOString();
      const revisionDate = cleanDate(input.revisionDate);
      const rows = await insertRows("documents", {
        document_code: `WDR-${crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`,
        project_id: snapshot.workflow.projectUuid,
        title: documentName,
        document_type: "Workflow Deliverable",
        drive_file_id: null,
        drive_file_url: cleanUrl(input.fileUrl),
        storage_path: null,
        document_date: revisionDate,
        client_visible: false,
        service_workflow_id: workflowId,
        service_key: snapshot.workflow.serviceKey,
        service_name: snapshot.workflow.serviceName,
        drawing_no: text(input.drawingNo, 120) || null,
        revision_no: revisionNo,
        revision_date: revisionDate,
        paper_size: text(input.paperSize, 80) || null,
        workflow_status: status,
        is_required: bool(input.isRequired, true),
        print_quantity: Math.max(0, Math.trunc(num(input.printQuantity))),
        delivered_quantity: Math.max(0, Math.trunc(num(input.deliveredQuantity))),
        delivered_to: text(input.deliveredTo, 300) || null,
        delivered_by: text(input.deliveredBy, 300) || null,
        remarks: text(input.remarks, 2000) || null,
        ...statusTimestamps(status),
        created_by_text: who,
        updated_by_text: who,
        created_at: now,
        updated_at: now,
      });
      await syncWorkflowFromDocuments(workflowId, who);
      await recordAuditEvent({ user, request, action: "workflow_document_create", entityType: "document", entityId: text(rows[0]?.id || rows[0]?.document_code), after: { workflowId, documentName, revisionNo, status }, source: "document-register" });
      return json({ success: true, data: await documentRegisterSnapshot(workflowId) });
    }

    if (action === "updatedocument") {
      const id = text(input.id, 100);
      if (!id) throw new Error("Document record is required.");
      const existing = await selectRows("documents", { filters: { id, service_workflow_id: workflowId }, limit: 1 });
      if (!existing.length || existing[0].archived_at) throw new Error("Document record was not found.");
      const before = existing[0];
      const status = text(input.status, 80) || text(before.workflow_status, 80) || "Working";
      if (!DOCUMENT_WORKFLOW_STATUSES.includes(status as never)) throw new Error("Choose a valid document status.");
      const documentName = text(input.documentName, 300) || text(before.title, 300);
      if (!documentName) throw new Error("Document / drawing name is required.");
      const revisionDate = cleanDate(input.revisionDate);
      const changes = {
        title: documentName,
        drawing_no: text(input.drawingNo, 120) || null,
        revision_no: text(input.revisionNo, 80) || "R0",
        revision_date: revisionDate,
        document_date: revisionDate,
        paper_size: text(input.paperSize, 80) || null,
        workflow_status: status,
        is_required: bool(input.isRequired, before.is_required !== false),
        print_quantity: Math.max(0, Math.trunc(num(input.printQuantity))),
        delivered_quantity: Math.max(0, Math.trunc(num(input.deliveredQuantity))),
        delivered_to: text(input.deliveredTo, 300) || null,
        delivered_by: text(input.deliveredBy, 300) || null,
        drive_file_url: cleanUrl(input.fileUrl),
        remarks: text(input.remarks, 2000) || null,
        ...(status !== before.workflow_status ? statusTimestamps(status) : {}),
        updated_by_text: who,
        updated_at: new Date().toISOString(),
      };
      await updateRows("documents", { id }, changes);
      await syncWorkflowFromDocuments(workflowId, who);
      await recordAuditEvent({ user, request, action: "workflow_document_update", entityType: "document", entityId: id, before: { status: before.workflow_status, revisionNo: before.revision_no }, after: { status, revisionNo: changes.revision_no }, source: "document-register" });
      return json({ success: true, data: await documentRegisterSnapshot(workflowId) });
    }

    if (action === "archivedocument") {
      const id = text(input.id, 100);
      if (!id) throw new Error("Document record is required.");
      const rows = await selectRows("documents", { filters: { id, service_workflow_id: workflowId }, limit: 1 });
      if (!rows.length) throw new Error("Document record was not found.");
      await updateRows("documents", { id }, { archived_at: new Date().toISOString(), is_required: false, updated_by_text: who, updated_at: new Date().toISOString() });
      await syncWorkflowFromDocuments(workflowId, who);
      await recordAuditEvent({ user, request, action: "workflow_document_archive", entityType: "document", entityId: id, before: { status: rows[0].workflow_status }, source: "document-register" });
      return json({ success: true, data: await documentRegisterSnapshot(workflowId) });
    }

    throw new Error("Unsupported Document Register action.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Document Register update failed.";
    return json({ success: false, error: message }, /session/i.test(message) ? 401 : /permission|access|role/i.test(message) ? 403 : /required|valid|exists|found|revision/i.test(message) ? 400 : 500);
  }
}
