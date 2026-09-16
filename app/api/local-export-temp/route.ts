import { selectRows } from "@/lib/supabase-data";
import { gzipSync } from "node:zlib";
import { constants, createCipheriv, createHash, publicEncrypt, randomBytes } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN_HASH = "8e00e36dc4a9e91c8f11d58de9e0e731d9ad69873c60901cb0df048057a43d31";
const MIGRATION_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAl6mrtz/uOng4+XYc5kKN
GTWvcrKwn/UMclUZpI0Vrx1CbVDOLYzkYfyc54ecYijkmGxT/5SFbSmzLIupKOZN
s1oNSUgnTaBR+49PMrq5IDJQAAauFl4h2nSgYe13020Pgp+kj7r1E4zBtbiztGv3
Ju42nx4Bp9GUdOm7b+aG36RZ+LLbBF9HQH3qTZYuz3Pvi77NOlxRnF8cPolsaj/2
0Dbpqdl9d3I1vgzpurhm9XzGiZghucTiM/o+1DMiWCWmvN8lJPlFMAe3YyjTzaCc
7RWmzwXFC92r0cIEgRFm6DiFb92uWK34wZ3P4SQISLFGkqrdDCfT1adGyKhKwyrw
AbdnUhVEb7dwsIeJ0HS4m1vOO3OKoXRGmuZYU2RC82iiThKq6ZyvZ27V0O/ib22m
dMTW2UHSf9+SUGjVD3dJuK/zutY3CbqIXgXsVJh/X1QZCmg8Oq73lqn2O47M1ZbB
acid2h5CZ2gCt02hyOk4BjKLzldtaaindP5YLOjGCco7AgMBAAE=
-----END PUBLIC KEY-----`;
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
  return { raw, zipped, b64, hash, rawBytes: Buffer.byteLength(raw), gzipBytes: zipped.length };
}

function sealSnapshot(zipped: Buffer) {
  const key = randomBytes(32);
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ciphertext = Buffer.concat([cipher.update(zipped), cipher.final()]);
  const tag = cipher.getAuthTag();
  const wrappedKey = publicEncrypt(
    { key: MIGRATION_PUBLIC_KEY, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    key,
  );
  const magic = Buffer.from("LVSEAL1", "ascii");
  const keyLength = Buffer.alloc(2);
  keyLength.writeUInt16BE(wrappedKey.length, 0);
  return Buffer.concat([magic, keyLength, wrappedKey, nonce, tag, ciphertext]);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    if (url.searchParams.get("mode") === "sealed") {
      const { zipped, hash, rawBytes, gzipBytes } = await buildSnapshot();
      const sealed = sealSnapshot(zipped);
      return new Response(sealed, {
        status: 200,
        headers: {
          "content-type": "application/octet-stream",
          "content-disposition": "attachment; filename=landview-production-snapshot.lvseal",
          "cache-control": "no-store, max-age=0",
          "x-snapshot-hash": hash,
          "x-raw-bytes": String(rawBytes),
          "x-gzip-bytes": String(gzipBytes),
          "x-sealed-bytes": String(sealed.length),
          "x-robots-tag": "noindex, nofollow",
        },
      });
    }

    const token = url.searchParams.get("token") || "";
    if ((await sha256(token)) !== TOKEN_HASH) return Response.json({ success: false, error: "Not found" }, { status: 404 });

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
