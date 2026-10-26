import { NextRequest } from "next/server";
import { selectRows } from "@/lib/supabase-data";

export const dynamic = "force-dynamic";

const EXPORT_TOKEN = "owKn12BkR3kIX_vR5Q2PTuLJzaOfiRgZO8YX4kHEw66tZDdVtlUvFdPXhd4qm2n-";

function csvEscape(value: unknown) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

function detectOutsourcingService(row: Record<string, unknown>) {
  const value = `${row.service_type ?? ""} ${row.category ?? ""} ${row.description ?? ""}`
    .toLowerCase()
    .replaceAll("–", "-")
    .replaceAll("—", "-");

  if (/digital[\s-]*survey/.test(value)) return "Digital Survey";
  if (/(soil[\s-]*test|(^|[^a-z])spt([^a-z]|$)|geo[\s-]*technical|geotechnical|boring[\s-]*test)/.test(value)) return "Soil Test";
  if (/((^|[^a-z])electrical([^a-z]|$)|electric[\s-]*design)/.test(value)) return "Electrical Design";
  if (/(^|[^a-z0-9])3d([^a-z0-9]|$)/.test(value)) {
    if (/interior/.test(value)) return "3D Design – Interior";
    if (/exterior/.test(value)) return "3D Design – Exterior";
    return "3D Design";
  }
  return "";
}

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("token") !== EXPORT_TOKEN) {
    return new Response("Unauthorized", { status: 401 });
  }

  const rows = await selectRows("transactions", {
    order: "transaction_date:asc,ledger_order:asc,created_at:asc",
    limit: 5000,
  });

  const rawColumns = [
    "id",
    "transaction_code",
    "transaction_date",
    "transaction_type",
    "source_type",
    "source_id",
    "project_id",
    "project_code_snapshot",
    "account_id",
    "account_code_snapshot",
    "account_snapshot",
    "category",
    "service_type",
    "description",
    "debit",
    "credit",
    "amount",
    "direction",
    "payment_method",
    "reference_no",
    "status",
    "finance_scope",
    "source_created_by",
    "source_created_at",
    "created_at",
    "ledger_order",
  ];

  const columns = [
    ...rawColumns,
    "outsourcing_candidate",
    "detected_outsourcing_service",
  ];

  const lines = [columns.join(",")];
  for (const row of rows) {
    const detected = detectOutsourcingService(row);
    const values = rawColumns.map((column) => csvEscape(row[column]));
    values.push(detected ? "YES" : "NO", csvEscape(detected));
    lines.push(values.join(","));
  }

  const csv = `\uFEFF${lines.join("\r\n")}`;
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="LAND_VIEW_Full_Ledger_2023-2026.csv"',
      "cache-control": "no-store, private",
      "x-ledger-row-count": String(rows.length),
    },
  });
}
