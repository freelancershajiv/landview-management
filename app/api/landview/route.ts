import { NextRequest, NextResponse } from "next/server";
import {
  QUICK_USER_COOKIE,
  REFRESH_COOKIE,
  REMEMBER_COOKIE,
  SESSION_COOKIE,
  requireLocalSession,
  revokeLocalSession,
  sessionMaxAge,
  signWorkspaceUser,
  userIdOf,
  roleOf,
} from "@/lib/local-session";
import { supabaseAuthGateway } from "@/lib/supabase-auth";
import {
  deleteRows,
  handleLandviewDataAction,
  insertRows,
  normalizeProjectCode,
  selectRows,
  updateRows,
  upsertRows,
} from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;
const QUICK_ACTIONS = new Set(["setQuickPin", "quickPinStatus", "quickPinLogin", "quickLock", "trustDevice", "untrustDevice"]);

function text(value: unknown, max = 4000) { return String(value ?? "").trim().slice(0, max); }
function num(value: unknown) { const n = Number(text(value).replace(/,/g, "").replace(/[^0-9.-]/g, "")); return Number.isFinite(n) ? n : 0; }
function bool(value: unknown) { return typeof value === "boolean" ? value : ["true","1","yes","y","active","approved"].includes(text(value).toLowerCase()); }
function randomCode(prefix: string) { return `${prefix}-${crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`; }
function cookieOptions(maxAge: number) { return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge, priority: "high" as const }; }
function originAllowed(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return host === "app.landview.com.bd" || host === "www.landview.com.bd" || host === "landview.com.bd" || host === "localhost" || host === "127.0.0.1" || host.endsWith(".vercel.app");
  } catch { return false; }
}
function ok(data: unknown, extraHeaders: Record<string,string> = {}) {
  return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "no-store, max-age=0", "X-Landview-Data": "supabase", ...extraHeaders } });
}
function fail(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : String(error || "Request failed.");
  const auth = /session expired|authentication required|invalid login|credentials/i.test(message);
  const denied = /permission required|access denied|admin permission/i.test(message);
  return NextResponse.json({ success: false, error: message }, { status: auth ? 401 : denied ? 403 : status, headers: { "Cache-Control": "no-store" } });
}
function clearAuth(response: NextResponse) {
  for (const name of [SESSION_COOKIE, REFRESH_COOKIE, QUICK_USER_COOKIE, REMEMBER_COOKIE]) response.cookies.set(name, "", cookieOptions(0));
}

