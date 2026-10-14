import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf, userIdOf } from "@/lib/local-session";
import { recordAuditEvent } from "@/lib/audit-log";
import { insertRows, selectRows, updateRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;

type ConversionPlan = {
  design: Array<{ item: Row; discipline: string; title: string }>;
  approvals: Array<{ item: Row; approvalType: string; requestedFrom: string }>;
  tasks: Array<{ item: Row; title: string; description: string }>;
  supervisionRequired: boolean;
};

type InitialLifecycle = {
  phase: "Design Stage" | "Approval Stage" | "Supervision / Construction Stage" | "Handover";
  designStatus: string;
  approvalStatus: string;
  supervisionStatus: string;
};

function text(value: unknown, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

function numberOf(value: unknown) {
  const n = Number(String(value ?? 0).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function code(prefix: string, projectCode?: string) {
  const project = projectCode ? `-${projectCode.replace(/[^A-Z0-9]/gi, "").toUpperCase()}` : "";
  return `${prefix}${project}-${crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
}

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store, max-age=0" } });
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return host === request.nextUrl.hostname.toLowerCase()
      || host === "app.landview.com.bd"
      || host === "www.landview.com.bd"
      || host === "landview.com.bd"
      || host === "localhost"
      || host === "127.0.0.1"
      || host.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

async function conversionUser(request: NextRequest) {
  const user = await requireLocalSession(request) as Row | null;
  if (!user) throw new Error("Session expired.");
  const role = roleOf(user);
  if (role === "admin" || role === "manager") return user;
  const actor = userIdOf(user);
  if (!actor) throw new Error("Permission required: proposals.convert");
  const rows = await selectRows("app_permissions", { filters: { user_key: actor, permission: "proposals.convert" }, limit: 10 });
  const allowed = rows.some((row) => text(row.status).toLowerCase() === "active");
  if (!allowed) throw new Error("Permission required: proposals.convert");
  return user;
}

function normalizeService(item: Row) {
  return `${text(item.service)} ${text(item.description)} ${text(item.category)}`
    .toLowerCase()
    .replace(/[-_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function designDefinition(item: Row) {
  const value = normalizeService(item);
  if (/architectural design/.test(value)) return { discipline: "Architectural", title: "Architectural Design" };
  if (/structural design/.test(value)) return { discipline: "Structural", title: "Structural Design" };
  if (/3d.*interior|interior.*3d/.test(value)) return { discipline: "3D Interior", title: "3D Design - Interior" };
  if (/3d.*exterior|exterior.*3d|3d design/.test(value)) return { discipline: "3D Exterior", title: "3D Design - Exterior" };
  if (/electrical design/.test(value)) return { discipline: "Electrical", title: "Electrical Design" };
  if (/fire safety design/.test(value)) return { discipline: "Fire Safety", title: "Fire Safety Design" };
  if (/plumbing design/.test(value)) return { discipline: "Plumbing", title: "Plumbing Design" };
  if (/plan approval design/.test(value)) return { discipline: "Plan Approval", title: "Plan Approval Design" };
  if (/estimate.*costing|costing.*estimate/.test(value)) return { discipline: "Estimate", title: "Estimate & Costing" };
  if (/design books?/.test(value)) return { discipline: "Design Books", title: "Design Books" };
  if (/digital survey/.test(value)) return { discipline: "Survey", title: "Digital Survey Report" };
  return null;
}

function approvalDefinition(item: Row) {
  const value = normalizeService(item);
  if (/municipality land noc/.test(value)) return { approvalType: "Municipality Land NOC", requestedFrom: "Municipality" };
  if (/fire service approval/.test(value)) return { approvalType: "Fire Service Approval", requestedFrom: "Fire Service" };
  if (/district vetting committee approval/.test(value)) return { approvalType: "District Vetting Committee Approval", requestedFrom: "District Vetting Committee" };
  if (/municipality approval|municipality file pass/.test(value)) return { approvalType: "Municipality Approval", requestedFrom: "Municipality" };
  return null;
}

function taskDefinition(item: Row) {
  const value = normalizeService(item);
  if (/soil test/.test(value)) {
    const detail = text(item.description);
    return { title: detail ? `Soil Test - ${detail}` : "Soil Test", description: "Proposal service carried into the project workflow." };
  }
  if (/site visit/.test(value)) {
    return { title: text(item.service) || "Site Visit", description: text(item.description) || "Proposal service carried into the project workflow." };
  }
  return null;
}

function buildPlan(items: Row[]): ConversionPlan {
  const design: ConversionPlan["design"] = [];
  const approvals: ConversionPlan["approvals"] = [];
  const tasks: ConversionPlan["tasks"] = [];
  let supervisionRequired = false;

  for (const item of items) {
    if (["cancelled", "canceled", "inactive"].includes(text(item.status).toLowerCase())) continue;
    const d = designDefinition(item);
    if (d) design.push({ item, ...d });
    const a = approvalDefinition(item);
    if (a) approvals.push({ item, ...a });
    const t = taskDefinition(item);
    if (t) tasks.push({ item, ...t });
    const normalized = normalizeService(item);
    if (text(item.category).toLowerCase().includes("supervision") || /site supervision|construction supervision|supervision bill/.test(normalized)) supervisionRequired = true;
  }
  return { design, approvals, tasks, supervisionRequired };
}

function initialLifecycle(plan: ConversionPlan): InitialLifecycle {
  if (plan.design.length) {
    return {
      phase: "Design Stage",
      designStatus: "In Progress",
      approvalStatus: plan.approvals.length ? "Pending" : "Completed",
      supervisionStatus: plan.supervisionRequired ? "Pending" : "Completed",
    };
  }
  if (plan.approvals.length) {
    return {
      phase: "Approval Stage",
      designStatus: "Completed",
      approvalStatus: "In Progress",
      supervisionStatus: plan.supervisionRequired ? "Pending" : "Completed",
    };
  }
  if (plan.supervisionRequired) {
    return {
      phase: "Supervision / Construction Stage",
      designStatus: "Completed",
      approvalStatus: "Completed",
      supervisionStatus: "In Progress",
    };
  }
  return {
    phase: "Handover",
    designStatus: "Completed",
    approvalStatus: "Completed",
    supervisionStatus: "Completed",
  };
}

async function nextProjectNumber() {
  const rows = await selectRows("projects", { limit: 5000 });
  let max = 0;
  for (const row of rows) {
    const match = text(row.project_code).match(/^LV-(\d+)$/i);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max + 1;
}

function projectCodeFor(n: number) {
  return `LV-${String(n).padStart(3, "0")}`;
}

async function proposalData(proposalCode: string) {
  const rows = await selectRows("proposals", { filters: { proposal_code: proposalCode }, limit: 1 });
  if (!rows.length) throw new Error("Proposal not found.");
  const proposal = rows[0];
  const [items, prospects] = await Promise.all([
    selectRows("proposal_items", { filters: { proposal_code: proposalCode }, order: "sort_order:asc", limit: 1000 }),
    proposal.prospect_code ? selectRows("prospective_clients", { filters: { prospect_code: proposal.prospect_code }, limit: 1 }) : Promise.resolve([]),
  ]);
  return { proposal, items, prospect: prospects[0] || null };
}

function billingCategory(item: Row) {
  const service = normalizeService(item);
  const category = text(item.category).toLowerCase();
  if (/design books?/.test(service)) return "Engineering Bill";
  if (category === "engineering" || category === "engineering bill") return "Engineering Bill";
  if (category === "supervision" || category === "supervision bill") return "Supervision Bill";
  return "Other Services Bill";
}

function allocateBills(items: Row[], proposal: Row) {
  const active = items
    .filter((item) => !["cancelled", "canceled", "inactive"].includes(text(item.status).toLowerCase()))
    .map((item) => ({ item, amount: Math.max(0, numberOf(item.amount) || numberOf(item.quantity) * numberOf(item.rate)) }))
    .filter((entry) => entry.amount > 0);

  const gross = active.reduce((sum, entry) => sum + entry.amount, 0);
  const proposalDiscount = Math.max(0, numberOf(proposal.discount));
  const acceptedNet = Math.max(0, numberOf(proposal.net_amount));
  const inferredDiscount = acceptedNet > 0 && acceptedNet <= gross ? Math.max(0, gross - acceptedNet) : 0;
  const targetDiscount = gross > 0 ? Math.min(gross, proposalDiscount || inferredDiscount) : 0;
  let allocated = 0;

  return active.map((entry, index) => {
    const isLast = index === active.length - 1;
    const share = isLast
      ? Math.round(Math.max(0, targetDiscount - allocated) * 100) / 100
      : Math.round((targetDiscount * entry.amount / gross) * 100) / 100;
    allocated += share;
    const category = billingCategory(entry.item);
    const service = text(entry.item.service) || text(entry.item.description) || "Service";
    const detail = text(entry.item.description);
    return {
      item: entry.item,
      category,
      description: `[${category}] ${service}${detail && detail.toLowerCase() !== service.toLowerCase() ? ` — ${detail}` : ""}`,
      amount: entry.amount,
      discount: share,
      netAmount: Math.max(0, Math.round((entry.amount - share) * 100) / 100),
    };
  });
}

async function preview(proposalCode: string) {
  const { proposal, items } = await proposalData(proposalCode);
  const plan = buildPlan(items);
  const lifecycle = initialLifecycle(plan);
  const alreadyConverted = text(proposal.converted_project_code);
  const nextNumber = await nextProjectNumber();
  return {
    proposalId: proposalCode,
    status: text(proposal.status) || "Draft",
    alreadyConvertedProjectId: alreadyConverted,
    nextProjectId: alreadyConverted || projectCodeFor(nextNumber),
    initialLifecyclePhase: lifecycle.phase,
    netAmount: numberOf(proposal.net_amount),
    discount: numberOf(proposal.discount),
    designDeliverables: plan.design.map((row) => row.title),
    approvalRequirements: plan.approvals.map((row) => row.approvalType),
    workflowTasks: plan.tasks.map((row) => row.title),
    supervisionRequired: plan.supervisionRequired,
  };
}

export async function GET(request: NextRequest) {
  try {
    await conversionUser(request);
    const proposalId = text(request.nextUrl.searchParams.get("proposalId"), 200);
    if (!proposalId) throw new Error("Proposal ID is required.");
    return json({ success: true, data: await preview(proposalId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not preview proposal conversion.";
    const status = /session/i.test(message) ? 401 : /permission/i.test(message) ? 403 : /not found/i.test(message) ? 404 : 400;
    return json({ success: false, error: message }, status);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ success: false, error: "Invalid request origin." }, 403);
  let user: Row | null = null;
  let proposalId = "";
  try {
    user = await conversionUser(request);
    const input = await request.json() as Row;
    proposalId = text(input.proposalId || input.Proposal_ID, 200);
    if (!proposalId) throw new Error("Proposal ID is required.");

    const { proposal, items, prospect } = await proposalData(proposalId);
    const existingConverted = text(proposal.converted_project_code);
    if (existingConverted) {
      const project = await selectRows("projects", { filters: { project_code: existingConverted }, limit: 1 });
      if (project.length) return json({ success: true, data: { projectId: existingConverted, alreadyConverted: true } });
    }
    if (text(proposal.status).toLowerCase() !== "accepted") throw new Error("Only an Accepted proposal can be converted to a project.");

    const actor = userIdOf(user) || text(user.employeeId || user.Employee_ID || user.username || user.Username, 200);
    const now = new Date().toISOString();
    const plan = buildPlan(items);
    const lifecycle = initialLifecycle(plan);
    const billPlan = allocateBills(items, proposal);
    let sequence = await nextProjectNumber();
    let projectCode = "";
    let project: Row | null = null;

    for (let attempt = 0; attempt < 25; attempt += 1, sequence += 1) {
      const candidate = projectCodeFor(sequence);
      const rawPlot = text(proposal.plot_area);
      const rawFloors = text(proposal.floors);
      const plot = rawPlot ? numberOf(rawPlot) : null;
      const floors = rawFloors ? Math.trunc(numberOf(rawFloors)) : null;
      const row = {
        project_code: candidate,
        project_name: text(proposal.project_title) || text(proposal.client_name) || candidate,
        client_name_snapshot: text(proposal.client_name) || null,
        phone_number_snapshot: text(proposal.phone) || null,
        client_email_snapshot: text(proposal.email) || null,
        client_address_snapshot: text(proposal.address) || null,
        referred_by: text(proposal.referred_by || prospect?.referred_by) || null,
        ref_contact: text(proposal.ref_contact || prospect?.ref_contact) || null,
        project_type: text(proposal.project_type) || null,
        location: text(proposal.project_location) || null,
        location_tag: text(proposal.location_tag) || null,
        plot_area: plot !== null && plot >= 0 ? plot : null,
        floors: floors !== null && floors >= 0 ? floors : null,
        project_area_text: rawPlot || null,
        number_of_stories_text: rawFloors || null,
        start_date: text(proposal.start_date) || now.slice(0, 10),
        design_bill: 0,
        status: "Running",
        notes: `Converted automatically from proposal ${proposalId}${text(proposal.notes) ? `\n${text(proposal.notes)}` : ""}`,
        public_display: false,
        record_type: "project",
        reclassified_proposal_code: proposalId,
        lifecycle_phase: lifecycle.phase,
        lifecycle_changed_at: now,
        lifecycle_changed_by: actor || null,
        design_stage_status: lifecycle.designStatus,
        approval_stage_status: lifecycle.approvalStatus,
        supervision_stage_status: lifecycle.supervisionStatus,
        project_management_enabled: false,
        site_latitude: proposal.site_latitude ?? null,
        site_longitude: proposal.site_longitude ?? null,
        site_location_accuracy_m: proposal.site_location_accuracy_m ?? null,
        site_location_captured_at: proposal.site_location_captured_at || null,
        site_notes: text(proposal.site_notes) || null,
        site_geofence_radius_m: proposal.site_geofence_radius_m ?? 100,
        division: text(proposal.division) || null,
        district: text(proposal.district) || null,
        upazila_thana: text(proposal.upazila_thana) || null,
        local_body_type: text(proposal.local_body_type) || null,
        local_body_name: text(proposal.local_body_name) || null,
        ward_no: text(proposal.ward_no) || null,
        village_area: text(proposal.village_area) || null,
        road_holding: text(proposal.road_holding) || null,
        mouza: text(proposal.mouza) || null,
        jl_no: text(proposal.jl_no) || null,
        dag_no: text(proposal.dag_no) || null,
        khatian_no: text(proposal.khatian_no) || null,
        source_lead_id: proposal.source_lead_id || null,
        source_lead_code: text(proposal.source_lead_code) || null,
        created_at: now,
        updated_at: now,
      };
      try {
        const inserted = await insertRows("projects", row);
        project = inserted[0] || row;
        projectCode = candidate;
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
        if (!/duplicate|unique|project_code/.test(message)) throw error;
      }
    }
    if (!project || !projectCode || !project.id) throw new Error("Could not reserve the next LAND VIEW File ID.");

    if (billPlan.length) {
      await insertRows("bills", billPlan.map((entry) => ({
        bill_code: code("BILL", projectCode),
        project_id: project!.id,
        bill_date: now.slice(0, 10),
        billing_category: entry.category,
        category: entry.category,
        description: entry.description,
        amount: entry.amount,
        discount: entry.discount,
        net_amount: entry.netAmount,
        status: "Open",
        notes: `Created automatically from accepted proposal ${proposalId}`,
        created_via: "Proposal Auto Conversion",
        source_created_by: text(entry.item.created_by) || actor || null,
        source_created_at: text(entry.item.created_at) || now,
        source_updated_at: now,
        legacy_source_id: text(entry.item.item_code) || null,
        idempotency_key: text(entry.item.item_code) || code("PBI", projectCode),
        unit_price: numberOf(entry.item.rate),
        quantity: numberOf(entry.item.quantity) || 1,
        created_at: now,
        updated_at: now,
      })));
    }

    if (plan.design.length) {
      await insertRows("drawing_submissions", plan.design.map((entry) => ({
        drawing_code: code("DRW", projectCode),
        project_code: projectCode,
        drawing_title: entry.title,
        discipline: entry.discipline,
        revision: "R0",
        assigned_employee_code: text(proposal.assigned_to) || null,
        drive_url: null,
        status: "Planned",
        submitted_at: null,
        approved_at: null,
        approved_by: null,
        comments: `Created from proposal service ${text(entry.item.service) || entry.title}.`,
        created_at: now,
        created_by: actor || null,
      })));
    }

    if (plan.approvals.length) {
      await insertRows("approvals", plan.approvals.map((entry) => ({
        approval_code: code("APR", projectCode),
        project_id: project!.id,
        approval_type: entry.approvalType,
        requested_from: entry.requestedFrom,
        status: "Planned",
        approval_status: "Planned",
        decision_notes: `Created from proposal service ${text(entry.item.service) || entry.approvalType}.`,
        requested_at: null,
        source_created_at: now,
        source_created_by: actor || null,
        created_at: now,
        updated_at: now,
      })));
    }

    if (plan.tasks.length) {
      await insertRows("tasks", plan.tasks.map((entry) => ({
        task_code: code("TASK", projectCode),
        project_id: project!.id,
        task_title: entry.title,
        description: entry.description,
        priority: "Normal",
        status: "Pending",
        start_date: now.slice(0, 10),
        due_date: null,
        progress: 0,
        project_name_snapshot: text(project!.project_name) || projectCode,
        source_created_at: now,
        source_created_by: actor || null,
        source_updated_at: now,
        created_at: now,
        updated_at: now,
        automation_generated: true,
        automation_source: "Proposal Conversion",
        automation_key: text(entry.item.item_code) || code("AUTO", projectCode),
      })));
    }

    await insertRows("project_lifecycle_transitions", {
      project_id: project.id,
      project_code: projectCode,
      from_phase: "Project Registered",
      to_phase: lifecycle.phase,
      transition_type: "registration",
      reason: `Project registered from accepted proposal ${proposalId}.`,
      changed_by: actor || null,
      changed_by_role: roleOf(user) || null,
      source: "proposal-auto-conversion",
      created_at: now,
    });

    await updateRows("proposals", { proposal_code: proposalId }, {
      status: "Converted",
      converted_project_code: projectCode,
      lifecycle_phase: "Project Registered",
      lifecycle_changed_at: now,
      lifecycle_changed_by: actor || null,
      updated_at: now,
    });
    if (text(proposal.prospect_code)) {
      await updateRows("prospective_clients", { prospect_code: proposal.prospect_code }, { status: "Converted", updated_at: now });
    }

    const prior = await selectRows("proposal_activity", { filters: { proposal_code: proposalId, action: "Converted to Project", reference: projectCode }, limit: 1 });
    if (!prior.length) {
      await insertRows("proposal_activity", {
        activity_code: code("PA"),
        proposal_code: proposalId,
        prospect_code: text(proposal.prospect_code) || null,
        action: "Converted to Project",
        from_status: "Accepted",
        to_status: "Converted",
        performed_by: text(user.name || user.Name) || actor || null,
        performed_at: now,
        details: `Automatically created ${projectCode}: ${plan.design.length} design deliverable(s), ${plan.approvals.length} approval requirement(s), ${plan.tasks.length} workflow task(s), and ${billPlan.length} billing line(s).`,
        user_key: actor || null,
        role: roleOf(user) || null,
        reference: projectCode,
      });
    }

    const billedNet = Math.round(billPlan.reduce((sum, row) => sum + row.netAmount, 0) * 100) / 100;
    await recordAuditEvent({
      user,
      request,
      action: "proposal_auto_conversion",
      entityType: "project",
      entityId: projectCode,
      after: {
        proposalId,
        projectId: projectCode,
        lifecyclePhase: lifecycle.phase,
        designDeliverables: plan.design.length,
        approvalRequirements: plan.approvals.length,
        workflowTasks: plan.tasks.length,
        billedNet,
      },
      source: "proposal-auto-conversion",
    });

    return json({ success: true, data: {
      projectId: projectCode,
      proposalId,
      lifecyclePhase: lifecycle.phase,
      designDeliverables: plan.design.length,
      approvalRequirements: plan.approvals.length,
      workflowTasks: plan.tasks.length,
      billingLines: billPlan.length,
      billedNet,
      supervisionRequired: plan.supervisionRequired,
    } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not convert proposal.";
    if (user) {
      await recordAuditEvent({
        user,
        request,
        action: "proposal_auto_conversion",
        entityType: "proposal",
        entityId: proposalId,
        outcome: "failure",
        details: { error: message },
        source: "proposal-auto-conversion",
      });
    }
    const status = /session/i.test(message) ? 401 : /permission/i.test(message) ? 403 : /not found/i.test(message) ? 404 : 400;
    return json({ success: false, error: message }, status);
  }
}
