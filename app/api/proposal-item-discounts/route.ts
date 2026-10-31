import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf, userIdOf } from "@/lib/local-session";
import { mergeRolePermissions, roleDefaultPermissions } from "@/lib/role-permissions";
import { selectRows, updateRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;

function text(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function numberOf(value: unknown) {
  const parsed = Number(String(value ?? 0).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store, max-age=0" } });
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return host === request.nextUrl.hostname.toLowerCase() || host === "app.landview.com.bd" || host === "www.landview.com.bd" || host === "landview.com.bd" || host === "localhost" || host === "127.0.0.1" || host.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

async function requireUser(request: NextRequest) {
  const user = await requireLocalSession(request) as Row | null;
  if (!user) throw new Error("Session expired.");
  return user;
}

async function permissionAccess(user: Row) {
  const role = roleOf(user);
  const userId = userIdOf(user);
  if (role === "admin") return { role, userId, all: true, permissions: roleDefaultPermissions("admin") };

  const rows = userId
    ? await selectRows("app_permissions", { filters: { user_key: userId }, order: "created_at:asc", limit: 5000 })
    : [];
  const overrides: Record<string, boolean> = {};
  for (const row of rows) overrides[text(row.permission)] = text(row.status).toLowerCase() === "active";
  const permissions = role === "manager" || role === "employee" || role === "client"
    ? mergeRolePermissions(role, overrides)
    : overrides;
  return { role, userId, all: false, permissions };
}

async function requireProposalAccess(user: Row, proposalCode: string, write = false) {
  const access = await permissionAccess(user);
  const permission = write ? "proposals.edit" : "proposals.view";
  if (!access.all && access.permissions[permission] !== true && !(write && access.permissions["proposals.create"] === true)) {
    throw new Error(`Permission required: ${permission}`);
  }

  const proposals = await selectRows("proposals", { filters: { proposal_code: proposalCode }, limit: 1 });
  if (!proposals.length) throw new Error("Proposal not found.");

  if (!write && !access.all && access.permissions["proposals.view_all"] !== true) {
    const proposal = proposals[0];
    const employee = text(user.employeeId || user.Employee_ID || user.userId || user.User_ID);
    const visible = text(proposal.assigned_to) === employee || text(proposal.created_by) === access.userId;
    if (!visible) throw new Error("Permission required: proposals.view_all");
  }
}

function legacyDiscount(row: Row) {
  const amount = Math.max(0, numberOf(row.amount));
  const discount = Math.min(amount, Math.max(0, numberOf(row.discount)));
  return {
    Item_ID: text(row.item_code),
    Discount: discount,
    Net_Amount: Math.max(0, numberOf(row.net_amount ?? amount - discount)),
  };
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const proposalId = text(request.nextUrl.searchParams.get("proposalId"), 200);
    if (!proposalId) throw new Error("Proposal ID is required.");
    await requireProposalAccess(user, proposalId, false);
    const rows = await selectRows("proposal_items", { filters: { proposal_code: proposalId }, order: "sort_order:asc", limit: 1000 });
    return json({ success: true, data: rows.map(legacyDiscount) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load service discounts.";
    return json({ success: false, error: message }, /session/i.test(message) ? 401 : /permission/i.test(message) ? 403 : /not found/i.test(message) ? 404 : 400);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ success: false, error: "Invalid request origin." }, 403);
  try {
    const user = await requireUser(request);
    const input = await request.json() as Row;
    const proposalId = text(input.proposalId || input.Proposal_ID, 200);
    if (!proposalId) throw new Error("Proposal ID is required.");
    await requireProposalAccess(user, proposalId, true);

    const incoming = Array.isArray(input.items) ? input.items as Row[] : [];
    const current = await selectRows("proposal_items", { filters: { proposal_code: proposalId }, order: "sort_order:asc", limit: 1000 });
    const byId = new Map(current.map((row: Row) => [text(row.item_code), row]));

    await Promise.all(incoming.map(async (item: Row) => {
      const itemId = text(item.Item_ID || item.item_code, 200);
      const stored = byId.get(itemId);
      if (!itemId || !stored) return;
      const amount = Math.max(0, numberOf(stored.amount));
      const discount = Math.min(amount, Math.max(0, numberOf(item.Discount ?? item.discount)));
      const netAmount = Math.max(0, amount - discount);
      await updateRows("proposal_items", { proposal_code: proposalId, item_code: itemId }, { discount, net_amount: netAmount, updated_at: new Date().toISOString() });
    }));

    const updated = await selectRows("proposal_items", { filters: { proposal_code: proposalId }, order: "sort_order:asc", limit: 1000 });
    return json({ success: true, data: updated.map(legacyDiscount) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save service discounts.";
    return json({ success: false, error: message }, /session/i.test(message) ? 401 : /permission/i.test(message) ? 403 : /not found/i.test(message) ? 404 : 400);
  }
}
