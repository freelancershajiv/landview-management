import { timingSafeEqual } from "node:crypto";
import { getVercelOidcToken } from "@vercel/oidc";
import { NextRequest, NextResponse } from "next/server";
import {
  claimMediaJob,
  completeMediaJob,
  failMediaJob,
  markMediaJobUploaded,
  releaseMediaJob,
} from "@/lib/site-visit-media-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MEDIA_URL = "https://jupzgjlizxivhbmuigua.supabase.co/functions/v1/landview-site-visit-media";
const OIDC_AUDIENCE = "https://supabase.landview.internal";
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
  const expected = text(process.env.SITE_VISIT_MEDIA_SYNC_TOKEN, 1000);
  const supplied = text(request.headers.get("x-landview-media-sync-token"), 1000);
  return Boolean(expected && supplied && secureEqual(expected, supplied));
}

async function mediaService(action: "sign" | "delete", path: string) {
  const oidc = await getVercelOidcToken({ audience: OIDC_AUDIENCE });
  if (!oidc) throw new Error("Vercel OIDC token is unavailable.");
  const response = await fetch(MEDIA_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${oidc}`, "content-type": "application/json" },
    body: JSON.stringify({ action, path, expiresIn: 300 }),
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  const json = await response.json().catch(() => null) as any;
  if (!response.ok || !json?.success) {
    throw new Error(text(json?.error || `Supabase media service returned HTTP ${response.status}.`, 700));
  }
  return json.data as any;
}

function fileName(kind: MediaKind, path: string, mime: string) {
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const fromPath = path.split("/").pop()?.replace(/[^A-Za-z0-9._-]/g, "-");
  return fromPath || `${kind}-photo.${ext}`;
}

async function uploadToDrive(job: Row) {
  const path = text(job.source_path, 1200);
  const kind = text(job.media_kind, 20) as MediaKind;
  if (!path || !["visit", "problem"].includes(kind)) throw new Error("Media queue job is invalid.");

  const signed = await mediaService("sign", path);
  const imageResponse = await fetch(String(signed?.url || ""), {
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!imageResponse.ok) throw new Error(`Could not read temporary Supabase photo (${imageResponse.status}).`);

  const bytes = Buffer.from(await imageResponse.arrayBuffer());
  if (!bytes.length) throw new Error("Temporary Supabase photo is empty.");
  if (bytes.length > MAX_BYTES) throw new Error("Temporary Supabase photo exceeds the 4 MB Site Visit limit.");

  const mime = String(imageResponse.headers.get("content-type") || "image/jpeg").split(";")[0].trim().toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) throw new Error(`Unsupported Site Visit media type: ${mime || "unknown"}.`);

  const url = text(process.env.LAND_VIEW_API_URL, 1000);
  const secret = text(process.env.LAND_VIEW_PROXY_SECRET, 1000);
  if (!url || !secret) throw new Error("Google Drive backend is not configured.");

  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "uploadSiteVisitMedia",
      proxySecret: secret,
      projectId: text(job.project_code, 120),
      projectName: text(job.project_name || job.client_name_snapshot || job.project_code || "LAND VIEW Project", 300),
      visitId: text(job.visit_code || job.site_visit_id || "site-visit", 180),
      kind,
      fileName: fileName(kind, path, mime),
      mimeType: mime,
      base64: bytes.toString("base64"),
      locationLatitude: job.location_latitude ?? null,
      locationLongitude: job.location_longitude ?? null,
      locationAccuracyM: job.location_accuracy_m ?? null,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const json = await response.json().catch(() => null) as any;
  if (!response.ok || !json?.success) {
    throw new Error(text(json?.error || `Google Drive backend returned HTTP ${response.status}.`, 900));
  }
  const drive = json.data || {};
  if (!text(drive.fileId, 500)) throw new Error("Google Drive upload completed without a file ID.");
  return { fileId: text(drive.fileId, 500), fileUrl: text(drive.fileUrl, 2000) };
}

async function recordFailure(job: Row, lockToken: string, error: unknown) {
  const message = text((error as any)?.message || error || "Media sync failed.", 1800);
  try {
    return await failMediaJob(String(job.job_id), lockToken, message);
  } catch (queueError) {
    console.error("Site Visit media queue could not record failure", queueError);
    return null;
  }
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const lockToken = crypto.randomUUID();
  let job: Row | null = null;
  try {
    job = await claimMediaJob(lockToken);
    if (!job) {
      return NextResponse.json({ success: true, data: { status: "idle", message: "No Site Visit media is ready for sync." } }, { headers: { "Cache-Control": "no-store" } });
    }

    const jobId = String(job.job_id || "");
    const sourcePath = text(job.source_path, 1200);
    const existingDriveId = text(job.drive_file_id, 500);
    const existingDriveUrl = text(job.drive_file_url, 2000);

    if (!existingDriveId) {
      try {
        const drive = await uploadToDrive(job);
        await markMediaJobUploaded(jobId, lockToken, drive.fileId, drive.fileUrl);
        await releaseMediaJob(jobId, lockToken);
        return NextResponse.json({
          success: true,
          data: {
            status: "uploaded",
            phase: "drive-upload",
            jobId,
            visitId: text(job.visit_code || job.site_visit_id, 180),
            kind: text(job.media_kind, 20),
            message: "Photo uploaded to Google Drive. Temporary storage cleanup is queued for the next worker run.",
          },
        }, { headers: { "Cache-Control": "no-store" } });
      } catch (error) {
        const retry = await recordFailure(job, lockToken, error);
        return NextResponse.json({
          success: true,
          data: {
            status: "retry-scheduled",
            phase: "drive-upload",
            jobId,
            error: text((error as any)?.message || error, 1000),
            retry,
          },
        }, { headers: { "Cache-Control": "no-store" } });
      }
    }

    try {
      await mediaService("delete", sourcePath);
      await completeMediaJob(jobId, lockToken, existingDriveId, existingDriveUrl);
      return NextResponse.json({
        success: true,
        data: {
          status: "completed",
          phase: "cleanup",
          jobId,
          visitId: text(job.visit_code || job.site_visit_id, 180),
          kind: text(job.media_kind, 20),
          driveFileId: existingDriveId,
        },
      }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      const retry = await recordFailure(job, lockToken, error);
      return NextResponse.json({
        success: true,
        data: {
          status: "retry-scheduled",
          phase: "cleanup",
          jobId,
          error: text((error as any)?.message || error, 1000),
          retry,
        },
      }, { headers: { "Cache-Control": "no-store" } });
    }
  } catch (error: any) {
    if (job?.job_id) await recordFailure(job, lockToken, error);
    return NextResponse.json(
      { success: false, error: text(error?.message || "Site Visit media queue worker failed.", 900) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
