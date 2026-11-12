import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { loadReceivableAuthority } from "@/lib/billing-receivable-authority";
import { normalizeProjectCode, selectRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// This API is deliberately read-only. Do not replace loadReceivableAuthority
// with getBillingV2Snapshot: that helper can initialize contracts during a GET.
type Row = Record<string, unknown>;
const REQUIREMENTS = [
  { key: "photo", name: "Photo", match: /photo|photograph|picture/i },
  { key: "identity", name: "NID / Passport / Birth Certificate", match: /nid|national id|identity|passport|birth certificate/i },
  { key: "ownership", name: "Ownership Registry Paper", match: /ownership|registry|registered deed|land deed/i },
  { key: "khotian", name: "Khotian", match: /khotian|khatian|record of rights/i },
  { key: "tax", name: "Land Tax Slip", match: /land tax|land development tax|tax slip|tax receipt|dakhila/i },
] as const;

function text(value: unknown, limit = 250) {
  return String(value ?? "").trim().slice(0, limit);
}
function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } });
}
function received(row: Row) {
  const status = text(row.collection_status).toLowerCase();
  return Boolean(row.received_date || ["received", "collected", "verified", "held", "returned"].includes(status));
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireLocalSession(request);
    if (!user) return json({ success: false, error: "Session expired." }, 401);
    if (!["admin", "manager"].includes(roleOf(user))) {
      return json({ success: false, error: "Management permission required." }, 403);
    }

    const projectCode = normalizeProjectCode(request.nextUrl.searchParams.get("projectId"));
    if (!projectCode) return json({ success: false, error: "Project ID is required." }, 400);
    const projects = await selectRows("projects", { filters: { project_code: projectCode }, limit: 1 });
    const project = projects[0] as Row | undefined;
    if (!project) return json({ success: false, error: "Project not found." }, 404);

    const [todosResult, servicesResult, receiptsResult, visitsResult, financeResult] = await Promise.allSettled([
      selectRows("todo_items", { filters: { project_code: projectCode }, limit: 1000 }),
      selectRows("project_service_workflows", { filters: { project_id: project.id }, limit: 1000 }),
      selectRows("client_document_register", { filters: { project_id: project.id }, limit: 1000 }),
      selectRows("site_visits", { filters: { project_id: project.id }, limit: 1000 }),
      loadReceivableAuthority({ projectId: text(project.id, 80) }),
    ]);

    const warnings: string[] = [];
    function rows(result: PromiseSettledResult<unknown>, source: string): Row[] {
      if (result.status === "rejected") {
        warnings.push(`${source} could not be loaded.`);
        return [];
      }
      const value = result.value;
      return Array.isArray(value) ? value as Row[] : [];
    }
    const todos = rows(todosResult, "To-Do");
    const services = rows(servicesResult, "Service workflow");
    const receipts = rows(receiptsResult, "Client document register");
    const visits = rows(visitsResult, "Site visits");

    let financial: { billed: number; paid: number; due: number; openInvoiceCount: number } | null = null;
    if (financeResult.status === "fulfilled" && financeResult.value.complete) {
      const value = financeResult.value.projects.get(text(project.id, 80));
      if (value) {
        financial = {
          billed: value.billed, paid: value.paid, due: value.totalDue,
          openInvoiceCount: value.openInvoiceCount,
        };
      } else {
        financial = { billed: 0, paid: 0, due: 0, openInvoiceCount: 0 };
      }
    } else {
      warnings.push("Financial authority is unavailable or incomplete; amounts are hidden rather than shown as zero.");
    }

    const documents = REQUIREMENTS.map((requirement) => {
      const matches = receipts.filter((row) => requirement.match.test(text(row.document_name, 300)));
      const recorded = matches.filter(received).length;
      return {
        key: requirement.key, name: requirement.name,
        receiptCount: recorded,
        status: receiptsResult.status === "rejected" ? "Unavailable" : recorded ? "On record" : "Not recorded",
        // The legacy register does not establish formal verification: never say Verified here.
      };
    });
    const openTodos = todos.filter((row) => !["done", "completed", "cancelled", "canceled"].includes(text(row.status).toLowerCase()));
    if (todos.length >= 1000 || services.length >= 1000 || receipts.length >= 1000 || visits.length >= 1000) {
      warnings.push("Some sections reached their record limit and may be incomplete.");
    }
    return json({
      success: true,
      data: {
        project: {
          id: text(project.id, 80), code: projectCode,
          name: text(project.project_name) || projectCode,
          owner: text(project.client_name_snapshot),
          location: text(project.location),
          phase: text(project.lifecycle_phase) || "Not set",
          proposalCode: text(project.reclassified_proposal_code),
        },
        financial,
        todos: { count: todos.length, open: openTodos.length, items: openTodos.slice(0, 8).map((row) => ({
          code: text(row.todo_code), title: text(row.title), status: text(row.status),
          dueDate: text(row.due_date, 20),
        })) },
        services: { count: services.length, items: services.slice(0, 15).map((row) => ({
          id: text(row.id, 80), name: text(row.service_name),
          status: text(row.status), type: text(row.workflow_type),
        })) },
        documents, siteVisits: visitsResult.status === "fulfilled" ? visits.length : null,
        warnings, refreshedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : "Unable to load project." }, 500);
  }
}
