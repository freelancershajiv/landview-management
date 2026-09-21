import { NextResponse } from "next/server";
import { requirePortalSession } from "@/lib/server-auth";
import { selectRows, supabaseGateway } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;

function visitorLegacy(row: Row) {
  return {
    Visitor_ID: row.visitor_id,
    First_Seen: row.first_seen,
    Last_Seen: row.last_seen,
    First_Referrer: row.first_referrer || "",
    Last_IP: row.last_ip || "",
    Country: row.country || "",
    Region: row.region || "",
    City: row.city || "",
    IP_Latitude: row.ip_latitude ?? "",
    IP_Longitude: row.ip_longitude ?? "",
    Timezone: row.timezone || "",
    Continent: row.continent || "",
    User_Agent: row.user_agent || "",
    Language: row.language || "",
    Screen_Width: row.screen_width ?? 0,
    Screen_Height: row.screen_height ?? 0,
    Is_Bot: Boolean(row.is_bot),
    Total_Sessions: row.total_sessions ?? 0,
    Total_Page_Views: row.total_page_views ?? 0,
    Precise_Latitude: row.precise_latitude ?? "",
    Precise_Longitude: row.precise_longitude ?? "",
    Precise_Accuracy_M: row.precise_accuracy_m ?? "",
    Precise_Location_Updated_At: row.precise_location_updated_at || "",
  };
}

function pageViewLegacy(row: Row) {
  return {
    Event_ID: row.event_id,
    Visitor_ID: row.visitor_id,
    Session_ID: row.session_id,
    Visited_At: row.visited_at,
    Page: row.page || "/",
    Title: row.title || "",
    Referrer: row.referrer || "",
    IP: row.ip || "",
    Country: row.country || "",
    Region: row.region || "",
    City: row.city || "",
    IP_Latitude: row.ip_latitude ?? "",
    IP_Longitude: row.ip_longitude ?? "",
    Timezone: row.timezone || "",
    Continent: row.continent || "",
    User_Agent: row.user_agent || "",
    Language: row.language || "",
    Screen_Width: row.screen_width ?? 0,
    Screen_Height: row.screen_height ?? 0,
    Is_Bot: Boolean(row.is_bot),
    Source_Host: row.source_host || "",
  };
}

function locationLegacy(row: Row) {
  return {
    Event_ID: row.event_id,
    Visitor_ID: row.visitor_id,
    Session_ID: row.session_id,
    Recorded_At: row.recorded_at,
    Page: row.page || "/",
    Latitude: row.latitude,
    Longitude: row.longitude,
    Accuracy_M: row.accuracy_m,
    IP: row.ip || "",
    IP_Country: row.ip_country || "",
    IP_Region: row.ip_region || "",
    IP_City: row.ip_city || "",
    IP_Latitude: row.ip_latitude ?? "",
    IP_Longitude: row.ip_longitude ?? "",
    Source_Host: row.source_host || "",
  };
}

async function count(table: string) {
  const result = await supabaseGateway("countRows", { table, limit: 1 });
  return Number(result?.count || 0);
}

export async function GET() {
  try {
    await requirePortalSession(["admin"]);

    const [visitorCount, sessionCount, pageViewCount, locationCount, visitors, pageViews, locations] = await Promise.all([
      count("website_analytics_visitors"),
      count("website_analytics_sessions"),
      count("website_analytics_page_views"),
      count("website_analytics_location_events"),
      selectRows("website_analytics_visitors", { order: "last_seen:desc", limit: 50 }),
      selectRows("website_analytics_page_views", { order: "visited_at:desc", limit: 100 }),
      selectRows("website_analytics_location_events", { order: "recorded_at:desc", limit: 50 }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        storage: "Supabase",
        totals: {
          visitors: visitorCount,
          sessions: sessionCount,
          pageViews: pageViewCount,
          preciseLocationEvents: locationCount,
        },
        recentVisitors: visitors.map(visitorLegacy),
        recentPageViews: pageViews.map(pageViewLegacy),
        recentLocations: locations.map(locationLegacy),
      },
    }, { headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load visitor analytics.";
    return NextResponse.json({ success: false, error: message }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
