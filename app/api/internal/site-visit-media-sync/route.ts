import { timingSafeEqual } from "node:crypto";
import { getVercelOidcToken } from "@vercel/oidc";
import { NextRequest, NextResponse } from "next/server";
import { selectRows, updateRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MEDIA_URL = "https://jupzgjlizxivhbmuigua.supabase.co/functions/v1/landview-site-visit-media";
const OIDC_AUDIENCE = "https://supabase.landview.internal";
const MAX_MEDIA_PER_RUN = 6;
const MAX_BYTES = 4 * 1024 * 1024;

type Row = Record<string, any>;
type MediaKind = "visit" | "problem";

function text(value: unknown, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function authorized(request: NextRequest) {
  const expected = String(process.env.SITE_VISIT_MEDIA_SYNC_TOKEN || "").trim();
  const supplied = String(request.headers.get("x-landview-media-sync-token") || "").trim();
  return Boolean(expected && supplied && secureEqual(expected, supplied));
}

async function mediaService(action: "sign" | "delete", path: string) {
  const oidc = await getVercelOidcToken({ audience: OIDC_AUDIENCE });
  if (!oidc) throw new Error("Vercel OIDC token is unavailable.");
  const response = await fetch(MEDIA_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${oidc}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ action, path, expiresIn: 300 }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const json = await response.json().catch(() => null) as any;
  if (!response.ok || !json?.success) {
    throw new Error(text(json?.error || `Supabase media service returned HTTP ${response.status}.`, 500));
  }
  return json.data as any;
}

function fileName(kind: MediaKind, path: string, mime: string) {
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const fromPath = path.split("/").pop()?.replace(/[^A-Za-z0-9._-]/g, "-");
  return fromPath || `${kind}-photo.${ext}`;
}

async function uploadToDrive(input: {
  row: Row;
  project: Row;
  kind: MediaKind;
  path: string;
}) {
  const signed = await mediaService("sign", input.path);
  const imageResponse = await fetch(String(signed?.url || ""), {
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!imageResponse.ok) throw new Error(`Could not read temporary Supabase photo (${imageResponse.status}).`);

  const bytes = Buffer.from(await imageResponse.arrayBuffer());
  if (!bytes.length) throw new Error("Temporary Supabase photo is empty.");
  if (bytes.length > MAX_BYTES) throw new Error("Temporary Supabase photo exceeds the 4 MB Site Visit limit.");

  const mime = String(imageResponse.headers.get("content-type") || "image/jpeg").split(";")[0].trim().toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) throw new Error(`Unsupported Site Visit media type: ${mime || "unknown"}.`);

  const url = String(process.env.LAND_VIEW_API_URL || "").trim();
  const secret = String(process.env.LAND_VIEW_PROXY_SECRET || "").trim();
  if (!url || !secret) throw new Error("Google Drive backend is not configured.");

  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "uploadSiteVisitMedia",
      proxySecret: secret,
      projectId: String(input.project.project_code || ""),
      projectName: String(input.project.project_name || input.project.client_name_snapshot || input.project.project_code || "LAND VIEW Project"),
      visitId: String(input.row.visit_code || input.row.id || "site-visit"),
      kind: input.kind,
      fileName: fileName(input.kind, input.path, mime),
      mimeType: mime,
      base64: bytes.toString("base64"),
      locationLatitude: input.row.location_latitude ?? null,
      locationLongitude: input.row.location_longitude ?? null,
      locationAccuracyM: input.row.location_accuracy_m ?? null,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const json = await response.json().catch(() => null) as any;
  if (!response.ok || !json?.success) {
    throw new Error(text(json?.error || `Google Drive backend returned HTTP ${response.status}.`, 700));
  }
  const drive = json.data || {};
  if (!text(drive.fileId, 300)) throw new Error("Google Drive upload completed without a file ID.");
  return drive;
}

async function processMedia(row: Row, project: Row, kind: MediaKind) {
  const isVisit = kind === "visit";
  const pathKey = isVisit ? "visit_photo_path" : "problem_photo_path";
  const fileIdKey = isVisit ? "visit_photo_drive_file_id" : "problem_photo_drive_file_id";
  const urlKey = isVisit ? "visit_photo_drive_url" : "problem_photo_drive_url";
  const path = text(row[pathKey], 1200);
  if (!path) return { status: "skipped" as const };

  let driveId = text(row[fileIdKey], 300);
  if (!driveId) {
    const drive = await uploadToDrive({ row, project, kind, path });
    driveId = text(drive.fileId, 300);
    await updateRows("site_visits", { id: row.id }, {
      [fileIdKey]: driveId,
      [urlKey]: text(drive.fileUrl, 2000) || null,
      updated_at: new Date().toISOString(),
    });
  }

  await mediaService("delete", path);
  await updateRows("site_visits", { id: row.id }, {
    [pathKey]: null,
    updated_at: new Date().toISOString(),
  });

  return { status: "moved" as const, driveId };
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const summary = {
    scannedVisits: 0,
    attemptedMedia: 0,
    moved: 0,
    failed: 0,
    failures: [] as Array<{ visitId: string; kind: MediaKind; error: string }>,
  };

  try {
    const visits = await selectRows("site_visits", { order: "created_at:asc", limit: 5000 });
    const pendingRows = visits.filter((row) => text(row.visit_photo_path) || text(row.problem_photo_path));
    summary.scannedVisits = pendingRows.length;

    const projectIds = Array.from(new Set(pendingRows.map((row) => text(row.project_id, 100)).filter(Boolean)));
    const projects = projectIds.length
      ? await selectRows("projects", { inFilters: { id: projectIds }, limit: Math.min(5000, projectIds.length) })
      : [];
    const projectMap = new Map(projects.map((row) => [String(row.id), row]));

    outer:
    for (const row of pendingRows) {
      const project = projectMap.get(String(row.project_id));
      if (!project) continue;

      for (const kind of ["visit", "problem"] as const) {
        const path = kind === "visit" ? text(row.visit_photo_path) : text(row.problem_photo_path);
        if (!path) continue;
        if (summary.attemptedMedia >= MAX_MEDIA_PER_RUN) break outer;
        summary.attemptedMedia += 1;

        try {
          const result = await processMedia(row, project, kind);
          if (result.status === "moved") summary.moved += 1;
        } catch (error: any) {
          summary.failed += 1;
          summary.failures.push({
            visitId: text(row.visit_code || row.id, 160),
            kind,
            error: text(error?.message || "Media sync failed.", 500),
          });
        }
      }
    }

    return NextResponse.json({ success: true, data: summary }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: text(error?.message || "Site Visit media sync failed.", 700), data: summary },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
