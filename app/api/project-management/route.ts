import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession } from "@/lib/local-session";
import { employeeCodeOf, insertRows, normalizeProjectCode, selectRows, updateRows, deleteRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;
const clean = (v: unknown, max = 1000) => String(v ?? "").trim().slice(0, max);
const num = (v: unknown) => { const n = Number(String(v ?? "").replace(/,/g, "").replace(/[^0-9.-]/g, "")); return Number.isFinite(n) ? n : 0; };
const roleOf = (u: Row | null) => clean(u?.role || u?.Role, 30).toLowerCase();
const userIdOf = (u: Row | null) => clean(u?.userId || u?.User_ID || u?.username || u?.Username, 120);
const isAdmin = (u: Row) => roleOf(u) === "admin";
function projectIdsOf(user: Row) {
  const raw = clean(user.projectIds || user.Project_IDs || user.project_ids, 3000);
  return Array.from(new Set(raw.split(/[;,\s]+/).map(normalizeProjectCode).filter(Boolean)));
}
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}
function ok(data: unknown, status = 200) {
  return NextResponse.json({ success: true, data }, { status, headers: { "Cache-Control": "no-store, max-age=0", "X-Landview-Data": "supabase" } });
}
function fail(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : String(error || "Project Management request failed.");
  return NextResponse.json({ success: false, error: message }, { status, headers: { "Cache-Control": "no-store, max-age=0" } });
}
async function requireUser(request: NextRequest) {
  const user = await requireLocalSession(request) as Row | null;
  if (!user) throw new Error("Session expired.");
  const role = roleOf(user);
  if (role !== "admin" && role !== "client") throw new Error("Project Management access is restricted to admin and client accounts.");
  return user;
}
async function projectsFor(user: Row) {
  if (isAdmin(user)) return selectRows("projects", { filters: { record_type: "project" }, order: "project_code:asc", limit: 5000 });
  const ids = projectIdsOf(user);
  return ids.length ? selectRows("projects", { inFilters: { project_code: ids }, limit: 5000 }) : [];
}
async function projectFor(user: Row, value: unknown) {
  const code = normalizeProjectCode(value);
  if (!code) throw new Error("Project is required.");
  if (!isAdmin(user) && !projectIdsOf(user).includes(code)) throw new Error("Access denied for this project.");
  const rows = await selectRows("projects", { filters: { project_code: code, record_type: "project" }, limit: 1 });
  if (!rows.length) throw new Error("Project not found.");
  return rows[0];
}
function calculate(rows: Row[]) {
  let balance = 0;
  return rows.slice().sort((a,b) => {
    const d = String(a.entry_date || "").localeCompare(String(b.entry_date || ""));
    if (d) return d;
    return String(a.created_at || "").localeCompare(String(b.created_at || ""));
  }).map(row => {
    const debit = num(row.debit), credit = num(row.credit);
    balance += credit - debit;
    return { ...row, debit, credit, sft: num(row.sft), rate: num(row.rate), balance };
  });
}
async function workspace(user: Row, requested?: string) {
  const projects = await projectsFor(user);
  if (!projects.length) return { projects: [], selectedProject: null, entries: [], totals: { debit: 0, credit: 0, balance: 0 }, readOnly: !isAdmin(user) };
  const selected = requested
    ? projects.find(p => normalizeProjectCode(p.project_code) === normalizeProjectCode(requested))
    : projects[0];
  if (!selected) throw new Error("The selected project is not available to this account.");
  const rows = await selectRows("project_management_ledger", { filters: { project_id: selected.id }, order: "entry_date:asc", limit: 10000 });
  const entries = calculate(rows);
  const debit = entries.reduce((s,r) => s + num(r.debit), 0);
  const credit = entries.reduce((s,r) => s + num(r.credit), 0);
  return {
    projects: projects.map(p => ({ id:p.id, projectCode:p.project_code, projectName:p.project_name || p.project_code, clientName:p.client_name_snapshot || "", location:p.location || "", status:p.status || "" })),
    selectedProject: { id:selected.id, projectCode:selected.project_code, projectName:selected.project_name || selected.project_code, clientName:selected.client_name_snapshot || "", location:selected.location || "", status:selected.status || "" },
    entries,
    totals: { debit, credit, balance: credit - debit },
    readOnly: !isAdmin(user),
  };
}
function errorStatus(message: string) {
  if (/session expired/i.test(message)) return 401;
  if (/access denied|restricted|not available|permission required/i.test(message)) return 403;
  if (/required|valid|either/i.test(message)) return 400;
  return 500;
}

