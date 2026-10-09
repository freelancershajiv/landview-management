import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf, userIdOf, type WorkspaceUser } from "@/lib/local-session";
import { insertRows, selectRows, updateRows } from "@/lib/supabase-data";
import { publishSiteEntryToWhatsApp } from "@/lib/whatsapp-site-entries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;

function text(value: unknown, max = 4000) {
  return String(value ?? "").trim().slice(0, max);
}

function numberOrNull(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateOrToday(value: unknown) {
  const raw = text(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : new Date().toISOString().slice(0, 10);
}

function employeeCodeOf(user: WorkspaceUser | null | undefined) {
  return text((user as Row)?.employeeId || (user as Row)?.Employee_ID || (user as Row)?.userId || (user as Row)?.User_ID);
}

function displayNameOf(user: WorkspaceUser | null | undefined) {
  return text((user as Row)?.name || (user as Row)?.Name || (user as Row)?.username || (user as Row)?.Username || employeeCodeOf(user) || userIdOf(user));
}

function originAllowed(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return host === "app.landview.com.bd" || host === "localhost" || host === "127.0.0.1" || host.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

function ok(data: unknown) {
  return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}

function fail(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : String(error || "Request failed.");
  const code = /session expired|authentication required/i.test(message) ? 401 : /permission|access denied/i.test(message) ? 403 : status;
  return NextResponse.json({ success: false, error: message }, { status: code, headers: { "Cache-Control": "no-store" } });
}

async function requireWorkspaceUser(request: NextRequest) {
  const user = await requireLocalSession(request);
  if (!user) throw new Error("Session expired.");
  const role = roleOf(user);
  if (!["admin", "manager", "employee"].includes(role)) throw new Error("Access denied.");
  return user;
}

async function nextProposalCode() {
  const rows = await selectRows("proposals", { select: "proposal_code", limit: 5000 });
  const year = new Date().getFullYear();
  const max = rows.reduce((highest, row) => {
    const match = text(row.proposal_code).match(new RegExp(`^PROP-${year}-(\\d+)$`));
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return `PROP-${year}-${String(max + 1).padStart(4, "0")}`;
}

async function nextProspectCode() {
  const rows = await selectRows("prospective_clients", { select: "prospect_code", limit: 5000 });
  const max = rows.reduce((highest, row) => {
    const match = text(row.prospect_code).match(/^PC-(\d+)$/);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return `PC-${String(max + 1).padStart(4, "0")}`;
}

function composedLocation(input: Row) {
  const explicit = text(input.projectLocation);
  if (explicit) return explicit;
  return [
    text(input.roadHolding),
    text(input.villageArea),
    text(input.localBodyName),
    text(input.upazilaThana),
    text(input.district),
    text(input.division),
  ].filter(Boolean).join(", ");
}

function siteNotes(input: Row, proposalCode: string) {
  const land = [
    text(input.mouza) ? `Mouza: ${text(input.mouza)}` : "",
    text(input.jlNo) ? `JL No: ${text(input.jlNo)}` : "",
    text(input.dagNo) ? `Dag No: ${text(input.dagNo)}` : "",
    text(input.khatianNo) ? `Khatian No: ${text(input.khatianNo)}` : "",
  ].filter(Boolean).join("; ");
  const gps = numberOrNull(input.latitude) !== null && numberOrNull(input.longitude) !== null
    ? `GPS: ${numberOrNull(input.latitude)}, ${numberOrNull(input.longitude)}${numberOrNull(input.locationAccuracyM) !== null ? ` (±${Math.round(Number(input.locationAccuracyM))} m)` : ""}`
    : "";
  return [
    `New Site Entry · ${proposalCode}`,
    land,
    gps,
    text(input.siteNotes),
  ].filter(Boolean).join("\n");
}

function entryView(row: Row) {
  return {
    proposalId: row.proposal_code,
    prospectId: row.prospect_code || "",
    clientName: row.client_name || "",
    phone: row.phone || "",
    email: row.email || "",
    address: row.address || "",
    projectTitle: row.project_title || "",
    projectLocation: row.project_location || "",
    projectType: row.project_type || "",
    plotArea: row.plot_area || "",
    floors: row.floors || "",
    status: row.status || "",
    approvalStatus: row.approval_status || "",
    submittedRole: row.submitted_role || "",
    assignedTo: row.assigned_to || "",
    createdBy: row.created_by || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    approvedBy: row.approved_by || "",
    approvedAt: row.approved_at || "",
    approvalNotes: row.approval_notes || "",
    siteVisitDate: row.site_visit_date || "",
    latitude: row.site_latitude ?? "",
    longitude: row.site_longitude ?? "",
    locationAccuracyM: row.site_location_accuracy_m ?? "",
    locationCapturedAt: row.site_location_captured_at || "",
    division: row.division || "",
    district: row.district || "",
    upazilaThana: row.upazila_thana || "",
    localBodyType: row.local_body_type || "",
    localBodyName: row.local_body_name || "",
    wardNo: row.ward_no || "",
    villageArea: row.village_area || "",
    roadHolding: row.road_holding || "",
    mouza: row.mouza || "",
    jlNo: row.jl_no || "",
    dagNo: row.dag_no || "",
    khatianNo: row.khatian_no || "",
    siteNotes: row.site_notes || "",
  };
}

function siteEntryWhatsAppPayload(row: Row) {
  return {
    proposalId: text(row.proposal_code, 120),
    clientName: text(row.client_name, 300),
    phone: text(row.phone, 100),
    projectTitle: text(row.project_title, 400),
    projectType: text(row.project_type, 180),
    projectLocation: text(row.project_location, 600),
    plotArea: text(row.plot_area, 180),
    floors: text(row.floors, 120),
    siteVisitDate: text(row.site_visit_date, 40),
    latitude: row.site_latitude,
    longitude: row.site_longitude,
    locationAccuracyM: row.site_location_accuracy_m,
    mouza: text(row.mouza, 200),
    jlNo: text(row.jl_no, 120),
    dagNo: text(row.dag_no, 240),
    khatianNo: text(row.khatian_no, 240),
    submittedRole: text(row.submitted_role, 80),
    senderEmployeeId: text(row.assigned_to, 120),
  };
}

function logWhatsAppResult(context: string, proposalId: string, result: { status?: string; sender?: string; reason?: string }) {
  if (result.status === "sent") {
    console.info("[site-entry-whatsapp] sent", { context, proposalId, sender: result.sender || "unknown" });
    return;
  }
  console.warn("[site-entry-whatsapp] not sent", {
    context,
    proposalId,
    status: result.status || "unknown",
    reason: text(result.reason, 700),
  });
}

async function loadEntry(proposalId: string) {
  const rows = await selectRows("proposals", { filters: { proposal_code: proposalId }, limit: 1 });
  const row = rows[0];
  if (!row || text(row.entry_source) !== "Site Entry") throw new Error("Site entry not found.");
  return row;
}

async function listEntries(user: WorkspaceUser) {
  const role = roleOf(user);
  const rows = await selectRows("proposals", { filters: { entry_source: "Site Entry" }, order: "updated_at:desc", limit: 5000 });
  if (role === "admin" || role === "manager") return rows.map(entryView);
  const userKey = userIdOf(user);
  const employeeCode = employeeCodeOf(user);
  return rows
    .filter((row) => text(row.created_by) === userKey || text(row.assigned_to) === employeeCode)
    .map(entryView);
}

async function createEntry(user: WorkspaceUser, input: Row) {
  const role = roleOf(user);
  const clientName = text(input.clientName, 300);
  const phone = text(input.phone, 100);
  const projectTitle = text(input.projectTitle, 400);
  const projectLocation = composedLocation(input);
  if (!clientName) throw new Error("Client / owner name is required.");
  if (!phone) throw new Error("Phone number is required.");
  if (!projectLocation) throw new Error("Project / site location is required.");

  const [proposalCode, prospectCode] = await Promise.all([nextProposalCode(), nextProspectCode()]);
  const now = new Date().toISOString();
  const employeeCode = employeeCodeOf(user);
  const creator = userIdOf(user);
  const autoApproved = role === "admin" || role === "manager";
  const approvalStatus = autoApproved ? "Approved" : "Pending";
  const proposalStatus = autoApproved ? "Draft" : "Pending Approval";
  const note = siteNotes(input, proposalCode);

  await insertRows("prospective_clients", {
    prospect_code: prospectCode,
    client_name: clientName,
    phone,
    email: text(input.email) || null,
    address: text(input.address) || null,
    source: "Site Entry",
    referred_by: text(input.referredBy) || null,
    ref_contact: text(input.refContact) || null,
    assigned_to: employeeCode || creator || null,
    status: "Prospect",
    notes: note || null,
    created_by: creator || null,
    created_at: now,
    updated_at: now,
  });

  const proposal = {
    proposal_code: proposalCode,
    prospect_code: prospectCode,
    client_name: clientName,
    phone,
    email: text(input.email) || null,
    address: text(input.address) || null,
    project_title: projectTitle || clientName,
    project_location: projectLocation,
    project_type: text(input.projectType) || "Residential",
    plot_area: text(input.plotArea) || null,
    floors: text(input.floors) || null,
    gross_amount: 0,
    discount: 0,
    net_amount: 0,
    validity_days: 30,
    status: proposalStatus,
    assigned_to: employeeCode || creator || null,
    notes: note || null,
    converted_project_code: null,
    created_by: creator || null,
    created_at: now,
    updated_at: now,
    entry_source: "Site Entry",
    approval_status: approvalStatus,
    submitted_role: role,
    approved_by: autoApproved ? creator || null : null,
    approved_at: autoApproved ? now : null,
    approval_notes: autoApproved ? "Auto-approved because the entry was submitted by Management/Admin." : null,
    site_visit_date: dateOrToday(input.siteVisitDate),
    site_latitude: numberOrNull(input.latitude),
    site_longitude: numberOrNull(input.longitude),
    site_location_accuracy_m: numberOrNull(input.locationAccuracyM),
    site_location_captured_at: text(input.locationCapturedAt) || null,
    division: text(input.division) || null,
    district: text(input.district) || null,
    upazila_thana: text(input.upazilaThana) || null,
    local_body_type: text(input.localBodyType) || null,
    local_body_name: text(input.localBodyName) || null,
    ward_no: text(input.wardNo) || null,
    village_area: text(input.villageArea) || null,
    road_holding: text(input.roadHolding) || null,
    mouza: text(input.mouza) || null,
    jl_no: text(input.jlNo) || null,
    dag_no: text(input.dagNo) || null,
    khatian_no: text(input.khatianNo) || null,
    site_notes: text(input.siteNotes) || null,
  };

  await insertRows("proposals", proposal);
  await insertRows("proposal_activity", {
    activity_code: `PA-${crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`,
    proposal_code: proposalCode,
    prospect_code: prospectCode,
    action: autoApproved ? "Site Entry Created" : "Site Entry Submitted for Approval",
    from_status: null,
    to_status: proposalStatus,
    performed_by: displayNameOf(user) || creator || employeeCode,
    performed_at: now,
    details: autoApproved
      ? "New site entry created as an approved Draft proposal."
      : "Employee new-site entry is waiting for Management/Admin approval.",
    user_key: creator || employeeCode || null,
    role,
    reference: proposalCode,
  });

  const whatsApp = await publishSiteEntryToWhatsApp({
    event: autoApproved ? "created" : "submitted",
    ...siteEntryWhatsAppPayload(proposal),
    submittedBy: displayNameOf(user),
    senderEmployeeId: employeeCode || text(proposal.assigned_to, 120),
  });
  logWhatsAppResult(autoApproved ? "created" : "submitted", proposalCode, whatsApp);

  return { ...entryView(proposal), whatsApp };
}

async function reviewEntry(user: WorkspaceUser, input: Row, approve: boolean) {
  const role = roleOf(user);
  if (role !== "admin" && role !== "manager") throw new Error("Management or Admin permission required.");
  const proposalId = text(input.proposalId);
  if (!proposalId) throw new Error("Proposal ID is required.");
  const current = await loadEntry(proposalId);
  if (text(current.converted_project_code)) throw new Error("This proposal has already been converted to a project.");

  const now = new Date().toISOString();
  const reviewer = userIdOf(user);
  const reviewNotes = text(input.notes);
  const nextStatus = approve ? "Draft" : "Rejected";
  const nextApproval = approve ? "Approved" : "Rejected";

  await updateRows("proposals", { proposal_code: proposalId }, {
    status: nextStatus,
    approval_status: nextApproval,
    approved_by: reviewer || null,
    approved_at: now,
    approval_notes: reviewNotes || null,
    updated_at: now,
  });

  await insertRows("proposal_activity", {
    activity_code: `PA-${crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`,
    proposal_code: proposalId,
    prospect_code: current.prospect_code || null,
    action: approve ? "Site Entry Approved" : "Site Entry Rejected",
    from_status: current.status || "Pending Approval",
    to_status: nextStatus,
    performed_by: displayNameOf(user) || reviewer,
    performed_at: now,
    details: reviewNotes || (approve ? "Approved by Management/Admin." : "Rejected by Management/Admin."),
    user_key: reviewer || null,
    role,
    reference: proposalId,
  });

  const updated = {
    ...current,
    status: nextStatus,
    approval_status: nextApproval,
    approved_by: reviewer,
    approved_at: now,
    approval_notes: reviewNotes,
    updated_at: now,
  };
  const whatsApp = await publishSiteEntryToWhatsApp({
    event: approve ? "approved" : "rejected",
    ...siteEntryWhatsAppPayload(updated),
    reviewedBy: displayNameOf(user),
    reviewNotes: reviewNotes || (approve ? "Approved by Management/Admin." : "Rejected by Management/Admin."),
  });
  logWhatsAppResult(approve ? "approved" : "rejected", proposalId, whatsApp);

  return { ...entryView(updated), whatsApp };
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireWorkspaceUser(request);
    const entries = await listEntries(user);
    const role = roleOf(user);
    return ok({ role, canReview: role === "admin" || role === "manager", entries });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: NextRequest) {
  if (!originAllowed(request)) return fail("Access denied.", 403);
  try {
    const user = await requireWorkspaceUser(request);
    const input = await request.json().catch(() => ({})) as Row;
    const action = text(input.action).toLowerCase();
    if (action === "create") return ok(await createEntry(user, input));
    if (action === "approve") return ok(await reviewEntry(user, input, true));
    if (action === "reject") return ok(await reviewEntry(user, input, false));
    throw new Error("Unsupported site-entry action.");
  } catch (error) {
    return fail(error);
  }
}
