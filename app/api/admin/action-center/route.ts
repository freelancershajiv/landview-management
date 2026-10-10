import { NextRequest, NextResponse } from "next/server";
import { requireApiCapability, permissionStatus } from "@/lib/permission-guard";
import { mutateOrganizationAlert, scanOrganizationHealth } from "@/lib/action-center";
import { recordAuditEvent } from "@/lib/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Row = Record<string, any>;

function clean(value: unknown, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

function actorOf(user: Row) {
  return clean(
    user?.employeeId || user?.Employee_ID || user?.userId || user?.User_ID || user?.username || user?.Username || user?.name || user?.Name,
    200,
  ) || "management";
}

function validOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.nextUrl.host;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireApiCapability(request, "systemHealth.view");
    const data = await scanOrganizationHealth();
    return NextResponse.json({ success: true, data }, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Could not scan organization health." },
      { status: permissionStatus(error), headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!validOrigin(request)) return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
    const { user } = await requireApiCapability(request, "workflow.edit");
    const body = await request.json().catch(() => ({}));
    const alertKey = clean(body?.alertKey, 300);
    const operation = clean(body?.operation, 40).toLowerCase() as "acknowledge" | "resolve" | "dismiss" | "assign" | "reopen";
    if (!alertKey) return NextResponse.json({ success: false, error: "Alert key is required." }, { status: 400 });
    if (!["acknowledge", "resolve", "dismiss", "assign", "reopen"].includes(operation)) {
      return NextResponse.json({ success: false, error: "Unsupported alert operation." }, { status: 400 });
    }

    const before = (await scanOrganizationHealth()).alerts.find((item) => item.alert_key === alertKey) || null;
    const data = await mutateOrganizationAlert({
      alertKey,
      operation,
      actor: actorOf(user as Row),
      assignedTo: clean(body?.assignedTo, 200),
      note: clean(body?.note, 1000),
    });

    await recordAuditEvent({
      user: user as Row,
      request,
      action: `organization_alert.${operation}`,
      entityType: "organization_alert",
      entityId: alertKey,
      target: before?.title || alertKey,
      before,
      after: data,
      source: "action-center",
    });

    return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Could not update organization alert." },
      { status: permissionStatus(error), headers: { "Cache-Control": "no-store" } },
    );
  }
}