export async function GET(request: NextRequest) {
  try { const user = await requireUser(request); return ok(await workspace(user, request.nextUrl.searchParams.get("projectId") || "")); }
  catch (e) { const m = e instanceof Error ? e.message : String(e); return fail(m, errorStatus(m)); }
}

async function validateEntry(body: Row) {
  const debit = Math.max(0, num(body.debit ?? body.Debit));
  const credit = Math.max(0, num(body.credit ?? body.Credit));
  if ((debit > 0) === (credit > 0)) throw new Error("Enter either a Debit or a Credit amount, not both.");
  const details = clean(body.details ?? body.Details, 1000);
  if (!details) throw new Error("Details are required.");
  const entryDate = clean(body.entryDate ?? body.Date, 20) || new Date().toISOString().slice(0,10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) throw new Error("Enter a valid entry date.");
  return { debit, credit, details, entryDate, sft:Math.max(0,num(body.sft ?? body.SFT)), rate:Math.max(0,num(body.rate ?? body.Rate)), category:clean(body.category ?? body.Category,120) || null, memo:clean(body.memo ?? body.Memo,1000) || null };
}

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return fail("Invalid request origin.",403);
    const user = await requireUser(request);
    if (!isAdmin(user)) return fail("Admin permission required.",403);
    const body = await request.json() as Row;
    const project = await projectFor(user, body.projectId || body.Project_ID);
    const v = await validateEntry(body);
    const row = { project_id:project.id, project_code_snapshot:project.project_code, entry_date:v.entryDate, details:v.details, sft:v.sft, rate:v.rate, debit:v.debit, credit:v.credit, category:v.category, memo:v.memo, source:"project_management", created_by:employeeCodeOf(user) || userIdOf(user) || "LAND VIEW" };
    const saved = await insertRows("project_management_ledger", row);
    return ok(saved[0] || row);
  } catch (e) { return fail(e, errorStatus(e instanceof Error ? e.message : String(e))); }
}

export async function PUT(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return fail("Invalid request origin.",403);
    const user = await requireUser(request);
    if (!isAdmin(user)) return fail("Admin permission required.",403);
    const body = await request.json() as Row;
    const id = clean(body.id,100);
    if (!id) return fail("Ledger entry ID is required.",400);
    const v = await validateEntry(body);
    const saved = await updateRows("project_management_ledger", { id }, { entry_date:v.entryDate, details:v.details, sft:v.sft, rate:v.rate, debit:v.debit, credit:v.credit, category:v.category, memo:v.memo, updated_at:new Date().toISOString() });
    if (!saved.length) return fail("Ledger entry not found.",404);
    return ok(saved[0]);
  } catch (e) { return fail(e, errorStatus(e instanceof Error ? e.message : String(e))); }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return fail("Invalid request origin.",403);
    const user = await requireUser(request);
    if (!isAdmin(user)) return fail("Admin permission required.",403);
    const id = clean(request.nextUrl.searchParams.get("id"),100);
    if (!id) return fail("Ledger entry ID is required.",400);
    const deleted = await deleteRows("project_management_ledger", { id });
    if (!deleted.length) return fail("Ledger entry not found.",404);
    return ok({ deleted:true, id });
  } catch (e) { return fail(e, errorStatus(e instanceof Error ? e.message : String(e))); }
}
