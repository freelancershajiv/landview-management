import { NextRequest, NextResponse } from "next/server";
import { GET as legacyGET, POST as legacyPOST } from "@/app/api/site-entry/route";
import { updateRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

function text(value: unknown, max = 4000) {
  return String(value ?? "").trim().slice(0, max);
}

function cleanDate(value: unknown) {
  const raw = text(value, 20);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function positiveRadius(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 150;
  return Math.max(25, Math.min(1000, Math.round(parsed)));
}

export async function GET(request: NextRequest) {
  return legacyGET(request);
}

export async function POST(request: NextRequest) {
  const input = await request.clone().json().catch(() => ({})) as Row;
  const action = text(input.action, 40).toLowerCase();
  const response = await legacyPOST(request);
  if (!response.ok) return response;

  const payload = await response.clone().json().catch(() => null) as any;
  const proposalCode = text(payload?.data?.proposalId, 120);
  if (!payload?.success || !proposalCode) return response;

  const now = new Date().toISOString();
  const actor = text(
    payload?.data?.approvedBy
      || payload?.data?.createdBy
      || payload?.data?.assignedTo
      || "LAND VIEW",
    200,
  );

  let lifecyclePhase = "";
  if (action === "create") {
    lifecyclePhase = String(payload?.data?.approvalStatus || "").toLowerCase() === "approved"
      ? "Proposal Draft"
      : "Site Entry Pending Approval";
  } else if (action === "approve") {
    lifecyclePhase = "Proposal Draft";
  } else if (action === "reject") {
    lifecyclePhase = "Site Entry Rejected";
  }

  const updates: Record<string, unknown> = {
    updated_at: now,
  };
  if (lifecyclePhase) {
    updates.lifecycle_phase = lifecyclePhase;
    updates.lifecycle_changed_at = now;
    updates.lifecycle_changed_by = actor || null;
  }

  if (action === "create") {
    const locationTag = text(input.locationTag, 1000);
    Object.assign(updates, {
      referred_by: text(input.referredBy, 240) || null,
      ref_contact: text(input.refContact, 120) || null,
      location_tag: locationTag || null,
      start_date: cleanDate(input.startDate),
      design_stage_status: text(input.designStageStatus, 40) || "In Progress",
      approval_stage_status: text(input.approvalStageStatus, 40) || "Pending",
      supervision_stage_status: text(input.supervisionStageStatus, 40) || "Completed",
      site_geofence_radius_m: positiveRadius(input.siteGeofenceRadiusM),
    });
  }

  await updateRows("proposals", { proposal_code: proposalCode }, updates);

  return NextResponse.json(
    {
      ...payload,
      data: {
        ...payload.data,
        lifecyclePhase: lifecyclePhase || payload?.data?.lifecyclePhase || "",
        ...(action === "create" ? {
          referredBy: updates.referred_by,
          refContact: updates.ref_contact,
          locationTag: updates.location_tag,
          startDate: updates.start_date,
          designStageStatus: updates.design_stage_status,
          approvalStageStatus: updates.approval_stage_status,
          supervisionStageStatus: updates.supervision_stage_status,
          siteGeofenceRadiusM: updates.site_geofence_radius_m,
        } : {}),
      },
    },
    { status: response.status, headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
