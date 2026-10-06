import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession } from "@/lib/local-session";
import { roleOf, selectRows, updateRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MANAGE_ROLES = new Set(["admin", "manager"]);
const ENGINEERING = new Set([
  "Architectural Design", "Structural Design", "3D Design - Exterior", "3D Design - Interior",
  "Electrical Design", "Fire Safety Design", "Plumbing Design", "Plan Approval Design", "Estimate & Costing", "Design Books",
]);

function text(value: unknown, max = 1200) {
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

function proposalItems(raw: unknown) {
  const services = Array.isArray(raw) ? raw.map((item) => text(item, 100)).filter(Boolean) : [];
  const selected = services.length ? services : ["Custom Service"];
  return selected.map((service, index) => ({
    Service: service,
    Description: service === "Custom Service" ? "Confirm final service scope with the prospective client before issuing proposal." : "",
    Quantity: 1,
    Unit: "Job",
    Rate: 0,
    Amount: 0,
    Category: ENGINEERING.has(service) ? "Engineering" : service === "Site Supervision" ? "Supervision" : "Others",
    Sort_Order: index + 1,
  }));
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
    if (lead.converted_proposal_code) {
      return NextResponse.json({ success: true, data: { proposalId: lead.converted_proposal_code, existing: true } });
    }

    const items = proposalItems(lead.services);
    const notes = [
      lead.lead_code ? `Website enquiry: ${lead.lead_code}` : "Website enquiry",
      lead.message ? `Client notes: ${text(lead.message, 1800)}` : "",
      lead.next_action ? `CRM next action: ${text(lead.next_action, 500)}` : "",
    ].filter(Boolean).join("\n");
    const record = {
      Client_Name: text(lead.name, 120),
      Phone: text(lead.phone, 40),
      Email: text(lead.email, 180),
      Address: text(lead.project_location, 300),
      Source: lead.lead_code ? `Website Enquiry · ${lead.lead_code}` : "Website Enquiry",
      Referred_By: "",
      Ref_Contact: "",
      Project_Title: lead.project_type ? `Proposed ${text(lead.project_type, 100)} Project` : "Proposed Project",
      Project_Location: text(lead.project_location, 300),
      Project_Type: text(lead.project_type, 100) || "Residential",
      Plot_Area: "",
      Floors: text(lead.proposed_floors, 80),
      Gross_Amount: 0,
      Discount: 0,
      Net_Amount: 0,
      Validity_Days: 30,
      Status: "Draft",
      Assigned_To: text(lead.assigned_to, 140),
      Notes: notes,
      items,
    };

    const innerResponse = await fetch(new URL("/api/landview", request.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: request.headers.get("cookie") || "",
        origin: request.nextUrl.origin,
      },
      cache: "no-store",
      body: JSON.stringify({ action: "createErpRecord", module: "proposalsV2", id: "", op: "save", record, items }),
    });
    const json = await innerResponse.json().catch(() => null);
    if (!innerResponse.ok || !json?.success) {
      throw new Error(String(json?.error || json?.message || "Could not create proposal from this lead."));
    }

    const proposalId = text(json?.data?.proposal?.Proposal_ID || json?.data?.Proposal_ID || json?.data?.proposal_id, 80).toUpperCase();
    if (!proposalId) throw new Error("Proposal was created but its ID was not returned.");

    const nextStatus = ["New", "Contacted"].includes(text(lead.status, 40)) ? "Qualified" : text(lead.status, 40) || "Qualified";
    await updateRows("website_leads", { id }, {
      converted_proposal_code: proposalId,
      status: nextStatus,
      contacted_at: lead.contacted_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      next_action: "Review pricing and issue the draft proposal.",
    });

    return NextResponse.json({ success: true, data: { proposalId, existing: false } }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not convert lead to proposal." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
