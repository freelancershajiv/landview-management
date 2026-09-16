import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf, userIdOf } from "@/lib/local-session";
import { insertRows, normalizeProjectCode, selectRows, updateRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;
const headers = { "Cache-Control": "no-store, max-age=0", "X-Landview-Data": "supabase" };
const supportedCategories = ["project", "structural_design", "supervision", "building", "employee"];

function clean(value: unknown, max = 500) { return String(value ?? "").trim().slice(0, max); }
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}
function statusForMessage(message: string) {
  const normalized = String(message || "").trim().toLowerCase();
  if (/session expired|authentication required|unauthorized/.test(normalized)) return 401;
  if (/access denied|permission required|admin access/.test(normalized)) return 403;
  return 500;
}
function projectIdsOf(user: Row) {
  const raw = clean(user.projectIds || user.Project_IDs || user.project_ids, 3000);
  return Array.from(new Set(raw.split(/[;,\s]+/).map(normalizeProjectCode).filter(Boolean)));
}
async function requireUser(request: NextRequest) {
  const user = await requireLocalSession(request) as Row | null;
  if (!user) throw new Error("Session expired.");
  return user;
}
async function permission(user: Row, key: string) {
  const role = roleOf(user);
  if (role === "admin" || role === "manager") return true;
  const rows = await selectRows("app_permissions", { filters: { user_key: userIdOf(user), permission: key }, order: "created_at:desc", limit: 1 });
  return Boolean(rows[0] && clean(rows[0].status, 30).toLowerCase() === "active");
}
function mapRequest(row: Row) {
  return {
    requestId: row.request_code, requesterRole: row.requester_role || "", requesterId: row.requester_id || "", projectId: row.project_code || "", employeeId: row.employee_code || "",
    clientName: row.client_name || "", mobile: row.mobile || "", certificateType: row.certificate_type || row.category || "", category: row.category || "", subject: row.subject || "", details: row.details || "",
    status: row.status || "Pending", certificateId: row.certificate_code || "", requestedAt: row.requested_at || "", reviewedAt: row.reviewed_at || "", reviewedBy: row.reviewed_by || "", adminNote: row.admin_note || "",
  };
}
function mapCertificate(row: Row) {
  return {
    certificateId: row.certificate_code, type: row.type || "project", category: row.category || "", requestId: row.request_code || "", name: row.name || "", address: row.address || "",
    fatherName: row.father_name || "", motherName: row.mother_name || "", nidNo: row.nid_no || "", position: row.position || "", subject: row.subject || "", reference: row.reference || "", description: row.description || "",
    issuedAt: row.issued_at || "", expiresAt: row.expires_at || "", status: row.status || "Active", revision: Number(row.revision || 1), parentId: row.parent_code || "", supersededBy: row.superseded_by || "",
    revokedAt: row.revoked_at || "", revokedReason: row.revoked_reason || "", deletedAt: row.deleted_at || "", deletedReason: row.deleted_reason || "",
  };
}
async function mine(user: Row) {
  const role = roleOf(user), uid = userIdOf(user);
  let requests: Row[] = [];
  if (role === "client") {
    const projectIds = projectIdsOf(user);
    if (projectIds.length) requests = await selectRows("certificate_requests", { inFilters: { project_code: projectIds }, order: "requested_at:desc", limit: 5000 });
  } else if (role === "employee") {
    requests = await selectRows("certificate_requests", { filters: { requester_id: uid }, order: "requested_at:desc", limit: 5000 });
  } else {
    requests = await selectRows("certificate_requests", { filters: { requester_id: uid }, order: "requested_at:desc", limit: 5000 });
  }
  const requestIds = requests.map(row => row.request_code).filter(Boolean);
  const certificates = requestIds.length ? await selectRows("certificates", { inFilters: { request_code: requestIds }, order: "issued_at:desc", limit: 5000 }) : [];
  return { requests: requests.map(mapRequest), certificates: certificates.map(mapCertificate), backendMode: "supabase", certificatesAvailable: true, categories: supportedCategories };
}
async function adminRequests(user: Row) {
  if (!await permission(user, "requests.view")) throw new Error("Permission required: requests.view");
  const requests = await selectRows("certificate_requests", { order: "requested_at:desc", limit: 5000 });
  return { requests: requests.map(mapRequest), backendMode: "supabase", categories: supportedCategories };
}

