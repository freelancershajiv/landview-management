import { getVercelOidcToken } from "@vercel/oidc";

const ACTION_CENTER_URL = "https://jupzgjlizxivhbmuigua.supabase.co/functions/v1/landview-action-center";
const AUDIENCE = "https://supabase.landview.internal";

type Row = Record<string, any>;

export type OrganizationAlert = {
  id?: string;
  alert_key: string;
  category: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  entity_type?: string | null;
  entity_id?: string | null;
  project_id?: string | null;
  href?: string | null;
  condition_active?: boolean;
  status: "open" | "acknowledged" | "resolved" | "dismissed";
  assigned_to?: string | null;
  acknowledged_by?: string | null;
  acknowledged_at?: string | null;
  resolved_by?: string | null;
  resolved_at?: string | null;
  resolution_note?: string | null;
  metadata?: Row;
  first_detected_at?: string;
  last_detected_at?: string;
};

export type ActionCenterData = {
  score: number;
  status: "healthy" | "warning" | "critical";
  counts: { critical: number; warning: number; info: number; acknowledged: number; total: number };
  alerts: OrganizationAlert[];
  metrics: Row;
  generatedAt: string;
};

async function invoke(body: Row) {
  const oidc = await getVercelOidcToken({ audience: AUDIENCE });
  if (!oidc) throw new Error("Vercel OIDC token is unavailable for the LAND VIEW Action Center.");
  const response = await fetch(ACTION_CENTER_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${oidc}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new Error(String(payload?.error || `Action Center returned HTTP ${response.status}.`));
  }
  return payload.data;
}

export async function scanOrganizationHealth(): Promise<ActionCenterData> {
  return await invoke({ action: "scan" }) as ActionCenterData;
}

export async function mutateOrganizationAlert(input: {
  alertKey: string;
  operation: "acknowledge" | "resolve" | "dismiss" | "assign" | "reopen";
  actor: string;
  assignedTo?: string;
  note?: string;
}) {
  return await invoke({ action: "mutate", ...input }) as OrganizationAlert;
}
