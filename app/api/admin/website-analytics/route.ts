import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { selectRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;

function text(value: unknown) { return String(value ?? "").trim(); }
function percent(part: number, total: number) { return total > 0 ? Number(((part / total) * 100).toFixed(1)) : null; }
function dhakaDay(value: Date | string | number) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
function servicesOf(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => text(item)).filter(Boolean);
  const raw = text(value);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((item) => text(item)).filter(Boolean);
  } catch {}
  return raw.split(/[,|]/g).map((item) => item.trim()).filter(Boolean);
}

function visitorLegacy(row: Row) {
  return {
    Visitor_ID: row.visitor_id, First_Seen: row.first_seen, Last_Seen: row.last_seen, First_Referrer: row.first_referrer || "", Last_IP: row.last_ip || "",
    Country: row.country || "", Region: row.region || "", City: row.city || "", IP_Latitude: row.ip_latitude ?? "", IP_Longitude: row.ip_longitude ?? "",
    Timezone: row.timezone || "", Continent: row.continent || "", User_Agent: row.user_agent || "", Device_Name: row.device_name || "", Platform: row.platform || "",
    Language: row.language || "", Screen_Width: row.screen_width ?? 0, Screen_Height: row.screen_height ?? 0, Is_Bot: Boolean(row.is_bot),
    Total_Sessions: row.total_sessions ?? 0, Total_Page_Views: row.total_page_views ?? 0, Precise_Latitude: row.precise_latitude ?? "", Precise_Longitude: row.precise_longitude ?? "",
    Precise_Accuracy_M: row.precise_accuracy_m ?? "", Precise_Location_Updated_At: row.precise_location_updated_at || "",
  };
}

function pageViewLegacy(row: Row, visitor?: Row) {
  return {
    Event_ID: row.event_id, Visitor_ID: row.visitor_id, Session_ID: row.session_id, Visited_At: row.visited_at, Page: row.page || "/", Title: row.title || "", Referrer: row.referrer || "",
    IP: row.ip || "", Country: row.country || "", Region: row.region || "", City: row.city || "", IP_Latitude: row.ip_latitude ?? "", IP_Longitude: row.ip_longitude ?? "",
    Timezone: row.timezone || "", Continent: row.continent || "", User_Agent: row.user_agent || "", Device_Name: row.device_name || visitor?.device_name || "", Platform: row.platform || visitor?.platform || "",
    Language: row.language || "", Screen_Width: row.screen_width ?? 0, Screen_Height: row.screen_height ?? 0, Is_Bot: Boolean(row.is_bot), Source_Host: row.source_host || "",
    Precise_Latitude: visitor?.precise_latitude ?? "", Precise_Longitude: visitor?.precise_longitude ?? "", Precise_Accuracy_M: visitor?.precise_accuracy_m ?? "", Precise_Location_Updated_At: visitor?.precise_location_updated_at || "",
  };
}

function locationLegacy(row: Row) {
  return {
    Event_ID: row.event_id, Visitor_ID: row.visitor_id, Session_ID: row.session_id, Recorded_At: row.recorded_at, Page: row.page || "/",
    Latitude: row.latitude, Longitude: row.longitude, Accuracy_M: row.accuracy_m, IP: row.ip || "", IP_Country: row.ip_country || "", IP_Region: row.ip_region || "", IP_City: row.ip_city || "",
    IP_Latitude: row.ip_latitude ?? "", IP_Longitude: row.ip_longitude ?? "", Source_Host: row.source_host || "",
  };
}

function interactionLegacy(row: Row) {
  return {
    Event_ID: row.event_id, Visitor_ID: row.visitor_id, Session_ID: row.session_id, Occurred_At: row.occurred_at, Page: row.page || "/",
    Interaction_Name: row.interaction_name || "", Interaction_Target: row.interaction_target || "", Interaction_Label: row.interaction_label || "",
    Referrer: row.referrer || "", IP: row.ip || "", Country: row.country || "", Region: row.region || "", City: row.city || "",
    Device_Name: row.device_name || "", Platform: row.platform || "", Source_Host: row.source_host || "",
  };
}

