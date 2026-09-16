import { NextRequest, NextResponse } from "next/server";
import { GET as legacyGET, POST as legacyPOST } from "../landview/route";
import { QUICK_USER_COOKIE, REMEMBER_COOKIE, SESSION_COOKIE, requireLocalSession, revokeLocalSession } from "@/lib/local-session";
import {
  handleLandviewDataAction,
  normalizeProjectCode,
  roleOf,
  selectRows,
  SUPABASE_DATA_GET_ACTIONS,
  SUPABASE_DATA_POST_ACTIONS,
  supabaseGateway,
  upsertRows,
} from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GOOGLE_SIDE_EFFECT_ACTIONS = new Set([
  "createProject", "deleteProject", "createEmployee", "updateEmployee", "deleteEmployee",
]);
const GOOGLE_GET_ACTIONS = new Set([
  "getProjectDriveFolder", "getProjectServiceFolders", "getUsers", "getPermissions",
  "getModularDatabaseStatus", "getVisitorAnalytics",
]);
const GOOGLE_POST_ACTIONS = new Set([
  "login", "createUser", "resetUserPassword", "changeOwnPassword", "createPermission",
  "uploadProjectServiceFile", "syncProjectDriveFolders", "initializeRoleSecurity",
  "migrateModularDatabases", "disableModularDatabases", "setQuickPin", "clearQuickPin",
  "quickPinLogin", "quickLock", "terminateSession",
]);
const ADMIN_ONLY_DATA_WRITES = new Set([
  "createProject", "updateProject", "deleteProject", "updateProjectEmployees",
  "createEmployee", "updateEmployee", "deleteEmployee", "saveBill", "createBill",
  "initializeErpSheets",
]);
const FINANCE_WRITES = new Set(["savePayment", "createPayment", "reviewChairmanPendingApproval"]);

function originAllowed(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return host === "app.landview.com.bd" || host === "localhost" || host === "127.0.0.1" || host.endsWith(".vercel.app");
  } catch { return false; }
}
function numberOf(value: unknown) {
  const n = Number(String(value ?? "").replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function ok(data: unknown) {
  return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "private, no-store, max-age=0", "X-Landview-Data": "supabase" } });
}
function statusForError(message: string) {
  if (/session|authentication|unauthorized/i.test(message)) return 401;
  if (/access|permission/i.test(message)) return 403;
  if (/not found/i.test(message)) return 404;
  return 502;
}
function sheet(tab: string, headers: string[], rows: unknown[][], totals: Record<string, unknown> = {}) {
  return {
    tab,
    tabs: ["Summary","File List","Design Bill","Design Deposit","Supervision Bill","S Deposit","Others Bill","Others Bill Deposit","Bills","Payments","Invoices","Expenses","Accounts","Transactions","Workflow"],
    headers,
    rows: rows.map((row) => row.map((cell) => String(cell ?? ""))),
    totals: { gross:0, discount:0, billed:0, paid:0, due:0, projects:0, ...totals },
    url: "",
    updatedAt: new Date().toISOString(),
  };
}

async function financeTransactionsSheet() {
  const rows = await selectRows("transactions", { order: "transaction_date:asc", limit: 5000 });
  const headers = ["Transaction_ID","Transaction_Date","Transaction_Type","Source_Type","Source_ID","Project_ID","Account","Category","Description","Debit","Credit","Reference_No","Status","Direction","Amount","Payment_Method","Created_By","Created_At"];
  const values = rows.map((row) => [row.transaction_code||"",row.transaction_date||"",row.transaction_type||"",row.source_type||"",row.source_id||"",row.project_code_snapshot||"",row.account_snapshot||row.account_code_snapshot||"",row.category||"",row.description||"",row.debit??0,row.credit??0,row.reference_no||"",row.status||"POSTED",row.direction||"",row.amount??Math.max(numberOf(row.debit),numberOf(row.credit)),row.payment_method||"",row.source_created_by||"",row.source_created_at||row.created_at||""]);
  return sheet("Transactions", headers, values, {
    paid: rows.reduce((sum,row)=>sum+numberOf(row.credit),0),
    due: rows.reduce((sum,row)=>sum+numberOf(row.debit),0),
    projects: new Set(rows.map((row)=>row.project_id).filter(Boolean)).size,
  });
}