async function requireUser(request: NextRequest) {
  const user = await requireLocalSession(request) as Row | null;
  if (!user) throw new Error("Session expired.");
  return user;
}
async function requireAdmin(request: NextRequest) {
  const user = await requireUser(request);
  if (roleOf(user) !== "admin") throw new Error("Admin permission required.");
  return user;
}
async function permissionAccess(user: Row) {
  const role = roleOf(user);
  const userId = userIdOf(user);
  if (role === "admin" || role === "manager") return { userId, role, all: true, permissions: {} as Record<string, boolean> };
  const rows = await selectRows("app_permissions", { filters: { user_key: userId }, order: "created_at:asc", limit: 5000 });
  const permissions: Record<string, boolean> = {};
  for (const row of rows) permissions[text(row.permission)] = text(row.status).toLowerCase() === "active";
  return { userId, role, all: false, permissions };
}
async function hasPermission(user: Row, permission: string) {
  const access = await permissionAccess(user);
  return access.all || access.permissions[permission] === true;
}
function permissionLegacy(row: Row) {
  return { Permission_ID: row.permission_id, User_ID: row.user_key, Role: row.role || "", Permission: row.permission, Status: row.status || "Active", Value: row.value || "", Notes: row.notes || "", Created_At: row.created_at || "", Created_By: row.created_by || "" };
}
function proposalLegacy(row: Row) {
  return {
    Proposal_ID: row.proposal_code, Prospect_ID: row.prospect_code || "", Client_Name: row.client_name || "", Phone: row.phone || "", Email: row.email || "", Address: row.address || "",
    Project_Title: row.project_title || "", Project_Location: row.project_location || "", Project_Type: row.project_type || "", Plot_Area: row.plot_area || "", Floors: row.floors || "",
    Gross_Amount: num(row.gross_amount), Discount: num(row.discount), Net_Amount: num(row.net_amount), Validity_Days: row.validity_days ?? 30, Valid_Until: row.valid_until || "",
    Status: row.status || "Draft", Assigned_To: row.assigned_to || "", Notes: row.notes || "", Converted_Project_ID: row.converted_project_code || "", Last_Printed_At: row.last_printed_at || "",
    Created_At: row.created_at || "", Created_By: row.created_by || "", Updated_At: row.updated_at || "",
  };
}
function proposalItemLegacy(row: Row) {
  return { Item_ID: row.item_code, Proposal_ID: row.proposal_code, Service: row.service || "", Description: row.description || "", Quantity: num(row.quantity) || 1, Unit: row.unit || "Job", Rate: num(row.rate), Amount: num(row.amount), Sort_Order: row.sort_order ?? 0, Status: row.status || "Active", Notes: row.notes || "", Category: row.category || "" };
}
function activityLegacy(row: Row) {
  return { Activity_ID: row.activity_code, Proposal_ID: row.proposal_code || "", Prospect_ID: row.prospect_code || "", Action: row.action || "", From_Status: row.from_status || "", To_Status: row.to_status || "", Performed_By: row.performed_by || "", Performed_At: row.performed_at || "", Details: row.details || "", User_ID: row.user_key || "", Role: row.role || "", Reference: row.reference || "" };
}
async function nextProposalCode() {
  const rows = await selectRows("proposals", { limit: 5000 });
  const year = new Date().getFullYear();
  const max = rows.reduce((m, row) => { const match = text(row.proposal_code).match(new RegExp(`^PROP-${year}-(\\d+)$`)); return match ? Math.max(m, Number(match[1])) : m; }, 0);
  return `PROP-${year}-${String(max + 1).padStart(4, "0")}`;
}
async function nextProspectCode() {
  const rows = await selectRows("prospective_clients", { limit: 5000 });
  const max = rows.reduce((m, row) => { const match = text(row.prospect_code).match(/^PC-(\d+)$/); return match ? Math.max(m, Number(match[1])) : m; }, 0);
  return `PC-${String(max + 1).padStart(4, "0")}`;
}
async function proposalBundle(id: string) {
  const rows = await selectRows("proposals", { filters: { proposal_code: id }, limit: 1 });
  if (!rows.length) throw new Error("Proposal not found.");
  const proposal = rows[0];
  const [items, activity, prospects] = await Promise.all([
    selectRows("proposal_items", { filters: { proposal_code: id }, order: "sort_order:asc", limit: 1000 }),
    selectRows("proposal_activity", { filters: { proposal_code: id }, order: "performed_at:desc", limit: 1000 }),
    proposal.prospect_code ? selectRows("prospective_clients", { filters: { prospect_code: proposal.prospect_code }, limit: 1 }) : Promise.resolve([]),
  ]);
  return { proposal: proposalLegacy(proposal), prospect: prospects[0] || null, items: items.map(proposalItemLegacy), activity: activity.map(activityLegacy) };
}
async function listProposals(user: Row) {
  if (!await hasPermission(user, "proposals.view")) throw new Error("Permission required: proposals.view");
  const rows = await selectRows("proposals", { order: "updated_at:desc", limit: 5000 });
  const access = await permissionAccess(user);
  const employee = text(user.employeeId || user.Employee_ID || user.userId || user.User_ID);
  const visible = access.all || access.permissions["proposals.view_all"] ? rows : rows.filter(row => text(row.assigned_to) === employee || text(row.created_by) === userIdOf(user));
  return visible.map(proposalLegacy);
}
async function saveProposal(user: Row, input: Row) {
  const record = (input.record && typeof input.record === "object" ? input.record : input) as Row;
  const existingId = text(input.id || record.Proposal_ID);
  if (!await hasPermission(user, existingId ? "proposals.edit" : "proposals.create")) throw new Error(`Permission required: ${existingId ? "proposals.edit" : "proposals.create"}`);
  const proposalCode = existingId || await nextProposalCode();
  let prospectCode = text(record.Prospect_ID);
  if (!prospectCode) prospectCode = await nextProspectCode();
  const now = new Date().toISOString();
  const prospect = {
    prospect_code: prospectCode, client_name: text(record.Client_Name) || "Prospective Client", phone: text(record.Phone) || null, email: text(record.Email) || null,
    address: text(record.Address) || null, source: text(record.Source) || null, assigned_to: text(record.Assigned_To) || null, status: "Prospect", notes: text(record.Notes) || null,
    created_by: userIdOf(user), created_at: text(record.Created_At) || now, updated_at: now,
  };
  await upsertRows("prospective_clients", prospect, "prospect_code");
  const itemRows = Array.isArray(input.items) ? input.items : Array.isArray(record.items) ? record.items : [];
  const gross = itemRows.reduce((sum: number, item: Row) => sum + num(item.Amount || (num(item.Quantity || 1) * num(item.Rate))), 0);
  const discount = num(record.Discount);
  const proposal = {
    proposal_code: proposalCode, prospect_code: prospectCode, client_name: text(record.Client_Name), phone: text(record.Phone) || null, email: text(record.Email) || null, address: text(record.Address) || null,
    project_title: text(record.Project_Title) || null, project_location: text(record.Project_Location) || null, project_type: text(record.Project_Type) || null, plot_area: text(record.Plot_Area) || null, floors: text(record.Floors) || null,
    gross_amount: num(record.Gross_Amount) || gross, discount, net_amount: num(record.Net_Amount) || Math.max(0, (num(record.Gross_Amount) || gross) - discount), validity_days: Math.trunc(num(record.Validity_Days) || 30),
    valid_until: text(record.Valid_Until) || null, status: text(record.Status) || "Draft", assigned_to: text(record.Assigned_To) || null, notes: text(record.Notes) || null, converted_project_code: text(record.Converted_Project_ID) || null,
    created_by: text(record.Created_By) || userIdOf(user), created_at: text(record.Created_At) || now, updated_at: now, last_printed_at: text(record.Last_Printed_At) || null,
  };
  await upsertRows("proposals", proposal, "proposal_code");
  await deleteRows("proposal_items", { proposal_code: proposalCode });
  if (itemRows.length) {
    await insertRows("proposal_items", itemRows.map((item: Row, index: number) => ({ item_code: text(item.Item_ID) || randomCode("PI"), proposal_code: proposalCode, service: text(item.Service), description: text(item.Description) || null, quantity: num(item.Quantity) || 1, unit: text(item.Unit) || "Job", rate: num(item.Rate), amount: num(item.Amount) || (num(item.Quantity) || 1) * num(item.Rate), sort_order: Number(item.Sort_Order ?? index + 1), status: text(item.Status) || "Active", notes: text(item.Notes) || null, category: text(item.Category) || null, taxable: bool(item.Taxable), created_by: userIdOf(user), created_at: now, updated_at: now })));
  }
  await insertRows("proposal_activity", { activity_code: randomCode("PA"), proposal_code: proposalCode, prospect_code: prospectCode, action: existingId ? "Updated" : "Created", from_status: null, to_status: proposal.status, performed_by: text(user.name || user.Name) || userIdOf(user), performed_at: now, details: `${itemRows.length} service item(s); net BDT ${proposal.net_amount}`, user_key: userIdOf(user), role: roleOf(user), reference: null });
  return proposalBundle(proposalCode);
}
async function proposalAction(user: Row, input: Row) {
  const op = text(input.op).toLowerCase();
  if (op === "save") return saveProposal(user, input);
  const id = text(input.id);
  if (!id) throw new Error("Proposal ID is required.");
  if (op === "print") {
    if (!await hasPermission(user, "proposals.print")) throw new Error("Permission required: proposals.print");
    const current = await proposalBundle(id); const before = text(current.proposal.Status);
    await updateRows("proposals", { proposal_code: id }, { last_printed_at: new Date().toISOString(), status: before === "Draft" || before === "Prepared" ? "Sent" : before, updated_at: new Date().toISOString() });
    await insertRows("proposal_activity", { activity_code: randomCode("PA"), proposal_code: id, prospect_code: current.proposal.Prospect_ID || null, action: "Printed / PDF", from_status: before, to_status: before === "Draft" || before === "Prepared" ? "Sent" : before, performed_by: text(user.name || user.Name) || userIdOf(user), performed_at: new Date().toISOString(), details: "Proposal printed or saved as PDF.", user_key: userIdOf(user), role: roleOf(user), reference: null });
    return proposalBundle(id);
  }
  if (op === "status") {
    if (!await hasPermission(user, "proposals.edit")) throw new Error("Permission required: proposals.edit");
    const current = await proposalBundle(id); const next = text(input.status || input.Status || input.toStatus || input.To_Status) || text(current.proposal.Status);
    await updateRows("proposals", { proposal_code: id }, { status: next, updated_at: new Date().toISOString() });
    await insertRows("proposal_activity", { activity_code: randomCode("PA"), proposal_code: id, prospect_code: current.proposal.Prospect_ID || null, action: "Status", from_status: current.proposal.Status || null, to_status: next, performed_by: text(user.name || user.Name) || userIdOf(user), performed_at: new Date().toISOString(), details: text(input.details) || null, user_key: userIdOf(user), role: roleOf(user), reference: null });
    return proposalBundle(id);
  }
  if (op === "convert") {
    if (!await hasPermission(user, "proposals.convert")) throw new Error("Permission required: proposals.convert");
    const projectId = normalizeProjectCode(input.projectId || input.Project_ID || input.convertedProjectId || "");
    if (!projectId) throw new Error("A valid Project ID is required, for example LV-281.");
    const current = await proposalBundle(id);
    const proposal = current.proposal as Row;
    const existingProjects = await selectRows("projects", { filters: { project_code: projectId }, limit: 1 });
    if (existingProjects.length && text(existingProjects[0].reclassified_proposal_code) !== id) {
      throw new Error(`${projectId} already exists. Choose an unused Project ID.`);
    }
    const now = new Date().toISOString();
    if (!existingProjects.length) {
      const rawPlot = text(proposal.Plot_Area);
      const rawFloors = text(proposal.Floors);
      const plot = rawPlot ? num(rawPlot) : null;
      const floors = rawFloors ? Math.trunc(num(rawFloors)) : null;
      await insertRows("projects", {
        project_code: projectId,
        project_name: text(proposal.Project_Title) || text(proposal.Client_Name) || projectId,
        client_name_snapshot: text(proposal.Client_Name) || null,
        phone_number_snapshot: text(proposal.Phone) || null,
        project_type: text(proposal.Project_Type) || null,
        location: text(proposal.Project_Location) || null,
        plot_area: plot !== null && plot >= 0 ? plot : null,
        floors: floors !== null && floors >= 0 ? floors : null,
        project_area_text: rawPlot || null,
        number_of_stories_text: rawFloors || null,
        start_date: now.slice(0, 10),
        design_bill: 0,
        status: "Running",
        notes: `Converted from proposal ${id}${text(proposal.Notes) ? `\n${text(proposal.Notes)}` : ""}`,
        public_display: false,
        record_type: "project",
        reclassified_proposal_code: id,
        created_at: now,
        updated_at: now,
      });
    }
    await updateRows("proposals", { proposal_code: id }, { status: "Converted", converted_project_code: projectId, updated_at: now });
    const prior = await selectRows("proposal_activity", { filters: { proposal_code: id, action: "Converted to Project", reference: projectId }, limit: 1 });
    if (!prior.length) {
      await insertRows("proposal_activity", {
        activity_code: randomCode("PA"), proposal_code: id, prospect_code: text(proposal.Prospect_ID) || null,
        action: "Converted to Project", from_status: text(proposal.Status) || "Accepted", to_status: "Converted",
        performed_by: text(user.name || user.Name) || userIdOf(user), performed_at: now,
        details: `Created project ${projectId} from accepted proposal.`, user_key: userIdOf(user), role: roleOf(user), reference: projectId,
      });
    }
    return proposalBundle(id);
  }
  throw new Error("Unsupported proposal operation.");
}

