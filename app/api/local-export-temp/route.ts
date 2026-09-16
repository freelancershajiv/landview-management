import { selectRows } from "@/lib/supabase-data";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN_HASH = "70e0b004b47b742c761fde95a1b3ea8bc1716d0a82e4751c6e016a019e8b6996";
const TABLES = [
  "clients","employees","projects","project_employees","invoices","payments","site_visits","documents",
  "bills","accounts","transfers","transactions","expenses","tasks","attendance","leave_requests","approvals"
] as const;
const TABLE_SET = new Set<string>(TABLES);
const DEFAULT_PART_SIZE = 12000;

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function buildSnapshot() {
  const entries = await Promise.all(TABLES.map(async (table) => [table, await selectRows(table, { limit: 5000 })] as const));
  const snapshot = Object.fromEntries(entries);
  const raw = JSON.stringify({ source: "LAND VIEW Production", tables: snapshot });
  const zipped = gzipSync(Buffer.from(raw, "utf8"), { level: 9 });
  const b64 = zipped.toString("base64");
  const hash = createHash("sha256").update(zipped).digest("hex");
  return { b64, hash, rawBytes: Buffer.byteLength(raw), gzipBytes: zipped.length };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";
  if ((await sha256(token)) !== TOKEN_HASH) return Response.json({ success: false, error: "Not found" }, { status: 404 });
  try {
    if (url.searchParams.get("mode") === "snapshot") {
      const { b64, hash, rawBytes, gzipBytes } = await buildSnapshot();
      const requestedSize = Number(url.searchParams.get("size") || DEFAULT_PART_SIZE);
      const partSize = Number.isInteger(requestedSize) && requestedSize >= 4000 && requestedSize <= 48000 ? requestedSize : DEFAULT_PART_SIZE;
      const totalParts = Math.ceil(b64.length / partSize);
      const requested = Number(url.searchParams.get("part") || "-1");
      if (Number.isInteger(requested) && requested >= 0) {
        if (requested >= totalParts) return Response.json({ success: false, error: "Part out of range", totalParts }, { status: 416 });
        return new Response(b64.slice(requested * partSize, (requested + 1) * partSize), {
          status: 200,
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "no-store, max-age=0",
            "x-snapshot-hash": hash,
            "x-total-parts": String(totalParts),
            "x-part-size": String(partSize),
            "x-raw-bytes": String(rawBytes),
            "x-gzip-bytes": String(gzipBytes),
            "x-part": String(requested),
          },
        });
      }
      return Response.json({ success: true, mode: "snapshot", hash, rawBytes, gzipBytes, partSize, totalParts }, { headers: { "cache-control": "no-store" } });
    }

    const table = (url.searchParams.get("table") || "").trim();
    if (!TABLE_SET.has(table)) return Response.json({ success: false, error: "Invalid table" }, { status: 400 });
    const rows = await selectRows(table, { limit: 5000 });
    return new Response(JSON.stringify({ success: true, table, rows }), { status: 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store, max-age=0" } });
  } catch (error) {
    return Response.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