async function financeCompatibilitySheet(tabRaw: unknown, user: Record<string, unknown>) {
  const tab = String(tabRaw || "Summary").trim() || "Summary";
  if (tab === "Transactions") return financeTransactionsSheet();
  if (["Workflow","Design Bill","Design Deposit","Supervision Bill","S Deposit","Others Bill","Others Bill Deposit"].includes(tab)) {
    return handleLandviewDataAction("getFinanceSheet", { tab }, user);
  }
  if (tab === "Summary") {
    const book = await handleLandviewDataAction("getBillingBook", {}, user) as any;
    const rows = (Array.isArray(book?.projects) ? book.projects : []).map((p:any)=>[
      p.projectId||"",p.clientName||"",p.projectName||"",p.billed??p.gross??0,p.paid??0,p.due??0,numberOf(p.due)>0.009?"DUE":numberOf(p.billed)>0?"FULL PAID":""
    ]);
    return sheet(tab,["FILE ID","Client Name","Project Name","Total Bill","Total Paid","Total Due","Status"],rows,{gross:book?.totals?.gross??0,discount:book?.totals?.discount??0,billed:book?.totals?.billed??0,paid:book?.totals?.paid??0,due:book?.totals?.due??0,projects:rows.length});
  }
  if (tab === "File List") {
    const projects = await handleLandviewDataAction("getProjects", {}, user) as any[];
    return sheet(tab,["FILE ID","Client Name","Address","Phone","Floor/Story","Build Type","Land Area"],projects.map((p:any)=>[p.Project_ID||"",p.Client_Name||"",p.Location||"",p.Phone_Number||"",p.Floors||"",p.Project_Type||"",p.Plot_Area||""]),{projects:projects.length});
  }
  if (tab === "Accounts") {
    const rows = await selectRows("accounts", { order:"account_name:asc", limit:1000 });
    return sheet(tab,["Account_ID","Account_Name","Account_Type","Opening_Balance","Current_Balance","Currency","Status","Notes"],rows.map((r:any)=>[r.account_code||"",r.account_name||"",r.account_type||"",r.opening_balance??0,r.current_balance_snapshot??r.opening_balance??0,r.currency||"BDT",r.status||"",r.notes||""]));
  }
  if (tab === "Expenses") {
    const rows = await selectRows("expenses", { order:"expense_date:desc", limit:5000 });
    return sheet(tab,["Expense_ID","Expense_Date","Project_ID","Category","Description","Amount","Payment_Method","Reference","Status","Created_By"],rows.map((r:any)=>[r.expense_code||"",r.expense_date||"",r.file_id||"",r.category||"",r.description||"",r.amount??0,r.payment_method||"",r.reference||r.reference_no||"",r.status||r.approval_status||"",r.source_created_by||""]));
  }
  if (tab === "Payments") {
    const rows = await handleLandviewDataAction("getPayments", {}, user) as any[];
    return sheet(tab,["Payment_ID","Project_ID","Payment_Date","Amount","Payment_Method","Payment_For","Approval_Status","Reference_No"],rows.map((r:any)=>[r.Payment_ID||"",r.Project_ID||"",r.Payment_Date||"",r.Amount??0,r.Payment_Method||"",r.Payment_For||r.Income_Category||"",r.Approval_Status||"",r.Reference_No||""]),{paid:rows.reduce((s:any,r:any)=>s+numberOf(r.Amount),0)});
  }
  if (tab === "Invoices") {
    const rows = await handleLandviewDataAction("getInvoices", {}, user) as any[];
    return sheet(tab,["Invoice_ID","Project_ID","Invoice_Date","Invoice_No","Total_Amount","Paid_Amount","Due_Amount","Status","PDF_URL"],rows.map((r:any)=>[r.Invoice_ID||"",r.Project_ID||"",r.Invoice_Date||r.Issue_Date||"",r.Invoice_No||"",r.Total_Amount??r.Amount??0,r.Paid_Amount??0,r.Due_Amount??0,r.Status||"",r.PDF_URL||""]));
  }
  if (tab === "Bills") {
    const rows = await handleLandviewDataAction("getBillingRecords", {}, user) as any[];
    return sheet(tab,["Bill_ID","Project_ID","Bill_Date","Category","Description","Amount","Discount","Net_Amount","Status"],rows.map((r:any)=>[r.Bill_ID||"",r.Project_ID||"",r.Bill_Date||"",r.Billing_Category||r.Category||"",r.Description||"",r.Amount??0,r.Discount??0,r.Net_Amount??0,r.Status||""]));
  }
  throw new Error(`Finance tab ${tab} is not available in Supabase.`);
}

