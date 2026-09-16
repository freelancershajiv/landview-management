import { selectRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN_HASH = "70e0b004b47b742c761fde95a1b3ea8bc1716d0a82e4751c6e016a019e8b6996";
const TABLES = new Set([
  "clients","employees","projects","project_employees","invoices","payments","site_visits","documents",
  "bills","accounts","transfers","transactions","expenses","tasks","attendance","leave_requests","approvals"
]);

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";
  if ((await sha256(token)) !== TOKEN_HASH) {
    return Response.json({ success: false, error: "Not found" }, { status: 404 });
  }
  const table = (url.searchParams.get("table") || "").trim();
  if (!TABLES.has(table)) {
    return Response.json({ success: false, error: "Invalid table" }, { status: 400 });
  }
  try {
    const rows = await selectRows(table, { limit: 5000 });
    return new Response(JSON.stringify({ success: true, table, rows }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store, max-age=0" },
    });
  } catch (error) {
    return Response.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
