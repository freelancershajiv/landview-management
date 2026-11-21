import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { receivableInvoiceIsActive } from "@/lib/billing-receivable-authority";
import { selectRows } from "@/lib/supabase-data";
import { workScope } from "@/lib/work-task-links";
import { permissionAccess } from "@/lib/workspace-permission-access";

type Hit = { kind: "Project" | "Proposal" | "Invoice"; label: string; href: string };

const text = (value: unknown) => String(value ?? "").trim();
const folded = (value: unknown) => text(value).toLowerCase().replace(/\s+/g, " ");

async function projects(query: string): Promise<Hit[]> {
  const projectCode = workScope("project", query)?.code;
  const select = "project_code,client_name_snapshot,project_name";
  const rows = await selectRows("projects", projectCode
    ? { select, inFilters: { project_code: [projectCode, `LV-${Number(projectCode.slice(3))}`] }, limit: 2 }
    : { select, order: "project_code:asc", limit: 5000 });
  const term = folded(query);
  return rows.filter((row) => row.project_code && (projectCode ||
    [row.client_name_snapshot, row.project_name].some((name) => folded(name).includes(term))))
    .slice(0, 6).map((row) => ({
      kind: "Project",
      label: [row.project_code, row.client_name_snapshot || row.project_name].filter(Boolean).join(" · "),
      href: `/admin/projects/${encodeURIComponent(row.project_code)}`,
    }));
}

async function proposals(query: string): Promise<Hit[]> {
  if (!/^PROP-[A-Z0-9-]+$/i.test(query)) return [];
  const rows = await selectRows("proposals", {
    select: "proposal_code,client_name,project_title",
    filters: { proposal_code: query.toUpperCase() }, limit: 1,
  });
  return rows.map((row) => ({
    kind: "Proposal",
    label: [row.proposal_code, row.client_name || row.project_title].filter(Boolean).join(" · "),
    href: `/admin/proposals/${encodeURIComponent(row.proposal_code)}`,
  }));
}

async function invoices(query: string): Promise<Hit[]> {
  if (!/\d/.test(query) || !/^[A-Z0-9/_-]+$/i.test(query)) return [];
  const select = "id,invoice_code,invoice_no,status";
  const codes = [...new Set([query, query.toUpperCase()])];
  const matches = await Promise.all(["invoice_code", "invoice_no"].map((column) =>
    selectRows("invoices", { select, inFilters: { [column]: codes }, limit: 5 }),
  ));
  return [...new Map(matches.flat().map((row) => [row.id, row])).values()]
    .filter(receivableInvoiceIsActive).flatMap((row) => {
      const code = text(row.invoice_code || row.invoice_no);
      return code ? [{ kind: "Invoice", label: code, href: `/admin/billing/invoice-center?q=${encodeURIComponent(code)}` }] : [];
    });
}

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(request: NextRequest) {
  const user = await requireLocalSession(request);
  if (!user) return json({ success: false, error: "Session expired." }, 401);
  if (!["admin", "manager"].includes(roleOf(user))) return json({ success: false, error: "Management access required." }, 403);
  const query = text(request.nextUrl.searchParams.get("q"));
  if (query.length < 3 || query.length > 120) return json({ success: true, data: [] });

  try {
    const access = await permissionAccess(user);
    const can = (permission: string) => access.all || access.permissions[permission] === true;
    const recordId = /^(PROP-|INV-)/i.test(query);
    const results = await Promise.allSettled([
      can("projects.view") && !recordId ? projects(query) : [],
      can("proposals.view") ? proposals(query) : [],
      can("finance.view") ? invoices(query) : [],
    ]);
    const hits = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
    return json({ success: true, data: hits.slice(0, 8), partial: results.some((result) => result.status === "rejected") });
  } catch {
    return json({ success: false, error: "Record search unavailable." }, 503);
  }
}