async function count(table: string) {
  const rows = await selectRows(table, { limit: 5000 });
  return rows.length;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireLocalSession(request);
    if (!user) return NextResponse.json({ success: false, error: "Session expired." }, { status: 401, headers: { "Cache-Control": "no-store" } });
    if (roleOf(user) !== "admin") return NextResponse.json({ success: false, error: "Admin access is required." }, { status: 403, headers: { "Cache-Control": "no-store" } });

    const [visitorCount, sessionCount, pageViewCount, locationCount, visitors, pageViews, locations, interactions, leads] = await Promise.all([
      count("website_analytics_visitors"), count("website_analytics_sessions"), count("website_analytics_page_views"), count("website_analytics_location_events"),
      selectRows("website_analytics_visitors", { order: "last_seen:desc", limit: 100 }),
      selectRows("website_analytics_page_views", { order: "visited_at:desc", limit: 150 }),
      selectRows("website_analytics_location_events", { order: "recorded_at:desc", limit: 60 }),
      selectRows("website_analytics_interactions", { order: "occurred_at:desc", limit: 5000 }),
      selectRows("website_leads", { order: "created_at:desc", limit: 5000 }),
    ]);

    const visitorById = new Map<string, Row>(visitors.map((row) => [String(row.visitor_id || ""), row]));
    const interactionCounts: Record<string, number> = {};
    const targetCounts: Record<string, number> = {};
    for (const row of interactions) {
      const name = text(row.interaction_name) || "unknown";
      interactionCounts[name] = (interactionCounts[name] || 0) + 1;
      const target = text(row.interaction_target);
      if (target && ["service_click", "project_click", "map_project_select"].includes(name)) targetCounts[target] = (targetCounts[target] || 0) + 1;
    }

    const leadStatuses: Record<string, number> = {};
    const leadSources: Record<string, number> = {};
    const serviceDemand: Record<string, number> = {};
    const projectSources: Record<string, number> = {};
    const today = dhakaDay(new Date());
    const now = Date.now();
    let contactedCount = 0;
    let qualifiedCount = 0;
    let proposalCount = 0;
    let projectCount = 0;
    let openCount = 0;
    let unassignedCount = 0;
    let noFollowUpCount = 0;
    let overdueCount = 0;
    let dueTodayCount = 0;
    let staleCount = 0;

    for (const lead of leads) {
      const status = text(lead.status) || "New";
      leadStatuses[status] = (leadStatuses[status] || 0) + 1;
      const hasProposal = Boolean(text(lead.converted_proposal_code));
      const hasProject = Boolean(text(lead.converted_project_code));
      const contacted = Boolean(lead.contacted_at) || ["Contacted", "Qualified", "Converted"].includes(status) || hasProposal || hasProject;
      const qualified = ["Qualified", "Converted"].includes(status) || hasProposal || hasProject;
      if (contacted) contactedCount += 1;
      if (qualified) qualifiedCount += 1;
      if (hasProposal) proposalCount += 1;
      if (hasProject) projectCount += 1;

      const source = text(lead.utm_source) || text(lead.source_path) || "Direct website";
      leadSources[source] = (leadSources[source] || 0) + 1;
      if (hasProject) projectSources[source] = (projectSources[source] || 0) + 1;
      for (const service of servicesOf(lead.services)) serviceDemand[service] = (serviceDemand[service] || 0) + 1;

      const open = !["Converted", "Closed"].includes(status) && !hasProject;
      if (!open) continue;
      openCount += 1;
      if (!text(lead.assigned_to)) unassignedCount += 1;
      if (!lead.follow_up_at) noFollowUpCount += 1;
      if (lead.created_at) {
        const created = new Date(lead.created_at).getTime();
        if (Number.isFinite(created) && now - created >= 7 * 86400000) staleCount += 1;
      }
      if (lead.follow_up_at) {
        const due = new Date(lead.follow_up_at);
        if (!Number.isNaN(due.getTime())) {
          const dueDay = dhakaDay(due);
          if (dueDay === today) dueTodayCount += 1;
          else if (due.getTime() < now) overdueCount += 1;
        }
      }
    }

    const leadCount = leads.length;
    const enquiryOpens = interactionCounts.enquiry_open || 0;
    const convertedStatusCount = leadStatuses.Converted || 0;
    const funnel: Record<string, number> = {
      "Enquiries": leadCount,
      "Contacted": contactedCount,
      "Qualified": qualifiedCount,
      "Proposals": proposalCount,
      "Projects": projectCount,
    };
    const pipelineHealth: Record<string, number> = {
      "Open leads": openCount,
      "Unassigned": unassignedCount,
      "No follow-up": noFollowUpCount,
      "Overdue": overdueCount,
      "Due today": dueTodayCount,
      "Open 7+ days": staleCount,
    };

    const recentLeadConversions = leads
      .filter((lead) => text(lead.converted_project_code) || text(lead.converted_proposal_code))
      .slice(0, 40)
      .map((lead) => ({
        leadCode: text(lead.lead_code),
        name: text(lead.name),
        projectCode: text(lead.converted_project_code),
        proposalCode: text(lead.converted_proposal_code),
        status: text(lead.status) || "New",
        source: text(lead.utm_source) || text(lead.source_path) || "Direct website",
        createdAt: lead.created_at || null,
        updatedAt: lead.updated_at || null,
      }));

    return NextResponse.json({
      success: true,
      data: {
        storage: "Supabase",
        totals: {
          visitors: visitorCount,
          sessions: sessionCount,
          pageViews: pageViewCount,
          preciseLocationEvents: locationCount,
          interactions: interactions.length,
          enquiries: leadCount,
          convertedLeads: convertedStatusCount,
          qualifiedLeads: qualifiedCount,
          proposalsCreated: proposalCount,
          projectsConverted: projectCount,
          openLeads: openCount,
          enquiryOpenToSubmitRate: enquiryOpens > 0 ? percent(leadCount, enquiryOpens) : null,
          enquiryToProposalRate: percent(proposalCount, leadCount),
          enquiryToProjectRate: percent(projectCount, leadCount),
          proposalToProjectRate: percent(projectCount, proposalCount),
        },
        conversions: {
          interactionCounts,
          targetCounts,
          leadStatuses,
          leadSources,
          serviceDemand,
          projectSources,
          funnel,
          pipelineHealth,
          whatsappClicks: interactionCounts.whatsapp_click || 0,
          callClicks: interactionCounts.call_click || 0,
          enquiryOpens,
          mapOpens: interactionCounts.map_open || 0,
          serviceClicks: interactionCounts.service_click || 0,
          projectClicks: interactionCounts.project_click || 0,
          mapProjectSelections: interactionCounts.map_project_select || 0,
        },
        recentLeadConversions,
        recentVisitors: visitors.map(visitorLegacy),
        recentPageViews: pageViews.map((row) => pageViewLegacy(row, visitorById.get(String(row.visitor_id || "")))),
        recentLocations: locations.map(locationLegacy),
        recentInteractions: interactions.slice(0, 200).map(interactionLegacy),
      },
    }, { headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load visitor analytics.";
    return NextResponse.json({ success: false, error: message }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
