import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { hasCapability } from "@/lib/permissions";
import { recordAuditEvent } from "@/lib/audit-log";
import { insertRows, normalizeProjectCode, selectRows, updateRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;
const ALLOWED = {
  photo: "Photo",
  identity: "NID / Passport / Birth Certificate",
  ownership: "Ownership Registry Paper",
  khotian: "Khotian",
  tax: "Land Tax Slip",
} as const;
type Key = keyof typeof ALLOWED;
const FORMS = new Set(["Original", "Copy", "Digital"]);
const IDENTITY_TYPES = new Set(["NID", "Passport", "Birth Certificate"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value: unknown, max = 300) { return String(value ?? "").trim().slice(0, max); }
function response(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } });
}
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) {
    return request.headers.get("sec-fetch-site") === "same-origin" ||
      process.env.NODE_ENV !== "production";
  }
  try { return new URL(origin).origin === request.nextUrl.origin; }
  catch { return false; }
}
function validDate(input: unknown) {
  const value = text(input, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function currentDhakaDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
async function session(request: NextRequest, write = false) {
  const user = await requireLocalSession(request) as Row | null;
  if (!user) return null;
  const role = roleOf(user);
  if (!["admin", "manager"].includes(role) || !hasCapability(role, write ? "documents.manage" : "documents.view")) return null;
  return user;
}
async function projectByCode(value: unknown) {
  const code = normalizeProjectCode(value);
  if (!code) return null;
  const projects = await selectRows("projects", { filters: { project_code: code }, limit: 1 });
  return (projects[0] as Row | undefined) || null;
}
function actor(user: Row) {
  return text(user.employeeId || user.Employee_ID || user.userId || user.User_ID || user.username || user.Username || user.name || user.Name, 150) || "LAND VIEW";
}
async function migrationReady(projectId: string) {
  try {
    // Probe the actual columns, including on projects with zero document rows.
    await selectRows("client_document_register", {
      select: "id,requirement_key,verification_status,owner_name,received_from,storage_location,verified_at,returned_by,idempotency_key",
      filters: { project_id: projectId }, limit: 1,
    });
    // Do not allow writes without the transactional event history and gateway.
    await selectRows("project_client_document_events", {
      select: "id,register_id,project_id,event_type", filters: { project_id: projectId }, limit: 1,
    });
    return true;
  } catch { return false; }
}
function writesEnabled() {
  // Both independent flags default OFF. Preview uses production business records
  // until a separate staging database is configured; never allow preview writes.
  return process.env.VERCEL_ENV === "production" &&
    process.env.LANDVIEW_V4_DOCUMENT_WRITES_ENABLED === "true" &&
    process.env.LANDVIEW_V4_DOCUMENT_BACKUP_VERIFIED === "true";
}
function describe(row: Row) {
  return {
    id: text(row.id, 80),
    code: text(row.register_code, 80),
    projectId: text(row.project_id, 80),
    requirementKey: text(row.requirement_key, 40),
    name: text(row.document_name),
    identityType: text(row.document_type, 60),
    owner: text(row.owner_name, 150),
    receivedFrom: text(row.received_from, 150),
    receivedBy: text(row.received_by, 150),
    receivedDate: text(row.received_date, 20),
    form: text(row.document_form, 30),
    quantity: Number(row.quantity || 0),
    location: text(row.storage_location, 150),
    reference: text(row.document_reference, 120),
    collectionStatus: text(row.collection_status, 60),
    verificationStatus: text(row.verification_status, 60) || "Unverified",
    verificationNotes: text(row.verification_notes, 400),
    verifiedAt: text(row.verified_at, 50),
    returnStatus: text(row.return_status, 60),
    returnedTo: text(row.returned_to, 150),
    returnedDate: text(row.returned_date, 20),
    returnedBy: text(row.returned_by, 150),
    remarks: text(row.remarks, 500),
  };
}
async function readEvents(projectId: string, ready: boolean) {
  if (!ready) return { events: [] as Row[], available: false };
  try {
    const events = await selectRows("project_client_document_events", {
      filters: { project_id: projectId }, order: "created_at:desc", limit: 500,
      select: "id,register_id,event_type,actor,details,created_at",
    });
    return { events: events.map((row) => ({
      id: text(row.id, 80), registerId: text(row.register_id, 80),
      action: text(row.event_type, 50), actor: text(row.actor, 120),
      date: text(row.created_at, 50),
      // Never return any scan bytes, identity numbers or private files.
    })), available: true };
  } catch { return { events: [] as Row[], available: false }; }
}
export async function GET(request: NextRequest) {
  try {
    const user = await session(request);
    if (!user) return response({ success: false, error: "Document Registry permission required." }, 403);
    const project = await projectByCode(request.nextUrl.searchParams.get("projectId"));
    if (!project) return response({ success: false, error: "Project not found." }, 404);
    const projectId = text(project.id, 80);
    const [records, ready] = await Promise.all([
      selectRows("client_document_register", { filters: { project_id: projectId }, order: "created_at:desc", limit: 1500 }),
      migrationReady(projectId),
    ]);
    const history = await readEvents(projectId, ready);
    return response({ success: true, data: {
      projectCode: text(project.project_code, 80),
      records: records.map(describe),
      events: history.events,
      historyAvailable: history.available,
      migrationReady: ready,
      writeEnabled: ready && writesEnabled(),
      writeBlockReason: !ready
        ? "Document verification schema has not been applied."
        : !writesEnabled() ? "Document changes are disabled until production backup and release checks are completed." : "",
    } });
  } catch (error) {
    console.error("Project document register read failed", error);
    return response({ success: false, error: "Could not load the project document registry." }, 500);
  }
}
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return response({ success: false, error: "Invalid request origin." }, 403);
  try {
    const user = await session(request, true);
    if (!user) return response({ success: false, error: "Document management permission required." }, 403);
    if (!writesEnabled()) return response({
      success: false, error: "Document changes are not enabled. Production backup and release checks are required.",
    }, 423);

    const input = await request.json() as Row;
    const project = await projectByCode(input.projectId);
    if (!project) return response({ success: false, error: "Project not found." }, 404);
    const projectId = text(project.id, 80);
    if (!await migrationReady(projectId)) {
      return response({ success: false, error: "Document verification schema is not installed." }, 503);
    }

    const action = text(input.action, 30).toLowerCase();
    const by = actor(user);
    const today = currentDhakaDate();
    let item: Row;
    if (action === "receive") {
      const key = text(input.requirementKey, 30) as Key;
      const name = ALLOWED[key];
      if (!name) return response({ success: false, error: "Select a valid document requirement." }, 400);
      const form = text(input.form, 30);
      const quantity = Number(input.quantity);
      const receivedFrom = text(input.receivedFrom, 150);
      const owner = text(input.ownerName, 150);
      const date = text(input.receivedDate || today, 10);
      const identityType = text(input.identityType, 60);
      const idempotency = text(input.requestKey, 50);
      if (!FORMS.has(form) || !Number.isInteger(quantity) || quantity < 1 || quantity > 100 ||
          !receivedFrom || !validDate(date) || !UUID.test(idempotency) ||
          (key === "identity" && !IDENTITY_TYPES.has(identityType))) {
        return response({ success: false, error: "Check document type, quantity, received-from, date and request key." }, 400);
      }
      const prior = await selectRows("client_document_register", {
        filters: { project_id: projectId, idempotency_key: idempotency }, limit: 1,
      });
      if (prior.length) return response({ success: true, data: describe(prior[0]), duplicate: true });
      const payload = {
        project_id: projectId, requirement_key: key, document_name: name,
        document_type: key === "identity" ? identityType : name,
        owner_name: owner || null, received_from: receivedFrom,
        document_form: form, quantity, received_date: date,
        received_by: by, created_by_text: by,
        collection_status: "Received",
        return_status: form === "Digital" ? "Not Applicable" : "Held by LAND VIEW",
        storage_location: text(input.storageLocation, 160) || null,
        document_reference: text(input.documentReference, 120) || null,
        remarks: text(input.remarks, 500) || null,
        idempotency_key: idempotency,
      };
      try {
        const rows = await insertRows("client_document_register", payload);
        if (!rows.length) throw new Error("Document receipt was not saved.");
        item = rows[0];
      } catch (error) {
        // A retry can race another request. The unique idempotency key wins.
        const duplicated = await selectRows("client_document_register", {
          filters: { project_id: projectId, idempotency_key: idempotency }, limit: 1,
        });
        if (!duplicated.length) throw error;
        item = duplicated[0];
      }
    } else if (action === "verify" || action === "reject" || action === "return") {
      const id = text(input.registerId, 80);
      if (!UUID.test(id)) return response({ success: false, error: "Invalid document receipt ID." }, 400);
      const rows = await selectRows("client_document_register", {
        filters: { project_id: projectId, id }, limit: 1,
      });
      if (!rows.length) return response({ success: false, error: "Document record not found in this project." }, 404);
      const prior = rows[0];
      const status = text(prior.collection_status);
      if (!["Received", "Partial"].includes(status)) {
        return response({ success: false, error: "Only received documents can be verified or returned." }, 409);
      }
      if (text(prior.return_status) === "Returned") {
        return response({ success: false, error: "Returned documents cannot be changed. Receive a new copy instead." }, 409);
      }
      let changes: Row;
      const filters: Row = { project_id: projectId, id };
      if (action === "return") {
        if (text(prior.return_status) !== "Held by LAND VIEW") {
          return response({ success: false, error: "Only physical documents held by LAND VIEW may be returned." }, 409);
        }
        const returnedTo = text(input.returnedTo, 150);
        const returnedDate = text(input.returnedDate || today, 10);
        if (!returnedTo || !validDate(returnedDate)) {
          return response({ success: false, error: "Return recipient and valid return date are required." }, 400);
        }
        filters.return_status = "Held by LAND VIEW";
        changes = {
          return_status: "Returned", returned_date: returnedDate, returned_to: returnedTo,
          returned_by: by, collection_status: "Returned",
          updated_at: new Date().toISOString(),
        };
      } else {
        const notes = text(input.notes, 500);
        if (action === "reject" && !notes) {
          return response({ success: false, error: "State why the document was rejected." }, 400);
        }
        const current = text(prior.verification_status) || "Unverified";
        const next = action === "verify" ? "Verified" : "Rejected";
        if (current === next) return response({ success: true, data: describe(prior), duplicate: true });
        filters.verification_status = current;
        filters.return_status = text(prior.return_status);
        changes = {
          verification_status: next, verified_at: new Date().toISOString(), verified_by: by,
          verification_notes: notes || null, updated_at: new Date().toISOString(),
        };
      }
      const updated = await updateRows("client_document_register", filters, changes);
      if (!updated.length) return response({ success: false, error: "Document changed concurrently. Reload and retry." }, 409);
      item = updated[0];
    } else {
      return response({ success: false, error: "Unsupported document action." }, 400);
    }
    await recordAuditEvent({
      user, request, action: "v4_client_document_" + action,
      entityType: "client_document_register", entityId: text(item.id, 80),
      details: { projectCode: text(project.project_code, 80), documentCode: text(item.register_code, 80) },
      source: "project-v4-document-registry",
    });
    return response({ success: true, data: describe(item) });
  } catch (error) {
    console.error("Project document register update failed", error);
    return response({ success: false, error: "Document action failed without changing other project modules." }, 500);
  }
}
