import type { NextRequest } from "next/server";
import { insertRows } from "@/lib/supabase-data";

type Row = Record<string, any>;
type AuditOutcome = "success" | "failure" | "denied" | "warning";

const REDACT_KEY = /(password|passcode|pin|secret|token|cookie|authorization|api[_-]?key|access[_-]?key|refresh[_-]?token|session|credential|private[_-]?key|base64|file[_-]?bytes|image[_-]?data|signature)/i;
const MAX_DEPTH = 5;
const MAX_ARRAY = 100;
const MAX_STRING = 4000;

function text(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function actorKey(user: Row | null | undefined) {
  return text(user?.userId || user?.User_ID || user?.employeeId || user?.Employee_ID || user?.username || user?.Username, 200);
}

function actorRole(user: Row | null | undefined) {
  return text(user?.role || user?.Role, 80).toLowerCase();
}

function actorName(user: Row | null | undefined) {
  return text(user?.name || user?.Name || user?.employeeName || user?.Employee_Name || user?.username || user?.Username, 250);
}

function sanitize(value: unknown, depth = 0): any {
  if (value === null || value === undefined) return value ?? null;
  if (depth >= MAX_DEPTH) return "[TRUNCATED]";
  if (typeof value === "string") return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.slice(0, MAX_ARRAY).map((item) => sanitize(item, depth + 1));
  if (typeof value === "object") {
    const out: Row = {};
    for (const [key, child] of Object.entries(value as Row)) {
      if (REDACT_KEY.test(key)) {
        out[key] = "[REDACTED]";
        continue;
      }
      out[key] = sanitize(child, depth + 1);
    }
    return out;
  }
  return text(value, MAX_STRING);
}

function requestId(request?: NextRequest | null) {
  if (!request) return "";
  return text(
    request.headers.get("x-vercel-id") ||
    request.headers.get("x-request-id") ||
    request.headers.get("cf-ray") ||
    "",
    250
  );
}

export type AuditEventInput = {
  user?: Row | null;
  request?: NextRequest | null;
  action: string;
  entityType?: string;
  entityId?: string;
  target?: string;
  outcome?: AuditOutcome;
  before?: unknown;
  after?: unknown;
  details?: Row;
  source?: string;
};

export async function recordAuditEvent(input: AuditEventInput) {
  const row = {
    actor_user_key: actorKey(input.user),
    actor_role: actorRole(input.user),
    actor_name: actorName(input.user),
    action: text(input.action, 180) || "unknown",
    target: text(input.target || input.entityId || input.entityType, 500),
    entity_type: text(input.entityType, 120),
    entity_id: text(input.entityId, 240),
    outcome: text(input.outcome || "success", 40),
    before_data: input.before === undefined ? null : sanitize(input.before),
    after_data: input.after === undefined ? null : sanitize(input.after),
    request_path: input.request ? text(input.request.nextUrl.pathname, 500) : "",
    request_id: requestId(input.request),
    source: text(input.source || "application", 100) || "application",
    details: sanitize(input.details || {}),
  };

  try {
    await insertRows("app_audit_log", row);
    return true;
  } catch (error) {
    // Audit failure must be visible in server logs, but should not roll back an
    // otherwise-valid business mutation during the rollout phase.
    console.error("LAND VIEW audit write failed", {
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function auditFailure(input: Omit<AuditEventInput, "outcome"> & { error: unknown }) {
  return recordAuditEvent({
    ...input,
    outcome: "failure",
    details: {
      ...(input.details || {}),
      error: input.error instanceof Error ? input.error.message : text(input.error, 2000),
    },
  });
}
