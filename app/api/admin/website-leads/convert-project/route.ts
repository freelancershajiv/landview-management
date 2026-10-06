import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession } from "@/lib/local-session";
import { roleOf, selectRows, updateRows } from "@/lib/supabase-data";

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

    if (lead.converted_project_code) {
      return NextResponse.json({ success: true, data: { projectId: text(lead.converted_project_code, 40), existing: true } });
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
        await updateRows("website_leads", { id }, {
          converted_project_code: projectId,
          status: "Converted",
          follow_up_at: null,
          next_action: `Project ${projectId} already exists. Continue project setup and delivery workflow.`,
          updated_at: new Date().toISOString(),
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
        Project_Type: projectType,
        Location: projectLocation,
        Project_Area: text(proposal?.plot_area, 120),
        Number_of_Stories: floors,
        Start_Date: dhakaDate(),
        Design_Stage_Status: "In Progress",
        Approval_Stage_Status: "Pending",
        Supervision_Stage_Status: "Completed",
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
    await updateRows("website_leads", { id }, {
      converted_project_code: projectId,
      status: "Converted",
      contacted_at: lead.contacted_at || now,
      follow_up_at: null,
      next_action: `Project ${projectId} created. Complete project setup, structured address and service workflow.`,
      updated_at: now,
    });

    if (proposalCode && proposal) {
      await updateRows("proposals", { proposal_code: proposalCode }, {
        converted_project_code: projectId,
        status: "Converted",
        updated_at: now,
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
