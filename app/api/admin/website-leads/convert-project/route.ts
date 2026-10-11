import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, userIdOf } from "@/lib/local-session";
import { insertRows, roleOf, selectRows, updateRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MANAGE_ROLES = new Set(["admin", "manager"]);

function text(value: unknown, max = 1600) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}

async function requireManager(request: NextRequest) {
  const user = await requireLocalSession(request);
  if (!user) return { error: NextResponse.json({ success: false, error: "Session expired." }, { status: 401 }) };
  if (!MANAGE_ROLES.has(roleOf(user))) return { error: NextResponse.json({ success: false, error: "Admin or manager access is required." }, { status: 403 }) };
  return { user };
}

function dhakaDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function generatedProjectName(lead: Record<string, any>, proposal?: Record<string, any>) {
  const proposalTitle = text(proposal?.project_title, 240);
  if (proposalTitle && !/^proposed project$/i.test(proposalTitle)) return proposalTitle;
  const floors = text(proposal?.floors || lead.proposed_floors, 80);
  const type = text(proposal?.project_type || lead.project_type, 120) || "Building";
  const floorLabel = floors ? (/stor/i.test(floors) ? floors : `${floors} Storied`) : "";
  return [floorLabel, type, "Building Design"].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
    const auth = await requireManager(request);
    if (auth.error) return auth.error;

    const body = await request.json() as Record<string, unknown>;
    const id = text(body.id, 80);
    if (!id) return NextResponse.json({ success: false, error: "Lead ID is required." }, { status: 400 });

    const rows = await selectRows("website_leads", { filters: { id }, limit: 1 });
    const lead = rows[0];
    if (!lead) return NextResponse.json({ success: false, error: "Website lead not found." }, { status: 404 });

    const actor = userIdOf(auth.user) || text((auth.user as any)?.employeeId || (auth.user as any)?.Employee_ID || (auth.user as any)?.username || "management", 200);
    const role = roleOf(auth.user);

    if (lead.converted_project_code) {
      const projectId = text(lead.converted_project_code, 40).toUpperCase();
      await updateRows("projects", { project_code: projectId }, {
        source_lead_id: lead.id,
        source_lead_code: lead.lead_code || null,
        updated_at: new Date().toISOString(),
      });
      return NextResponse.json({ success: true, data: { projectId, existing: true } });
    }

    const leadStatus = text(lead.status, 40) || "New";
    if (leadStatus === "Closed") {
      return NextResponse.json({ success: false, error: "Closed enquiries must be reopened before project conversion." }, { status: 409 });
    }
    if (!lead.converted_proposal_code && leadStatus !== "Qualified") {
      return NextResponse.json({ success: false, error: "Qualify this enquiry or create a proposal before converting it into a project." }, { status: 409 });
    }

    let proposal: Record<string, any> | undefined;
    const proposalCode = text(lead.converted_proposal_code, 80).toUpperCase();
    if (proposalCode) {
      const proposalRows = await selectRows("proposals", { filters: { proposal_code: proposalCode }, limit: 1 });
      proposal = proposalRows[0];
      if (proposal?.converted_project_code) {
        const projectId = text(proposal.converted_project_code, 40).toUpperCase();
        const now = new Date().toISOString();
        await updateRows("projects", { project_code: projectId }, {
          source_lead_id: lead.id,
          source_lead_code: lead.lead_code || null,
          reclassified_proposal_code: proposalCode,
          updated_at: now,
        });
        await updateRows("website_leads", { id }, {
          converted_project_code: projectId,
          status: "Converted",
          follow_up_at: null,
          next_action: `Project ${projectId} already exists. Continue project setup and delivery workflow.`,
          updated_at: now,
        });
        return NextResponse.json({ success: true, data: { projectId, existing: true, proposalId: proposalCode } });
      }
    }

    const clientName = text(proposal?.client_name || lead.name, 240) || "Website Client";
    const projectLocation = text(proposal?.project_location || proposal?.address || lead.project_location, 1000);
    const projectType = text(proposal?.project_type || lead.project_type, 160) || "Residential";
    const floors = text(proposal?.floors || lead.proposed_floors, 80);
    const services = Array.isArray(lead.services) ? lead.services.map((item: unknown) => text(item, 120)).filter(Boolean) : [];
    const notes = [
      lead.lead_code ? `Website enquiry: ${text(lead.lead_code, 80)}` : "Website enquiry",
      proposalCode ? `Converted proposal: ${proposalCode}` : "",
      services.length ? `Requested services: ${services.join(", ")}` : "",
      lead.message ? `Client message: ${text(lead.message, 1400)}` : "",
      lead.admin_notes ? `CRM notes: ${text(lead.admin_notes, 1400)}` : "",
    ].filter(Boolean).join("\n");

    const projectResponse = await fetch(new URL("/api/projects/new", request.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: request.headers.get("cookie") || "",
        origin: request.nextUrl.origin,
      },
      cache: "no-store",
      body: JSON.stringify({
        idMode: "automatic",
        Project_Name: generatedProjectName(lead, proposal),
        Client_Name: clientName,
        Phone_Number: text(proposal?.phone || lead.phone, 80),
        Referred_By: text(proposal?.referred_by, 240),
        Ref_Contact: text(proposal?.ref_contact, 120),
        Project_Type: projectType,
        Location: projectLocation,
        Location_Tag: text(proposal?.location_tag, 1000),
        Project_Area: text(proposal?.plot_area, 120),
        Number_of_Stories: floors,
        Start_Date: text(proposal?.start_date, 20) || dhakaDate(),
        Design_Stage_Status: "In Progress",
        Approval_Stage_Status: "Pending",
        Supervision_Stage_Status: "Completed",
        Site_Latitude: proposal?.site_latitude,
        Site_Longitude: proposal?.site_longitude,
        Site_Geofence_Radius_M: proposal?.site_geofence_radius_m || 150,
        Notes: notes,
      }),
    });

    const projectJson = await projectResponse.json().catch(() => null);
    if (!projectResponse.ok || !projectJson?.success) {
      throw new Error(String(projectJson?.error || projectJson?.message || "Could not create project from this enquiry."));
    }

    const projectId = text(projectJson?.data?.Project_ID, 40).toUpperCase();
    if (!projectId) throw new Error("Project was created but its ID was not returned.");

    const now = new Date().toISOString();
    const projectRows = await updateRows("projects", { project_code: projectId }, {
      source_lead_id: lead.id,
      source_lead_code: lead.lead_code || null,
      reclassified_proposal_code: proposalCode || null,
      lifecycle_phase: "Design Stage",
      lifecycle_changed_at: now,
      lifecycle_changed_by: actor || null,
      client_email_snapshot: text(proposal?.email || lead.email, 240) || null,
      client_address_snapshot: text(proposal?.address || lead.project_location, 1000) || null,
      referred_by: text(proposal?.referred_by, 240) || null,
      ref_contact: text(proposal?.ref_contact, 120) || null,
      location_tag: text(proposal?.location_tag, 1000) || null,
      site_visit_date: proposal?.site_visit_date || null,
      site_latitude: proposal?.site_latitude ?? null,
      site_longitude: proposal?.site_longitude ?? null,
      site_location_accuracy_m: proposal?.site_location_accuracy_m ?? null,
      site_location_captured_at: proposal?.site_location_captured_at || null,
      site_geofence_radius_m: proposal?.site_geofence_radius_m || 150,
      division: proposal?.division || null,
      district: proposal?.district || null,
      upazila_thana: proposal?.upazila_thana || null,
      local_body_type: proposal?.local_body_type || null,
      local_body_name: proposal?.local_body_name || null,
      ward_no: proposal?.ward_no || null,
      village_area: proposal?.village_area || null,
      road_holding: proposal?.road_holding || null,
      mouza: proposal?.mouza || null,
      jl_no: proposal?.jl_no || null,
      dag_no: proposal?.dag_no || null,
      khatian_no: proposal?.khatian_no || null,
      site_notes: proposal?.site_notes || null,
      updated_at: now,
    });
    const project = projectRows[0] || projectJson?.data?.project;

    if (project?.id) {
      await insertRows("project_lifecycle_transitions", {
        project_id: project.id,
        project_code: projectId,
        from_phase: null,
        to_phase: "Design Stage",
        transition_type: "registration",
        reason: proposalCode ? `Registered from proposal ${proposalCode}.` : "Registered from qualified website enquiry.",
        changed_by: actor || null,
        changed_by_role: role,
        source: "website-lead-conversion",
        created_at: now,
      });
    }

    await updateRows("website_leads", { id }, {
      converted_project_code: projectId,
      status: "Converted",
      contacted_at: lead.contacted_at || now,
      follow_up_at: null,
      next_action: `Project ${projectId} created. Continue through the Project Lifecycle Center.`,
      updated_at: now,
    });

    if (proposalCode && proposal) {
      await updateRows("proposals", { proposal_code: proposalCode }, {
        source_lead_id: lead.id,
        source_lead_code: lead.lead_code || null,
        converted_project_code: projectId,
        status: "Converted",
        lifecycle_phase: "Project Registered",
        lifecycle_changed_at: now,
        lifecycle_changed_by: actor || null,
        updated_at: now,
      });
      await insertRows("proposal_activity", {
        activity_code: `PA-${crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`,
        proposal_code: proposalCode,
        prospect_code: proposal.prospect_code || null,
        action: "Project Registered",
        from_status: proposal.status || "Draft",
        to_status: "Converted",
        performed_by: actor || "LAND VIEW",
        performed_at: now,
        details: `Registered as ${projectId}; lifecycle moved to Design Stage.`,
        user_key: actor || null,
        role,
        reference: projectId,
      });
    }

    return NextResponse.json({ success: true, data: { projectId, proposalId: proposalCode || null, existing: false } }, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not convert lead to project." }, {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