async function financeSheet(tab: string) {
  const now = new Date().toISOString();
  if (tab === "Transactions") {
    const [transactions, projects, accounts] = await Promise.all([selectRows("transactions", { order: "transaction_date:asc", limit: 5000 }), selectRows("projects", { limit: 5000 }), selectRows("accounts", { limit: 1000 })]);
    const projectMap = new Map(projects.map(row => [row.id, row.project_code]));
    const accountMap = new Map(accounts.map(row => [row.id, row.account_name || row.account_code]));
    const headers = ["Transaction_ID","Transaction_Date","Transaction_Type","Source_Type","Source_ID","Project_ID","Account","Category","Description","Debit","Credit","Reference_No","Status","Direction","Amount","Payment_Method","Created_By"];
    const rows = transactions.map(row => [row.transaction_code,row.transaction_date||"",row.transaction_type||"",row.source_type||"",row.source_id||"",projectMap.get(row.project_id)||row.project_code_snapshot||"",accountMap.get(row.account_id)||row.account_snapshot||"",row.category||"",row.description||"",row.debit??"",row.credit??"",row.reference_no||"",row.status||"",row.direction||"",row.amount??"",row.payment_method||"",row.source_created_by||""]);
    return { tab, tabs:["Transactions"], headers, rows, totals:{gross:0,discount:0,billed:0,paid:0,due:0,projects:0}, url:"", updatedAt:now };
  }
  if (tab === "Accounting Income") {
    const [payments, projects]=await Promise.all([selectRows("payments", { order: "payment_date:desc", limit: 5000 }),selectRows("projects",{limit:5000})]);
    const headers=["Payment_ID","Payment_Date","Project_ID","Income_Category","Description","Amount","Payment_Method","Deposit_Account","Reference_No","Approval_Status"];
    const map=new Map(projects.map(p=>[p.id,p.project_code]));
    const rows=payments.map(p=>[p.payment_code,p.payment_date||"",map.get(p.project_id)||"",p.income_category||p.payment_for||"",p.notes||p.payment_for||"Client payment",p.amount??0,p.payment_method||"",p.deposit_account||"",p.reference_no||"",p.approval_status||p.status||""]);
    return {tab,tabs:[tab],headers,rows,totals:{gross:0,discount:0,billed:0,paid:payments.reduce((s,p)=>s+num(p.amount),0),due:0,projects:new Set(payments.map(p=>p.project_id)).size},url:"",updatedAt:now};
  }
  if (tab === "Accounting Expenses") {
    const [expenses,projects]=await Promise.all([selectRows("expenses",{order:"expense_date:desc",limit:5000}),selectRows("projects",{limit:5000})]);
    const headers=["Expense_ID","Expense_Date","Project_ID","Category","Description","Amount","Paid_To","Payment_Method","Reference_No","Approval_Status"];
    const map=new Map(projects.map(p=>[p.id,p.project_code]));
    const rows=expenses.map(e=>[e.expense_code,e.expense_date||"",map.get(e.project_id)||e.file_id||"",e.category||"",e.description||"",e.amount??0,e.paid_to||"",e.payment_method||"",e.reference_no||"",e.approval_status||e.status||""]);
    return {tab,tabs:[tab],headers,rows,totals:{gross:expenses.reduce((s,e)=>s+num(e.amount),0),discount:0,billed:0,paid:0,due:0,projects:new Set(expenses.map(e=>e.project_id).filter(Boolean)).size},url:"",updatedAt:now};
  }
  if (tab === "File List") {
    const projects=await selectRows("projects",{order:"project_code:asc",limit:5000});
    const headers=["FILE ID","Project Name","Client Name","Phone","Location","Status"];
    const rows=projects.map(p=>[p.project_code,p.project_name||"",p.client_name_snapshot||"",p.phone_number_snapshot||"",p.location||"",p.status||""]);
    return {tab,tabs:[tab],headers,rows,totals:{gross:0,discount:0,billed:0,paid:0,due:0,projects:projects.length},url:"",updatedAt:now};
  }
  throw new Error("Use primary Supabase finance adapter.");
}

