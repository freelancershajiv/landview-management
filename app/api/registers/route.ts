import { NextRequest, NextResponse } from "next/server";
import { requirePortalSession } from "@/lib/server-auth";
import { insertRows, normalizeProjectCode, selectRows, updateRows } from "@/lib/supabase-data";

type Row = Record<string, any>;
type RegisterKind = "documents" | "books";

function text(value: unknown) { return String(value ?? "").trim(); }
function userRole(user: Row) { return text(user?.role || user?.Role).toLowerCase(); }
function userLabel(user: Row) {
  return text(user?.name || user?.Name || user?.employeeId || user?.Employee_ID || user?.userId || user?.User_ID || user?.username || user?.Username) || "LAND VIEW";
}
function allowedProjectCodes(user: Row) {
  const role = userRole(user);
  if (role === "admin" || role === "manager") return null;
  const raw = text(user?.projectIds || user?.Project_IDs || user?.projects || user?.Projects);
  return new Set(raw.split(/[;,\n]+/).map((value) => normalizeProjectCode(value)).filter(Boolean));
}
function ensureProjectAllowed(projectCode: string, user: Row) {
  const allowed = allowedProjectCodes(user);
  if (allowed !== null && !allowed.has(normalizeProjectCode(projectCode))) throw new Error("You do not have access to this project.");
}
async function projectByCode(projectCode: string, user: Row) {
  const code = normalizeProjectCode(projectCode);
  if (!code) throw new Error("Choose a project first.");
  ensureProjectAllowed(code, user);
  const rows = await selectRows("projects", { filters: { project_code: code }, limit: 1 });
  if (!rows.length) throw new Error("Project not found.");
  return rows[0];
}
function dateOrNull(value: unknown) { return text(value) || null; }
function intValue(value: unknown, fallback = 1) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : fallback;
}
function documentPayload(body: Row) {
  return {
    document_name: text(body.document_name) || "Other Document",
    document_type: text(body.document_type) || null,
    collection_status: text(body.collection_status) || "Pending",
    document_form: text(body.document_form) || "Copy",
    quantity: intValue(body.quantity, 1),
    received_date: dateOrNull(body.received_date),
    received_by: text(body.received_by) || null,
    return_status: text(body.return_status) || "Not Applicable",
    returned_date: dateOrNull(body.returned_date),
    returned_to: text(body.returned_to) || null,
    remarks: text(body.remarks) || null,
  };
}
function bookPayload(body: Row) {
  return {
    book_type: text(body.book_type) || "Design Book",
    revision: text(body.revision) || null,
    copies: Math.max(1, intValue(body.copies, 1)),
    preparation_status: text(body.preparation_status) || "Prepared",
    ready_date: dateOrNull(body.ready_date),
    printer_name: text(body.printer_name) || null,
    sent_to_print_date: dateOrNull(body.sent_to_print_date),
    printing_status: text(body.printing_status) || "Pending",
    printed_date: dateOrNull(body.printed_date),
    collected_from_printer_date: dateOrNull(body.collected_from_printer_date),
    delivery_status: text(body.delivery_status) || "Pending",
    delivered_date: dateOrNull(body.delivered_date),
    delivered_to: text(body.delivered_to) || null,
    delivered_by: text(body.delivered_by) || null,
    remarks: text(body.remarks) || null,
  };
}
async function loadRegister(user: Row) {
  const allowed = allowedProjectCodes(user);
  const [projects, documents, books] = await Promise.all([
    selectRows("projects", { order: "project_code:desc", limit: 5000 }),
    selectRows("client_document_register", { order: "updated_at:desc", limit: 5000 }),
    selectRows("design_book_register", { order: "updated_at:desc", limit: 5000 }),
  ]);
  const visibleProjects = allowed === null ? projects : projects.filter((project) => allowed.has(normalizeProjectCode(project.project_code)));
  const projectMap = new Map(visibleProjects.map((project) => [project.id, project]));
  const decorate = (row: Row) => {
    const project = projectMap.get(row.project_id);
    if (!project) return null;
    return {
      ...row,
      project_code: project.project_code,
      project_name: project.project_name || "",
      client_name: project.client_name_snapshot || "",
      phone_number: project.phone_number_snapshot || "",
      location: project.location || "",
    };
  };
  return {
    projects: visibleProjects.map((project) => ({
      id: project.id, project_code: project.project_code, project_name: project.project_name || "",
      client_name: project.client_name_snapshot || "", phone_number: project.phone_number_snapshot || "",
      location: project.location || "", status: project.status || "",
    })),
    documents: documents.map(decorate).filter(Boolean),
    books: books.map(decorate).filter(Boolean),
  };
}

export async function GET() {
  try {
    const session = await requirePortalSession(["admin", "manager", "employee"]);
    return NextResponse.json({ success: true, data: await loadRegister(session.user as Row) });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not load registers." }, { status: 500 });
  }
}
export async function POST(request: NextRequest) {
  try {
    const session = await requirePortalSession(["admin", "manager", "employee"]);
    const body = await request.json() as Row;
    const kind = text(body.kind) as RegisterKind;
    if (kind !== "documents" && kind !== "books") throw new Error("Invalid register type.");
    const project = await projectByCode(body.project_code, session.user as Row);
    const base = { project_id: project.id, created_by_text: userLabel(session.user as Row), updated_at: new Date().toISOString() };
    const rows = kind === "documents"
      ? await insertRows("client_document_register", { ...base, ...documentPayload(body) })
      : await insertRows("design_book_register", { ...base, ...bookPayload(body) });
    return NextResponse.json({ success: true, data: rows[0] || null });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not create register entry." }, { status: 400 });
  }
}
export async function PATCH(request: NextRequest) {
  try {
    const session = await requirePortalSession(["admin", "manager", "employee"]);
    const body = await request.json() as Row;
    const kind = text(body.kind) as RegisterKind;
    const id = text(body.id);
    if (!id) throw new Error("Register entry ID is required.");
    if (kind !== "documents" && kind !== "books") throw new Error("Invalid register type.");
    const table = kind === "documents" ? "client_document_register" : "design_book_register";
    const existing = await selectRows(table, { filters: { id }, limit: 1 });
    if (!existing.length) throw new Error("Register entry not found.");
    const projectCode = text(body.project_code);
    const project = projectCode
      ? await projectByCode(projectCode, session.user as Row)
      : (await selectRows("projects", { filters: { id: existing[0].project_id }, limit: 1 }))[0];
    if (!project) throw new Error("Project not found.");
    ensureProjectAllowed(project.project_code, session.user as Row);
    const changes = {
      project_id: project.id,
      ...(kind === "documents" ? documentPayload(body) : bookPayload(body)),
      updated_at: new Date().toISOString(),
    };
    const rows = await updateRows(table, { id }, changes);
    return NextResponse.json({ success: true, data: rows[0] || null });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not update register entry." }, { status: 400 });
  }
}
