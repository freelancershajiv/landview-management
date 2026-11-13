import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { hasCapability } from "@/lib/permissions";
import { recordAuditEvent } from "@/lib/audit-log";
import { normalizeProjectCode, selectRows, upsertRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;
const REQUIREMENTS = [
  { key: "photo", label: "Photo" },
  { key: "identity", label: "NID / Passport / Birth Certificate" },
  { key: "ownership", label: "Ownership Registry Paper" },
  { key: "khotian", label: "Khotian" },
  { key: "tax", label: "Land Tax Slip" },
] as const;
const KEYS = new Set<string>(REQUIREMENTS.map((item) => item.key));
function text(raw: unknown, len = 160) { return String(raw ?? "").trim().slice(0, len); }
function response(data: unknown, status = 200) {
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
async function authorize(request: NextRequest, write = false) {
  const user = await requireLocalSession(request) as Row | null;
  if (!user) return null;
  const role = roleOf(user);
  return ["admin", "manager"].includes(role) &&
    hasCapability(role, write ? "documents.manage" : "documents.view") ? user : null;
}
async function projectFor(value: unknown) {
  const code = normalizeProjectCode(value);
  if (!code) return null;
  const rows = await selectRows("projects", { filters: { project_code: code }, limit: 1 });
  return rows[0] as Row | undefined || null;
}
function matchedKey(row: Row) {
  const declared = text(row.requirement_key, 40);
  if (KEYS.has(declared)) return declared;
  const name = text(row.document_name).toLowerCase();
  if (/photo|photograph/.test(name)) return "photo";
  if (/nid|passport|birth certificate|identity|national id/.test(name)) return "identity";
  if (/ownership|registry|land deed/.test(name)) return "ownership";
  if (/khotian|khatian/.test(name)) return "khotian";
  if (/land tax|tax slip|tax receipt|dakhila/.test(name)) return "tax";
  return "";
}
function isVerified(row: Row) {
  return text(row.verification_status) === "Verified" &&
    ["Received", "Partial"].includes(text(row.collection_status)) &&
    text(row.return_status) !== "Returned";
}
export async function GET(request: NextRequest) {
  try {
    const user = await authorize(request);
    if (!user) return response({ success: false, error: "Document management permission required." }, 403);
    const project = await projectFor(request.nextUrl.searchParams.get("projectId"));
    if (!project) return response({ success: false, error: "Project not found." }, 404);
    const id = text(project.id, 80);
    const [services, receipts] = await Promise.all([
      selectRows("project_service_workflows", { filters: { project_id: id }, limit: 1500 }),
      selectRows("client_document_register", { filters: { project_id: id }, limit: 1500 }),
    ]);
    let links: Row[] = [];
    let available = false;
    try {
      links = await selectRows("project_service_document_requirements", {
        filters: { project_id: id }, limit: 1500,
      });
      available = true;
    } catch { /* Migration/gateway not deployed: informative read-only view. */ }

    const verifiedKeys = new Set(receipts.filter(isVerified).map(matchedKey).filter(Boolean));
    const result = services.filter((service) => text(service.service_key)).map((service) => {
      const key = text(service.service_key);
      const configured = links.filter((row) => text(row.service_key) === key);
      const required = configured.filter((row) => row.active === true).map((row) => text(row.requirement_key));
      const missing = required.filter((requirement) => !verifiedKeys.has(requirement));
      return {
        serviceKey: key, serviceName: text(service.service_name), workflowStatus: text(service.status),
        configured: configured.length > 0, required, verified: required.filter((item) => verifiedKeys.has(item)),
        missing, ready: configured.length > 0 && missing.length === 0,
      };
    });
    return response({ success: true, data: {
      available, writeEnabled: available && writesEnabled(), requirements: REQUIREMENTS,
      services: result,
      verifiedKeys: Array.from(verifiedKeys),
      advisoryOnly: true,
      reason: !available ? "Service-document links are not migrated; preview remains read-only." :
        "Document readiness is advisory only. Payment and delivery gates are unchanged.",
    } });
  } catch (error) {
    console.error("v4 document service readiness failed:", error);
    return response({ success: false, error: "Could not load project document requirements." }, 500);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return response({ success: false, error: "Invalid request origin." }, 403);
  try {
    const user = await authorize(request, true);
    if (!user) return response({ success: false, error: "Document management permission required." }, 403);
    if (!writesEnabled()) return response({ success: false,
      error: "Service-document editing is locked until production backup and release checks pass." }, 423);
    const input = await request.json() as Row;
    if (input.action !== "setRequirements") return response({ success: false, error: "Unsupported document link action." }, 400);
    const project = await projectFor(input.projectId);
    if (!project) return response({ success: false, error: "Project not found." }, 404);
    const projectId = text(project.id, 80);
    const serviceKey = text(input.serviceKey, 160);
    const raw = input.requirements;
    if (!serviceKey || !Array.isArray(raw) || raw.length > 5 ||
      raw.some((key) => typeof key !== "string" || !KEYS.has(key)) ||
      new Set(raw).size !== raw.length) {
      return response({ success: false, error: "Select valid unique document requirements." }, 400);
    }
    const services = await selectRows("project_service_workflows", {
      filters: { project_id: projectId, service_key: serviceKey }, limit: 1,
    });
    if (!services.length) return response({ success: false, error: "Service does not belong to this project." }, 404);
    const who = text(user.employeeId || user.Employee_ID || user.userId || user.User_ID || user.username || user.Username, 120) || "LAND VIEW";
    await upsertRows("project_service_document_requirements", REQUIREMENTS.map((item) => ({
      project_id: projectId, service_key: serviceKey, requirement_key: item.key,
      active: raw.includes(item.key), configured_by: who, configured_at: new Date().toISOString(),
    })), "project_id,service_key,requirement_key");
    await recordAuditEvent({ user, request, action: "v4_service_document_requirements_updated",
      entityType: "project_service_workflows", entityId: text(services[0].id, 80),
      details: { projectCode: text(project.project_code, 80), serviceKey, requirements: raw },
      source: "project-v4-document-requirements" });
    return response({ success: true, data: { serviceKey, requirements: raw } });
  } catch (error) {
    console.error("v4 service document requirement write failed:", error);
    return response({ success: false, error: "Could not update service document requirements." }, 500);
  }
}