async function extraGet(request: NextRequest, action: string, input: Row, user: Row) {
  if (action === "getUsers") {
    await requireAdmin(request);
    return await supabaseAuthGateway("listUsers", { accessToken: request.cookies.get(SESSION_COOKIE)?.value || "" });
  }
  if (action === "getPermissions") {
    await requireAdmin(request);
    return (await selectRows("app_permissions", { order: "created_at:asc", limit: 5000 })).map(permissionLegacy);
  }
  if (action === "getErpRecords") {
    const module = text(input.module).toLowerCase();
    if (module === "workspacepermissionsv2") return permissionAccess(user);
    if (module === "proposalsv2") {
      const op = text(input.op || "list").toLowerCase();
      if (op === "list") return listProposals(user);
      if (op === "get") { if (!await hasPermission(user,"proposals.view")) throw new Error("Permission required: proposals.view"); return proposalBundle(text(input.id)); }
    }
    if (module === "quotations") return (await selectRows("quotations", { order:"quotation_date:desc",limit:5000 })).map(r=>({Quotation_ID:r.quotation_code,Client_ID:r.client_code||"",Project_ID:r.project_code||"",Quotation_Date:r.quotation_date||"",Valid_Until:r.valid_until||"",Description:r.description||"",Amount:num(r.amount),Status:r.status||"",Notes:r.notes||""}));
    if (module === "drawings") return (await selectRows("drawing_submissions", { order:"submitted_at:desc",limit:5000 })).map(r=>({Drawing_ID:r.drawing_code,Project_ID:r.project_code||"",Drawing_Title:r.drawing_title||"",Discipline:r.discipline||"",Revision:r.revision||"",Assigned_Employee_ID:r.assigned_employee_code||"",File_URL:r.drive_url||"",Status:r.status||"",Submitted_At:r.submitted_at||"",Approved_At:r.approved_at||"",Approved_By:r.approved_by||"",Comments:r.comments||""}));
  }
  if (action === "getFinanceSheet") {
    const tab = text(input.tab);
    if (["Transactions","Accounting Income","Accounting Expenses","File List"].includes(tab)) return financeSheet(tab);
  }
  if (action === "getProjectDriveFolder") {
    const p = await handleLandviewDataAction("getProject", input, user) as Row;
    return { projectId:p.Project_ID, folderId:p.Drive_Folder_ID||"", url:p.Drive_Folder_URL||"" };
  }
  if (action === "getProjectServiceFolders") {
    if (text(input.bulk)) {
      const projects = await handleLandviewDataAction("getProjects", {}, user) as Row[];
      return { bulk:true, projects:Object.fromEntries(projects.map(p=>[p.Project_ID,{projectId:p.Project_ID,found:Boolean(p.Drive_Folder_URL),projectFolderId:p.Drive_Folder_ID||"",projectFolderName:p.Project_Name||p.Project_ID,projectFolderUrl:p.Drive_Folder_URL||"",folders:[]}])) };
    }
    const p = await handleLandviewDataAction("getProject", input, user) as Row;
    return { projectId:p.Project_ID, found:Boolean(p.Drive_Folder_URL), projectFolderId:p.Drive_Folder_ID||"", projectFolderName:p.Project_Name||p.Project_ID, projectFolderUrl:p.Drive_Folder_URL||"", folders:[] };
  }
  return undefined;
}