export async function GET(request: NextRequest) {
  const mode = clean(request.nextUrl.searchParams.get("mode"), 30).toLowerCase();
  try {
    const user = await requireUser(request);
    const data = mode === "admin" ? await adminRequests(user) : await mine(user);
    return NextResponse.json({ success: true, data }, { headers });
  } catch (error: any) {
    const message = error?.message || "Could not load certificate portal.";
    return NextResponse.json({ success: false, error: message }, { status: statusForMessage(message), headers });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
    const user = await requireUser(request);
    const input = await request.json();
    const action = clean(input?.action, 30).toLowerCase();

    if (action === "request") {
      const category = clean(input?.category, 40).toLowerCase();
      if (!supportedCategories.includes(category)) return NextResponse.json({ success: false, error: "This certificate category is not supported." }, { status: 400 });
      let projectId = normalizeProjectCode(input?.projectId);
      const role = roleOf(user);
      if (role === "client") {
        const allowed = projectIdsOf(user);
        if (!projectId) projectId = allowed[0] || "";
        if (!allowed.includes(projectId)) throw new Error("Access denied for this project.");
      }
      const requestId = `CR-${Date.now()}-${crypto.randomUUID().slice(0,6).toUpperCase()}`;
      let clientName = clean(user.name || user.Name, 160), mobile = "";
      if (projectId) {
        const project = (await selectRows("projects", { filters: { project_code: projectId }, limit: 1 }))[0];
        if (project) { clientName = project.client_name_snapshot || clientName; mobile = project.phone_number_snapshot || ""; }
      }
      const row = {
        request_code: requestId, requester_role: role, requester_id: userIdOf(user), project_code: projectId || null,
        employee_code: clean(user.employeeId || user.Employee_ID, 80) || null, client_name: clientName || null, mobile: mobile || null,
        certificate_type: category, category, subject: clean(input?.subject, 160) || null, details: clean(input?.details, 800) || null,
        status: "Pending", certificate_code: null, requested_at: new Date().toISOString(), reviewed_at: null, reviewed_by: null, admin_note: null,
      };
      const saved = await insertRows("certificate_requests", row);
      return NextResponse.json({ success: true, data: { request: mapRequest(saved[0] || row), backendMode: "supabase" } }, { headers });
    }

    if (action === "review") {
      if (!await permission(user, "certificates.process") && !await permission(user, "requests.view")) throw new Error("Permission required: certificates.process");
      const requestId = clean(input?.requestId, 80), decision = clean(input?.decision, 20) || "Reviewed";
      if (!requestId) throw new Error("Request ID is required.");
      const rows = await updateRows("certificate_requests", { request_code: requestId }, { status: decision, reviewed_at: new Date().toISOString(), reviewed_by: userIdOf(user), admin_note: clean(input?.note, 400) || null });
      if (!rows.length) throw new Error("Certificate request not found.");
      return NextResponse.json({ success: true, data: { request: mapRequest(rows[0]), backendMode: "supabase" } }, { headers });
    }

    if (action === "link-issued") {
      if (!await permission(user, "certificates.issue")) throw new Error("Permission required: certificates.issue");
      const requestId = clean(input?.requestId, 80), certificateId = clean(input?.certificateId, 80).toUpperCase();
      if (!requestId || !certificateId) throw new Error("Request ID and certificate ID are required.");
      const rows = await updateRows("certificate_requests", { request_code: requestId }, { status: "Issued", certificate_code: certificateId, reviewed_at: new Date().toISOString(), reviewed_by: userIdOf(user) });
      if (!rows.length) throw new Error("Certificate request not found.");
      return NextResponse.json({ success: true, data: { request: mapRequest(rows[0]), backendMode: "supabase" } }, { headers });
    }

    return NextResponse.json({ success: false, error: "Unknown certificate portal action." }, { status: 400 });
  } catch (error: any) {
    const message = error?.message || "Certificate portal request failed.";
    return NextResponse.json({ success: false, error: message }, { status: statusForMessage(message), headers });
  }
}