async function syncProvisionedRecord(action: string, input: Record<string, unknown>, sourceData: unknown) {
  const source = sourceData && typeof sourceData === "object" ? sourceData as Record<string, unknown> : {};
  if (action === "createProject") return supabaseGateway("syncProject", { record: { ...input, ...source } });
  if (action === "deleteProject") return supabaseGateway("deleteProject", { projectId: input.projectId || input.Project_ID });
  if (action === "createEmployee" || action === "updateEmployee") return supabaseGateway("syncEmployee", { record: { ...input, ...source } });
  if (action === "deleteEmployee") return supabaseGateway("deleteEmployee", { employeeId: input.employeeId || input.Employee_ID });
  return null;
}

async function mirrorInvoice(sourceData: unknown, input: Record<string, unknown>, user: Record<string, unknown>) {
  const source = sourceData && typeof sourceData === "object" ? sourceData as Record<string, any> : {};
  const invoice = source.invoice && typeof source.invoice === "object" ? source.invoice as Record<string, any> : {};
  const invoiceCode = String(source.invoiceId || invoice.Invoice_ID || invoice.Invoice_No || "").trim();
  const projectCode = normalizeProjectCode(source.projectId || input.projectId || input.Project_ID);
  if (!invoiceCode || !projectCode) return sourceData;
  const projects = await selectRows("projects", { filters: { project_code: projectCode }, limit: 1 });
  const project = projects[0];
  if (!project) return sourceData;
  const totalBill = numberOf(source.totalBill ?? invoice.Total_Bill ?? invoice.Amount);
  const totalPaid = numberOf(source.totalPaid ?? invoice.Total_Paid ?? invoice.Paid_Amount);
  const due = numberOf(source.due ?? invoice.Due ?? Math.max(0, totalBill - totalPaid));
  await upsertRows("invoices", {
    invoice_code: invoiceCode, invoice_no: String(invoice.Invoice_No || invoiceCode), project_id: project.id,
    issue_date: String(invoice.Issue_Date || new Date().toISOString().slice(0, 10)), amount: totalBill,
    status: due > 0.009 ? "OPEN" : "PAID", paid_amount_snapshot: totalPaid, due_amount_snapshot: due,
    pdf_url: String(source.pdfUrl || invoice.PDF_URL || "") || null, drive_file_id: String(source.fileId || invoice.File_ID || "") || null,
    project_name_snapshot: String(source.projectName || project.project_name || "") || null, client_name_snapshot: String(source.clientName || project.client_name_snapshot || "") || null,
    total_bill_snapshot: totalBill, total_paid_snapshot: totalPaid, pdf_file_id: String(source.fileId || invoice.File_ID || "") || null,
    download_url: String(source.downloadUrl || invoice.Download_URL || "") || null, invoice_folder_url: String(source.folderUrl || invoice.Folder_URL || "") || null,
    source_created_by: String(user.userId || user.User_ID || user.username || user.Username || "LAND VIEW"), source_created_at: new Date().toISOString(), source_updated_at: new Date().toISOString(),
  }, "invoice_code");
  return sourceData;
}

function clearSessionCookies(response: NextResponse) {
  const options = { httpOnly:true, secure:process.env.NODE_ENV === "production", sameSite:"lax" as const, path:"/", maxAge:0 };
  response.cookies.set(SESSION_COOKIE,"",options);
  response.cookies.set(QUICK_USER_COOKIE,"",options);
  response.cookies.set(REMEMBER_COOKIE,"",options);
}

