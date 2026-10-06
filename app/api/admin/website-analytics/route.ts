import { NextResponse } from "next/server";
import { requirePortalSession } from "@/lib/server-auth";
import { selectRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;

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

export async function GET() {
  try {
    await requirePortalSession(["admin"]);

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
      const name = String(row.interaction_name || "unknown");
      interactionCounts[name] = (interactionCounts[name] || 0) + 1;
      const target = String(row.interaction_target || "").trim();
      if (target && ["service_click", "project_click", "map_project_select"].includes(name)) targetCounts[target] = (targetCounts[target] || 0) + 1;
    }

    const leadStatuses: Record<string, number> = {};
    for (const lead of leads) {
      const status = String(lead.status || "New");
      leadStatuses[status] = (leadStatuses[status] || 0) + 1;
    }
    const enquiryOpens = interactionCounts.enquiry_open || 0;
    const leadCount = leads.length;
    const convertedCount = leadStatuses.Converted || 0;

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
          convertedLeads: convertedCount,
          enquiryOpenToSubmitRate: enquiryOpens > 0 ? Number(((leadCount / enquiryOpens) * 100).toFixed(1)) : null,
        },
        conversions: {
          interactionCounts,
          targetCounts,
          leadStatuses,
          whatsappClicks: interactionCounts.whatsapp_click || 0,
          callClicks: interactionCounts.call_click || 0,
          enquiryOpens,
          mapOpens: interactionCounts.map_open || 0,
          serviceClicks: interactionCounts.service_click || 0,
          projectClicks: interactionCounts.project_click || 0,
          mapProjectSelections: interactionCounts.map_project_select || 0,
        },
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