export async function GET(request: NextRequest) {
  const action = text(request.nextUrl.searchParams.get("action"), 80);
  const input = Object.fromEntries(request.nextUrl.searchParams.entries());
  try {
    if (action === "health") return ok({ ok:true, backend:"supabase" });
    if (action === "getPublicTeam") {
      const rows=await selectRows("employees",{filters:{public_display:true},order:"display_order:asc",limit:1000});
      return ok(rows.map(r=>({Name:r.name||"",Position:r.public_title||r.designation||"",Department:r.department||"",Bio:r.public_bio||"",Photo_URL:r.photo_url||"",LinkedIn_URL:r.linkedin_url||"",Display_Order:r.display_order??0})));
    }
    const user = await requireUser(request);
    if (action === "getSession") return ok({ authenticated:true, user, backend:"supabase-auth" }, { "X-Landview-Auth":"supabase" });
    const extra = await extraGet(request, action, input, user);
    if (extra !== undefined) return ok(await extra);
    return ok(await handleLandviewDataAction(action, input, user));
  } catch (error) { return fail(error); }
}

export async function POST(request: NextRequest) {
  if (!originAllowed(request)) return fail(new Error("Invalid request origin."), 403);
  let input: Row;
  try { input = await request.json(); } catch { return fail(new Error("Invalid request."), 400); }
  const action = text(input.action, 80);
  try {
    if (action === "login") {
      const data=await supabaseAuthGateway<{accessToken:string;refreshToken:string;user:Row}>("signIn", { userId:text(input.userId||input.username), password:String(input.password||"") });
      const maxAge=sessionMaxAge(false); const response=ok({user:data.user,remembered:false,backend:"supabase-auth"},{"X-Landview-Auth":"supabase"});
      response.cookies.set(SESSION_COOKIE,data.accessToken,cookieOptions(maxAge)); response.cookies.set(REFRESH_COOKIE,data.refreshToken,cookieOptions(maxAge)); response.cookies.set(QUICK_USER_COOKIE,signWorkspaceUser(data.user),cookieOptions(maxAge)); return response;
    }
    if (action === "logout") {
      const token=request.cookies.get(SESSION_COOKIE)?.value||""; if(token) await revokeLocalSession(token); const response=ok({loggedOut:true}); clearAuth(response); return response;
    }
    if (QUICK_ACTIONS.has(action)) {
      if (action === "quickPinStatus") return ok({ configured:false, trusted:false, backend:"supabase-auth" });
      throw new Error("Quick PIN access has been retired during the Supabase Auth cutover. Use your LAND VIEW password.");
    }
    const user = await requireUser(request);
    const accessToken = request.cookies.get(SESSION_COOKIE)?.value || "";
    if (action === "createUser") { await requireAdmin(request); return ok(await supabaseAuthGateway("createUser", { accessToken, user: input.user || input })); }
    if (action === "resetUserPassword") { await requireAdmin(request); return ok(await supabaseAuthGateway("adminResetPassword", { accessToken, userId:text(input.userId) })); }
    if (action === "changeOwnPassword") return ok(await supabaseAuthGateway("changeOwnPassword", { accessToken, currentPassword:String(input.currentPassword||""), newPassword:String(input.newPassword||input.password||"") }));
    if (action === "createPermission") {
      await requireAdmin(request); const r=(input.permission&&typeof input.permission==="object"?input.permission:input) as Row;
      const row={permission_id:text(r.Permission_ID)||randomCode("ACL"),user_key:text(r.User_ID||r.userId),role:text(r.Role||r.role)||null,permission:text(r.Permission||r.permission),status:text(r.Status||r.status)||"Active",value:text(r.Value||r.value)||null,notes:text(r.Notes||r.notes)||null,created_at:text(r.Created_At||r.createdAt)||new Date().toISOString(),created_by:text(r.Created_By||r.createdBy)||userIdOf(user)};
      if(!row.user_key||!row.permission)throw new Error("User ID and permission are required."); await upsertRows("app_permissions",row,"permission_id"); return ok(permissionLegacy(row));
    }
    if ((action === "createErpRecord" || action === "updateErpRecord") && text(input.module).toLowerCase() === "proposalsv2") return ok(await proposalAction(user,input));
    if ((action === "createErpRecord" || action === "updateErpRecord") && text(input.module).toLowerCase() === "quotations") {
      const r=(input.record&&typeof input.record==="object"?input.record:input) as Row; const id=text(input.id||r.Quotation_ID)||randomCode("QT"); const row={quotation_code:id,client_code:text(r.Client_ID)||null,project_code:normalizeProjectCode(r.Project_ID)||null,quotation_date:text(r.Quotation_Date)||new Date().toISOString().slice(0,10),valid_until:text(r.Valid_Until)||null,description:text(r.Description)||null,amount:num(r.Amount),status:text(r.Status)||"Draft",notes:text(r.Notes)||null,created_at:new Date().toISOString(),created_by:userIdOf(user)}; const saved=action==="updateErpRecord"?await updateRows("quotations",{quotation_code:id},row):await insertRows("quotations",row); return ok(saved[0]||row);
    }
    if ((action === "createErpRecord" || action === "updateErpRecord") && text(input.module).toLowerCase() === "drawings") {
      const r=(input.record&&typeof input.record==="object"?input.record:input) as Row; const id=text(input.id||r.Drawing_ID)||randomCode("DRW"); const row={drawing_code:id,project_code:normalizeProjectCode(r.Project_ID)||null,drawing_title:text(r.Drawing_Title||r.Title)||null,discipline:text(r.Discipline)||null,revision:text(r.Revision)||null,assigned_employee_code:text(r.Assigned_Employee_ID)||null,drive_url:text(r.File_URL||r.Drive_URL)||null,status:text(r.Status)||"Pending",submitted_at:text(r.Submitted_At)||new Date().toISOString(),approved_at:text(r.Approved_At)||null,approved_by:text(r.Approved_By)||null,comments:text(r.Comments)||null,created_at:new Date().toISOString(),created_by:userIdOf(user)}; const saved=action==="updateErpRecord"?await updateRows("drawing_submissions",{drawing_code:id},row):await insertRows("drawing_submissions",row); return ok(saved[0]||row);
    }
    if (action === "uploadProjectServiceFile") throw new Error("Google Drive upload has been disconnected. Move this feature to Supabase Storage before using it again.");
    return ok(await handleLandviewDataAction(action,input,user));
  } catch (error) { return fail(error); }
}