export async function GET(request: NextRequest) {
  const action = String(request.nextUrl.searchParams.get("action") || "").trim();
  if (action === "health") {
    try { return ok(await supabaseGateway("health")); }
    catch (error) { return NextResponse.json({success:false,error:error instanceof Error?error.message:"Supabase health check failed."},{status:503}); }
  }
  if (GOOGLE_GET_ACTIONS.has(action)) return legacyGET(request);
  if (action !== "getSession" && !SUPABASE_DATA_GET_ACTIONS.has(action)) {
    return NextResponse.json({ success:false, error:`Unsupported LAND VIEW read action: ${action}` }, { status:400 });
  }

  try {
    const user = await requireLocalSession(request);
    if (!user) return NextResponse.json({ success:false, error:"Session expired." }, { status:401 });
    if (action === "getSession") return ok({ authenticated:true, user, remembered:request.cookies.get(REMEMBER_COOKIE)?.value === "1", backend:"supabase" });
    const input: Record<string, unknown> = {};
    request.nextUrl.searchParams.forEach((value, key) => { if (key !== "action") input[key] = value; });
    if (action === "getFinanceSheet") return ok(await financeCompatibilitySheet(input.tab, user));
    return ok(await handleLandviewDataAction(action, input, user));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("LAND VIEW Supabase read failed", { action, message: message.slice(0,220) });
    return NextResponse.json({ success:false, error:message }, { status:statusForError(message), headers:{"Cache-Control":"no-store"} });
  }
}

export async function POST(request: NextRequest) {
  const copy = request.clone();
  const input = await copy.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(input.action || "").trim();
  if (!originAllowed(request)) return NextResponse.json({ success:false, error:"Invalid request origin." }, { status:403 });

  if (action === "logout") {
    const token = request.cookies.get(SESSION_COOKIE)?.value || "";
    if (token) await revokeLocalSession(token).catch(() => undefined);
    const response = NextResponse.json({ success:true, data:{ loggedOut:true, backend:"supabase" } }, { headers:{"Cache-Control":"no-store"} });
    clearSessionCookies(response);
    return response;
  }
  if (GOOGLE_POST_ACTIONS.has(action)) return legacyPOST(request);

  const isInvoiceGeneration = action === "createInvoice";
  const isWorkflowCompat = action === "getFinanceSheet" && String(input.tab || "").trim() === "Workflow" && ["create","update"].includes(String(input.workflowOp || "").trim().toLowerCase());
  if (!SUPABASE_DATA_POST_ACTIONS.has(action) && !isInvoiceGeneration && !isWorkflowCompat) {
    return NextResponse.json({ success:false, error:`Unsupported LAND VIEW write action: ${action}` }, { status:400 });
  }

  try {
    const user = await requireLocalSession(request);
    if (!user) return NextResponse.json({ success:false, error:"Session expired." }, { status:401 });
    const role = roleOf(user);
    if ((ADMIN_ONLY_DATA_WRITES.has(action) || isInvoiceGeneration) && !["admin","manager","accounts"].includes(role)) {
      return NextResponse.json({ success:false, error:"Management access is required." }, { status:403 });
    }
    if (FINANCE_WRITES.has(action) && !["admin","manager","accounts","employee"].includes(role)) {
      return NextResponse.json({ success:false, error:"Finance access is required." }, { status:403 });
    }

    if (isWorkflowCompat) {
      const op=String(input.workflowOp||"").trim().toLowerCase();
      const id=String(input.id||input.Task_ID||"").trim();
      return ok(await handleLandviewDataAction(op === "create" ? "createErpRecord" : "updateErpRecord", { module:"tasks", ...(op === "update" ? {id}:{}), ...input }, user));
    }
    if (isInvoiceGeneration) {
      const legacy = await legacyPOST(request);
      const json = await legacy.clone().json().catch(() => null);
      if (!legacy.ok || !json?.success) return legacy;
      await mirrorInvoice(json.data, input, user);
      return ok(json.data);
    }
    if (GOOGLE_SIDE_EFFECT_ACTIONS.has(action)) {
      const legacy = await legacyPOST(request);
      const json = await legacy.clone().json().catch(() => null);
      if (!legacy.ok || !json?.success) return legacy;
      const synced = await syncProvisionedRecord(action, input, json.data);
      return ok(synced ?? json.data);
    }
    return ok(await handleLandviewDataAction(action, input, user));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("LAND VIEW Supabase write failed", { action, message:message.slice(0,220) });
    return NextResponse.json({ success:false, error:message }, { status:statusForError(message), headers:{"Cache-Control":"no-store"} });
  }
}
