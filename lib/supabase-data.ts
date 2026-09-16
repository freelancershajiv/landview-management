import { getVercelOidcToken } from "@vercel/oidc";

const DATA_URL = "https://jupzgjlizxivhbmuigua.supabase.co/functions/v1/landview-data";
const AUDIENCE = "https://supabase.landview.internal";

type Row = Record<string, any>;
export type WorkspaceUser = Record<string, unknown> | null | undefined;

function text(value: unknown) { return String(value ?? "").trim(); }
function num(value: unknown) { const n = Number(text(value).replace(/,/g, "").replace(/[^0-9.-]/g, "")); return Number.isFinite(n) ? n : 0; }
function bool(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  const v = text(value).toLowerCase();
  if (!v) return fallback;
  return ["true","1","yes","y","active","approved"].includes(v);
}
function pick(record: Row, ...keys: string[]) {
  for (const key of keys) if (record?.[key] !== undefined && record?.[key] !== null && text(record[key]) !== "") return record[key];
  return "";
}
function code(prefix: string) { return `${prefix}-${crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`; }
export function normalizeProjectCode(value: unknown) {
  const raw = text(value).toUpperCase();
  const digits = raw.replace(/\D/g, "");
  return digits ? `LV-${Number(digits)}` : raw;
}
export function roleOf(user: WorkspaceUser) { return text((user as Row)?.role || (user as Row)?.Role).toLowerCase(); }
export function employeeCodeOf(user: WorkspaceUser) { return text((user as Row)?.employeeId || (user as Row)?.Employee_ID || (user as Row)?.userId || (user as Row)?.User_ID); }

export async function supabaseGateway(action: string, input: Row = {}, timeoutMs = 15000) {
  const oidc = await getVercelOidcToken({ audience: AUDIENCE });
  if (!oidc) throw new Error("Vercel OIDC token is unavailable.");
  const response = await fetch(DATA_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${oidc}`, "content-type": "application/json" },
    body: JSON.stringify({ action, ...input }),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || `Supabase data service returned HTTP ${response.status}.`));
  return json.data;
}

export async function selectRows(table: string, options: Row = {}) {
  return (await supabaseGateway("selectRows", { table, ...options })) as Row[];
}
export async function upsertRows(table: string, rows: Row | Row[], onConflict?: string) {
  return (await supabaseGateway("upsertRows", { table, rows: Array.isArray(rows) ? rows : [rows], onConflict })) as Row[];
}
export async function insertRows(table: string, rows: Row | Row[]) {
  return (await supabaseGateway("insertRows", { table, rows: Array.isArray(rows) ? rows : [rows] })) as Row[];
}
export async function updateRows(table: string, filters: Row, changes: Row) {
  return (await supabaseGateway("updateRows", { table, filters, changes })) as Row[];
}
export async function deleteRows(table: string, filters: Row) {
  return (await supabaseGateway("deleteRows", { table, filters })) as Row[];
}

function projectLegacy(row: Row, billed?: number) {
  return {
    Project_ID: row.project_code, Project_Name: row.project_name || "", Client_Name: row.client_name_snapshot || "", Phone_Number: row.phone_number_snapshot || "",
    Project_Type: row.project_type || "", Location: row.location || "", Location_Tag: row.location_tag || "", Plot_Area: row.plot_area ?? "", Floors: row.floors ?? "",
    Start_Date: row.start_date || "", Design_Bill: billed ?? num(row.design_bill), Status: row.status || "", Notes: row.notes || "",
    Drive_Folder_ID: row.drive_folder_id || "", Drive_Folder_URL: row.drive_folder_url || "", Documents_Folder_ID: row.documents_folder_id || "", Documents_Folder_URL: row.documents_folder_url || "",
    Invoices_Folder_ID: row.invoices_folder_id || "", Invoices_Folder_URL: row.invoices_folder_url || "", Client_User_ID: row.client_user_id || "", Client_Username: row.client_username || "",
    Public_Display: Boolean(row.public_display), Public_Project_Title: row.public_project_title || "", Public_Description: row.public_description || "", Project_Category: row.project_category || "",
    Project_Area: row.project_area_text || "", Number_of_Stories: row.number_of_stories_text || "", Cover_Image_URL: row.cover_image_url || "", Gallery_Images: row.gallery_images || "",
    Public_Services: row.public_services || "", Completion_Year: row.completion_year || "", Public_Display_Order: row.public_display_order ?? 0,
    Created_Date: row.created_at || "", Updated_At: row.updated_at || ""
  };
}
function employeeLegacy(row: Row) {
  return {
    Employee_ID: row.employee_code, Employee_Name: row.name || "", Name: row.name || "", Phone: row.phone_number || "", Phone_Number: row.phone_number || "", Email: row.email || "",
    Position: row.designation || "", Designation: row.designation || "", Department: row.department || "", Joining_Date: row.joining_date || "", Status: row.status || "",
    Public_Display: Boolean(row.public_display), Public_Title: row.public_title || "", Public_Bio: row.public_bio || "", Photo_URL: row.photo_url || "", LinkedIn_URL: row.linkedin_url || "",
    Display_Order: row.display_order ?? 0, Created_At: row.created_at || "", Updated_At: row.updated_at || ""
  };
}
function billLegacy(row: Row, projectCode = "") {
  return {
    Bill_ID: row.bill_code, Project_ID: projectCode, Bill_Date: row.bill_date || "", Billing_Category: row.billing_category || "", Category: row.category || "",
    Description: row.description || "", Amount: num(row.amount), Discount: num(row.discount), Net_Amount: num(row.net_amount ?? (num(row.amount)-num(row.discount))), Status: row.status || "",
    Notes: row.notes || "", Created_Via: row.created_via || "", Created_By: row.source_created_by || "", Created_At: row.source_created_at || row.created_at || "",
    Idempotency_Key: row.idempotency_key || "", Unit_Price: row.unit_price ?? "", Quantity: row.quantity ?? ""
  };
}
function paymentLegacy(row: Row, projectCode = "") {
  return {
    Payment_ID: row.payment_code, Project_ID: projectCode, Payment_Date: row.payment_date || "", Amount: num(row.amount), Payment_Method: row.payment_method || "", Reference_No: row.reference_no || "",
    Notes: row.notes || "", Deposit_Account: row.deposit_account || "", Payment_For: row.payment_for || "", Income_Category: row.income_category || "", Transaction_Type: row.transaction_type || "",
    Affects_Business_Balance: row.affects_business_balance !== false, Received_From: row.received_from || "", Received_By: row.received_by || "", Receipt_URL: row.receipt_url || "",
    Approval_Status: row.approval_status || "", Approved_By: row.approved_by || "", Approved_At: row.approved_at || "", Reviewed_By: row.reviewed_by || "", Reviewed_At: row.reviewed_at || "",
    Review_Notes: row.review_notes || "", Status: row.status || "", Decision_Notes: row.decision_notes || "", Created_By: row.source_created_by || "", Created_At: row.source_created_at || row.created_at || "",
    Idempotency_Key: row.idempotency_key || ""
  };
}
function documentLegacy(row: Row, projectCode = "") {
  return { Document_ID: row.document_code || row.id, Project_ID: projectCode, Title: row.title || "", Document_Type: row.document_type || "", File_ID: row.drive_file_id || "", File_URL: row.drive_file_url || "", Document_Date: row.document_date || "", Client_Visible: Boolean(row.client_visible), Created_At: row.created_at || "" };
}
function visitLegacy(row: Row, projectCode = "", employeeCode = "") {
  return { Visit_ID: row.visit_code, Project_ID: projectCode, Employee_ID: employeeCode, Visit_Date: row.visit_date || "", Purpose: row.visit_purpose || row.purpose || "", Visited_By: row.visited_by || "", Observations: row.observations || "", Action_Required: row.action_required || "", Status: row.status || "", Notes: row.notes || "", Created_At: row.created_at || "" };
}
function taskLegacy(row: Row, projectCode = "", employeeCode = "") {
  return { Task_ID: row.task_code, Project_ID: projectCode, Task_Title: row.task_title || "", Description: row.description || "", Assigned_Employee_ID: employeeCode, Priority: row.priority || "", Status: row.status || "", Start_Date: row.start_date || "", Due_Date: row.due_date || "", Completed_At: row.completed_at || "", Progress: row.progress ?? 0, Project_Name: row.project_name_snapshot || "", Created_At: row.source_created_at || row.created_at || "", Updated_At: row.source_updated_at || row.updated_at || "" };
}
function expenseLegacy(row: Row, projectCode = "") {
  return { Expense_ID: row.expense_code, Project_ID: projectCode || row.file_id || "", Expense_Date: row.expense_date || "", Category: row.category || "", Description: row.description || "", Amount: num(row.amount), Requested_By: row.requested_by_code || "", Approval_Status: row.approval_status || "", Approved_By: row.approved_by_code || "", Approved_At: row.approved_at || "", Paid_To: row.paid_to || "", Payment_Method: row.payment_method || "", Reference_No: row.reference_no || row.reference || "", Receipt_URL: row.receipt_url || "", Notes: row.notes || "", Status: row.status || "", Reviewed_By: row.reviewed_by_code || "", Reviewed_At: row.reviewed_at || "", Review_Notes: row.review_notes || "", Created_At: row.source_created_at || row.created_at || "" };
}
function clientLegacy(row: Row) { return { Client_ID: row.client_code, Client_Name: row.name || "", Phone_Number: row.phone_number || "", Email: row.email || "", Address: row.address || "", Status: row.status || "", Client_Type: row.client_type || "", Notes: row.notes || "" }; }

function effectiveBill(row: Row) { return !["void","voided","cancelled","canceled","rejected"].includes(text(row.status).toLowerCase()); }
function effectivePayment(row: Row) {
  if (text(row.transaction_type).toLowerCase() === "personal income" || row.affects_business_balance === false) return false;
  const status = text(row.approval_status || row.status).toLowerCase().replace(/[_-]+/g," ");
  return !status || ["approved","received","paid","verified","complete","completed","full paid","fully paid","posted"].includes(status);
}
function categoryOf(row: Row) {
  const raw = text(row.billing_category || row.category || row.payment_for || row.income_category || row.description).toLowerCase();
  if (/supervision/.test(raw)) return "Supervision Bill";
  if (/other|soil|survey|municipality|file pass/.test(raw)) return "Other Services Bill";
  return "Engineering Bill";
}

async function projectRow(projectId: unknown) {
  const code = normalizeProjectCode(projectId);
  const rows = await selectRows("projects", { filters: { project_code: code }, limit: 1 });
  if (!rows.length) throw new Error("Project not found.");
  return rows[0];
}
async function employeeRow(employeeId: unknown) {
  const code = text(employeeId);
  const rows = await selectRows("employees", { filters: { employee_code: code }, limit: 1 });
  if (!rows.length) throw new Error("Employee not found.");
  return rows[0];
}
async function projectMaps() {
  const projects = await selectRows("projects", { limit: 5000 });
  return { projects, byId: new Map(projects.map(p => [p.id, p.project_code])) };
}
async function employeeMaps() {
  const employees = await selectRows("employees", { limit: 1000 });
  return { employees, byId: new Map(employees.map(e => [e.id, e.employee_code])) };
}
async function billTotals() {
  const bills = (await selectRows("bills", { limit: 5000 })).filter(effectiveBill);
  const map = new Map<string, number>();
  for (const b of bills) map.set(b.project_id, (map.get(b.project_id) || 0) + num(b.net_amount ?? (num(b.amount)-num(b.discount))));
  return { bills, map };
}

function projectFromInput(input: Row, existing: Row = {}) {
  const projectId = normalizeProjectCode(pick(input,"Project_ID","projectId","project_id","project_code") || existing.project_code);
  if (!projectId) throw new Error("Project_ID is required and must use the LV-### format.");
  const result: Row = { ...existing, project_code: projectId, updated_at: new Date().toISOString() };
  const mappings: Array<[string,string[]]> = [
    ["project_name",["Project_Name","projectName","project_name"]],["client_name_snapshot",["Client_Name","clientName","client_name_snapshot"]],["phone_number_snapshot",["Phone_Number","phoneNumber","phone_number_snapshot"]],
    ["project_type",["Project_Type","projectType","project_type"]],["location",["Location","location"]],["location_tag",["Location_Tag","LocationTag","location_tag"]],["start_date",["Start_Date","startDate","start_date"]],
    ["status",["Status","status"]],["notes",["Notes","notes"]],["drive_folder_id",["Drive_Folder_ID","driveFolderId","drive_folder_id"]],["drive_folder_url",["Drive_Folder_URL","driveFolderUrl","drive_folder_url"]],
    ["documents_folder_id",["Documents_Folder_ID","documents_folder_id"]],["documents_folder_url",["Documents_Folder_URL","documents_folder_url"]],["invoices_folder_id",["Invoices_Folder_ID","invoices_folder_id"]],["invoices_folder_url",["Invoices_Folder_URL","invoices_folder_url"]],
    ["client_user_id",["Client_User_ID","client_user_id"]],["client_username",["Client_Username","client_username"]],["public_project_title",["Public_Project_Title","public_project_title"]],["public_description",["Public_Description","public_description"]],
    ["project_category",["Project_Category","project_category"]],["project_area_text",["Project_Area","project_area_text"]],["number_of_stories_text",["Number_of_Stories","number_of_stories_text"]],["cover_image_url",["Cover_Image_URL","cover_image_url"]],
    ["gallery_images",["Gallery_Images","gallery_images"]],["public_services",["Public_Services","public_services"]],["completion_year",["Completion_Year","completion_year"]]
  ];
  for (const [dest, keys] of mappings) { const value = pick(input,...keys); if (text(value)) result[dest] = value; }
  const plot = pick(input,"Plot_Area","plotArea","plot_area"); if (text(plot)) result.plot_area = num(plot);
  const floors = pick(input,"Floors","floors"); if (text(floors)) result.floors = Math.trunc(num(floors));
  const design = pick(input,"Design_Bill","designBill","design_bill"); if (text(design)) result.design_bill = num(design);
  const display = pick(input,"Public_Display","public_display"); if (text(display) || typeof display === "boolean") result.public_display = bool(display);
  const order = pick(input,"Public_Display_Order","public_display_order"); if (text(order)) result.public_display_order = Math.trunc(num(order));
  if (!result.status) result.status = "Active";
  return result;
}
function employeeFromInput(input: Row, existing: Row = {}) {
  const employeeCode = text(pick(input,"Employee_ID","employeeId","employee_code") || existing.employee_code);
  if (!employeeCode) throw new Error("Employee_ID is required.");
  const result: Row = { ...existing, employee_code: employeeCode, updated_at: new Date().toISOString() };
  const mappings: Array<[string,string[]]> = [
    ["name",["Employee_Name","Name","employeeName","name"]],["phone_number",["Phone","Phone_Number","phone_number"]],["email",["Email","email"]],["designation",["Position","Designation","designation"]],
    ["department",["Department","department"]],["joining_date",["Joining_Date","joining_date"]],["status",["Status","status"]],["public_title",["Public_Title","public_title"]],["public_bio",["Public_Bio","public_bio"]],
    ["photo_url",["Photo_URL","photo_url"]],["linkedin_url",["LinkedIn_URL","linkedin_url"]]
  ];
  for (const [dest, keys] of mappings) { const value = pick(input,...keys); if (text(value)) result[dest] = value; }
  const pub = pick(input,"Public_Display","public_display"); if (text(pub) || typeof pub === "boolean") result.public_display = bool(pub);
  const order = pick(input,"Display_Order","display_order"); if (text(order)) result.display_order = Math.trunc(num(order));
  if (!result.name) throw new Error("Employee name is required.");
  if (!result.status) result.status = "Active";
  return result;
}

async function getProjectBilling(projectId: unknown) {
  const p = await projectRow(projectId);
  const [bills, payments] = await Promise.all([
    selectRows("bills", { filters: { project_id: p.id }, order: "bill_date:asc", limit: 5000 }),
    selectRows("payments", { filters: { project_id: p.id }, order: "payment_date:asc", limit: 5000 })
  ]);
  const validBills = bills.filter(effectiveBill), validPayments = payments.filter(effectivePayment);
  const totalBill = validBills.reduce((s,b)=>s+num(b.net_amount ?? (num(b.amount)-num(b.discount))),0);
  const totalPaid = validPayments.reduce((s,pay)=>s+num(pay.amount),0);
  return { project: p, projectId: p.project_code, bills: bills.map(b=>billLegacy(b,p.project_code)), payments: payments.map(pay=>paymentLegacy(pay,p.project_code)), totalBill, totalPaid, due: Math.max(0,totalBill-totalPaid) };
}

export async function handleLandviewDataAction(action: string, input: Row, user: WorkspaceUser) {
  const role = roleOf(user);
  if (action === "getDashboard") {
    const [{projects}, employees, documents, {bills,map}, payments] = await Promise.all([projectMaps(), selectRows("employees",{limit:1000}), selectRows("documents",{limit:5000}), billTotals(), selectRows("payments",{limit:5000})]);
    const validPayments = payments.filter(effectivePayment);
    const totalBill = bills.reduce((s,b)=>s+num(b.net_amount ?? (num(b.amount)-num(b.discount))),0), totalPaid = validPayments.reduce((s,p)=>s+num(p.amount),0);
    const active = projects.filter(p=>!["completed","closed","cancelled","canceled"].includes(text(p.status).toLowerCase()));
    return { user, stats: { projectCount: projects.length, activeProjectCount: active.length, employeeCount: employees.length, documentCount: documents.length, totalBill, totalPaid, pendingPayments: Math.max(0,totalBill-totalPaid) }, recentProjects: projects.sort((a,b)=>text(b.updated_at).localeCompare(text(a.updated_at))).slice(0,8).map(p=>projectLegacy(p,map.get(p.id)||0)) };
  }
  if (action === "getProjects") {
    const [{projects}, {map}] = await Promise.all([projectMaps(), billTotals()]);
    if (role === "employee") {
      const emp = await employeeRow(employeeCodeOf(user));
      const assignments = await selectRows("project_employees", { filters: { employee_id: emp.id, active: true }, limit: 5000 });
      const allowed = new Set(assignments.map(a=>a.project_id));
      return projects.filter(p=>allowed.has(p.id)).map(p=>projectLegacy(p,map.get(p.id)||0));
    }
    return projects.map(p=>projectLegacy(p,map.get(p.id)||0));
  }
  if (action === "getProject") {
    const p = await projectRow(input.projectId || input.Project_ID); const {map}=await billTotals(); return projectLegacy(p,map.get(p.id)||0);
  }
  if (action === "getEmployees") return (await selectRows("employees",{order:"display_order:asc",limit:1000})).map(employeeLegacy);
  if (action === "getProjectEmployees") {
    const p=await projectRow(input.projectId||input.Project_ID); const links=await selectRows("project_employees",{filters:{project_id:p.id,active:true},limit:1000});
    if(!links.length) return []; const employees=await selectRows("employees",{inFilters:{id:links.map(l=>l.employee_id)},limit:1000}); return employees.map(employeeLegacy);
  }
  if (action === "getDocuments") {
    const {byId}=await projectMaps(); let rows:Row[]; if(input.projectId){const p=await projectRow(input.projectId);rows=await selectRows("documents",{filters:{project_id:p.id},order:"created_at:desc",limit:5000});} else rows=await selectRows("documents",{order:"created_at:desc",limit:5000});
    return rows.map(r=>documentLegacy(r,byId.get(r.project_id)||""));
  }
  if (action === "getSiteVisits") {
    const [{byId}, {byId:empMap}]=await Promise.all([projectMaps(),employeeMaps()]); let rows:Row[]; if(input.projectId){const p=await projectRow(input.projectId);rows=await selectRows("site_visits",{filters:{project_id:p.id},order:"visit_date:desc",limit:5000});} else rows=await selectRows("site_visits",{order:"visit_date:desc",limit:5000});
    return rows.map(r=>visitLegacy(r,byId.get(r.project_id)||"",empMap.get(r.employee_id)||""));
  }
  if (action === "getBillingDashboard") {
    const [projects,{bills},payments]=await Promise.all([selectRows("projects",{limit:5000}),billTotals(),selectRows("payments",{limit:5000})]); const valid=payments.filter(effectivePayment); const totalBill=bills.reduce((s,b)=>s+num(b.net_amount ?? (num(b.amount)-num(b.discount))),0),totalPaid=valid.reduce((s,p)=>s+num(p.amount),0);
    return {projectCount:projects.length,billCount:bills.length,paymentCount:valid.length,totalBill,totalPaid,pending:Math.max(0,totalBill-totalPaid)};
  }
  if (action === "getProjectBilling") { const r=await getProjectBilling(input.projectId||input.Project_ID); return {projectId:r.projectId,bills:r.bills,payments:r.payments,totalBill:r.totalBill,totalPaid:r.totalPaid,due:r.due}; }
  if (action === "getBillingRecords") { const r=await getProjectBilling(input.projectId||input.Project_ID); const cat=text(input.category).toLowerCase(); return !cat?r.bills:r.bills.filter((b:Row)=>categoryOf(b).toLowerCase().includes(cat)); }
  if (action === "getPayments") {
    const {byId}=await projectMaps(); let rows:Row[]; if(input.projectId){const p=await projectRow(input.projectId);rows=await selectRows("payments",{filters:{project_id:p.id},order:"payment_date:desc",limit:5000});}else rows=await selectRows("payments",{order:"payment_date:desc",limit:5000}); return rows.map(r=>paymentLegacy(r,byId.get(r.project_id)||""));
  }
  if (action === "getInvoices") {
    const {byId}=await projectMaps(); let rows:Row[]; if(input.projectId){const p=await projectRow(input.projectId);rows=await selectRows("invoices",{filters:{project_id:p.id},order:"created_at:desc",limit:5000});}else rows=await selectRows("invoices",{order:"created_at:desc",limit:5000});
    return rows.map(r=>({Invoice_ID:r.invoice_code||r.invoice_no||r.id,Invoice_No:r.invoice_no||r.invoice_code||"",Project_ID:byId.get(r.project_id)||"",Issue_Date:r.issue_date||"",Due_Date:r.due_date||"",Amount:num(r.amount),Status:r.status||"",PDF_URL:r.pdf_url||r.download_url||"",Download_URL:r.download_url||"",File_ID:r.pdf_file_id||r.drive_file_id||"",Folder_URL:r.invoice_folder_url||"",Created_At:r.created_at||""}));
  }
  if (action === "getBillingBook") {
    const [{projects,byId},bills,payments]=await Promise.all([projectMaps(),selectRows("bills",{limit:5000}),selectRows("payments",{limit:5000})]); const pb=new Map<string,Row[]>(),pp=new Map<string,Row[]>(); for(const b of bills.filter(effectiveBill)){const a=pb.get(b.project_id)||[];a.push(b);pb.set(b.project_id,a);} for(const p of payments.filter(effectivePayment)){const a=pp.get(p.project_id)||[];a.push(p);pp.set(p.project_id,a);} const categories=new Map<string,Row>();
    const rows=projects.map(p=>{const cats:Row={};let gross=0,discount=0,paid=0;for(const b of pb.get(p.id)||[]){const c=categoryOf(b),g=num(b.amount),d=num(b.discount);gross+=g;discount+=d;cats[c]??={gross:0,discount:0,billed:0,paid:0,due:0};cats[c].gross+=g;cats[c].discount+=d;cats[c].billed+=g-d;}for(const pay of pp.get(p.id)||[]){const c=categoryOf(pay);paid+=num(pay.amount);cats[c]??={gross:0,discount:0,billed:0,paid:0,due:0};cats[c].paid+=num(pay.amount);}for(const [c,v] of Object.entries(cats) as [string,any][])v.due=Math.max(0,v.billed-v.paid);for(const [c,v] of Object.entries(cats) as [string,any][]){const t=categories.get(c)||{category:c,gross:0,discount:0,billed:0,paid:0,due:0};for(const k of ["gross","discount","billed","paid","due"])t[k]+=v[k];categories.set(c,t);}const billed=gross-discount;return{projectId:p.project_code,projectName:p.project_name||"",clientName:p.client_name_snapshot||"",gross,discount,billed,paid,due:Math.max(0,billed-paid),categories:cats};});
    const totals=rows.reduce((a,r)=>({gross:a.gross+r.gross,discount:a.discount+r.discount,billed:a.billed+r.billed,paid:a.paid+r.paid,due:a.due+r.due}),{gross:0,discount:0,billed:0,paid:0,due:0}); return {totals,categories:[...categories.values()],projects:rows,billCount:bills.filter(effectiveBill).length,paymentCount:payments.filter(effectivePayment).length};
  }
  if (action === "getChairmanPendingApprovals") {
    const {byId}=await projectMaps(); const rows=await selectRows("payments",{order:"payment_date:desc",limit:5000}); return rows.filter(r=>text(r.approval_status).toLowerCase()==="approved").map(r=>({Approval_Key:`payment:${r.payment_code}`,Source:"Payments",Source_ID:r.payment_code,Transaction_Type:r.transaction_type||"Income",Transaction_Date:r.payment_date||"",Project_ID:byId.get(r.project_id)||"",Description:r.notes||r.payment_for||"Client payment",Amount:num(r.amount),Category:r.income_category||r.payment_for||"Client Payment",Approval_Status:"Approved",Notes:r.review_notes||r.notes||"",Reviewed_By:r.reviewed_by||r.approved_by||"Master Admin",Reviewed_At:r.reviewed_at||r.approved_at||""}));
  }
  if (action === "getErpRecords") {
    const module=text(input.module).toLowerCase(); const [{byId:projectMap},{byId:empMap}]=await Promise.all([projectMaps(),employeeMaps()]);
    if(module==="clients") return (await selectRows("clients",{limit:5000})).map(clientLegacy);
    if(module==="tasks") return (await selectRows("tasks",{order:"updated_at:desc",limit:5000})).map(r=>taskLegacy(r,projectMap.get(r.project_id)||"",empMap.get(r.assigned_employee_id)||""));
    if(module==="attendance") return (await selectRows("attendance",{order:"attendance_date:desc",limit:5000})).map(r=>({Attendance_ID:r.attendance_code,Employee_ID:empMap.get(r.employee_id)||"",Date:r.attendance_date,Check_In:r.check_in||"",Check_Out:r.check_out||"",Work_Hours:r.work_hours??"",Status:r.status||"",Notes:r.notes||""}));
    if(module==="leave") return (await selectRows("leave_requests",{order:"created_at:desc",limit:5000})).map(r=>({Leave_ID:r.leave_code,Employee_ID:empMap.get(r.employee_id)||"",Leave_Type:r.leave_type||"",Start_Date:r.start_date||"",End_Date:r.end_date||"",Reason:r.reason||"",Status:r.status||"",Reviewed_By:r.reviewed_by||"",Reviewed_At:r.reviewed_at||""}));
    if(module==="expenses") return (await selectRows("expenses",{order:"expense_date:desc",limit:5000})).map(r=>expenseLegacy(r,projectMap.get(r.project_id)||""));
    if(module==="approvals") return (await selectRows("approvals",{order:"updated_at:desc",limit:5000})).map(r=>({Approval_ID:r.approval_code,Project_ID:projectMap.get(r.project_id)||"",Approval_Type:r.approval_type||"",Status:r.status||r.approval_status||"",Description:r.description||"",Amount:r.amount??"",Category:r.category||"",Requested_At:r.requested_at||"",Reviewed_By:r.reviewed_by||"",Reviewed_At:r.reviewed_at||"",Decision_Notes:r.decision_notes||""}));
    throw new Error(`ERP module ${module} is still handled by the Google compatibility service.`);
  }
  if (action === "getFinanceSheet") {
    const tab=text(input.tab); const {byId}=await projectMaps(); const now=new Date().toISOString();
    if(tab==="Workflow"){const {byId:empMap}=await employeeMaps();const tasks=await selectRows("tasks",{order:"updated_at:desc",limit:5000});const headers=["Task_ID","Project_ID","Task_Title","Assigned_Employee_ID","Priority","Status","Start_Date","Due_Date","Progress","Description"];const rows=tasks.map(t=>[t.task_code,byId.get(t.project_id)||"",t.task_title||"",empMap.get(t.assigned_employee_id)||"",t.priority||"",t.status||"",t.start_date||"",t.due_date||"",t.progress??0,t.description||""]);return{tab,tabs:["Workflow"],headers,rows,totals:{gross:0,discount:0,billed:0,paid:0,due:0,projects:0},url:"",updatedAt:now};}
    const billTabs:Row={"Design Bill":"Engineering Bill","Supervision Bill":"Supervision Bill","Others Bill":"Other Services Bill"}; if(billTabs[tab]){const all=(await selectRows("bills",{limit:5000})).filter(effectiveBill).filter(b=>categoryOf(b)===billTabs[tab]);const headers=["FILE ID","Service Name","Rate (BDT)","QTY","Amount (BDT)","Bill ID"];const rows=all.map(b=>[byId.get(b.project_id)||"",b.description||billTabs[tab],b.unit_price??"",b.quantity??"",num(b.amount),b.bill_code]);return{tab,tabs:Object.keys(billTabs),headers,rows,totals:{gross:all.reduce((s,b)=>s+num(b.amount),0),discount:all.reduce((s,b)=>s+num(b.discount),0),billed:all.reduce((s,b)=>s+num(b.net_amount),0),paid:0,due:0,projects:new Set(all.map(b=>b.project_id)).size},url:"",updatedAt:now};}
    const paymentTabs:Row={"Design Deposit":"Engineering Bill","S Deposit":"Supervision Bill","Others Bill Deposit":"Other Services Bill"}; if(paymentTabs[tab]){const all=(await selectRows("payments",{limit:5000})).filter(effectivePayment).filter(p=>categoryOf(p)===paymentTabs[tab]);const headers=["FILE ID","Date","Details","Amount","Verification","Income ID"];const rows=all.map(p=>[byId.get(p.project_id)||"",p.payment_date||"",[p.payment_method,p.reference_no].filter(Boolean).join(" · ")||"Client Payment",num(p.amount),p.approval_status||"Approved",p.payment_code]);return{tab,tabs:Object.keys(paymentTabs),headers,rows,totals:{gross:0,discount:0,billed:0,paid:all.reduce((s,p)=>s+num(p.amount),0),due:0,projects:new Set(all.map(p=>p.project_id)).size},url:"",updatedAt:now};}
    throw new Error(`Finance tab ${tab} is not available in Supabase.`);
  }

  if (action === "createProject" || action === "updateProject") {
    const existing=action==="updateProject"?await projectRow(input.projectId||input.Project_ID):{}; const row=projectFromInput(input,existing); const saved=await upsertRows("projects",row,"project_code"); return projectLegacy(saved[0]||row);
  }
  if (action === "deleteProject") { const p=await projectRow(input.projectId||input.Project_ID); await deleteRows("projects",{id:p.id}); return {deleted:true,projectId:p.project_code}; }
  if (action === "createEmployee" || action === "updateEmployee") { const existing=action==="updateEmployee"?await employeeRow(input.employeeId||input.Employee_ID):{}; const row=employeeFromInput(input,existing); const saved=await upsertRows("employees",row,"employee_code"); return employeeLegacy(saved[0]||row); }
  if (action === "deleteEmployee") { const e=await employeeRow(input.employeeId||input.Employee_ID); await deleteRows("employees",{id:e.id}); return {deleted:true,employeeId:e.employee_code}; }
  if (action === "updateProjectEmployees") { const p=await projectRow(input.projectId||input.Project_ID); await deleteRows("project_employees",{project_id:p.id}); const ids=Array.isArray(input.employeeIds)?input.employeeIds:[]; const employees=await Promise.all(ids.map(employeeRow)); if(employees.length)await upsertRows("project_employees",employees.map(e=>({project_id:p.id,employee_id:e.id,active:true,assignment_role:"Project Team",assigned_at:new Date().toISOString()})),"project_id,employee_id"); return {updated:true,projectId:p.project_code,employeeIds:employees.map(e=>e.employee_code)}; }
  if (action === "createDocument") { const p=await projectRow(input.projectId||input.Project_ID); const row={project_id:p.id,document_code:text(pick(input,"Document_ID","Document_Code"))||code("DOC"),title:text(pick(input,"Title","Document_Title"))||"Project Document",document_type:text(pick(input,"Document_Type","Type"))||null,drive_file_id:text(pick(input,"File_ID","Drive_File_ID"))||null,drive_file_url:text(pick(input,"File_URL","Drive_File_URL"))||null,document_date:text(pick(input,"Document_Date","Date"))||null,client_visible:bool(pick(input,"Client_Visible"),false)}; const saved=await insertRows("documents",row); return documentLegacy(saved[0]||row,p.project_code); }
  if (action === "createSiteVisit") { const p=await projectRow(input.projectId||input.Project_ID); const empCode=text(pick(input,"Employee_ID","employeeId")); const emp=empCode?await employeeRow(empCode):null; const row={visit_code:text(pick(input,"Visit_ID","visitId"))||code("SV"),project_id:p.id,employee_id:emp?.id||null,visit_date:text(pick(input,"Visit_Date","Date"))||new Date().toISOString().slice(0,10),purpose:text(pick(input,"Purpose","Visit_Purpose"))||null,visit_purpose:text(pick(input,"Visit_Purpose","Purpose"))||null,visited_by:text(pick(input,"Visited_By"))||emp?.name||null,observations:text(pick(input,"Observations"))||null,action_required:text(pick(input,"Action_Required"))||null,status:text(pick(input,"Status"))||"Completed",notes:text(pick(input,"Notes"))||null}; const saved=await insertRows("site_visits",row); return visitLegacy(saved[0]||row,p.project_code,emp?.employee_code||""); }
  if (["saveBill","createBill"].includes(action)) { const p=await projectRow(input.projectId||input.Project_ID); const idem=text(pick(input,"Idempotency_Key","idempotencyKey")); if(idem){const found=await selectRows("bills",{filters:{idempotency_key:idem},limit:1});if(found.length)return billLegacy(found[0],p.project_code);} const amount=num(pick(input,"Amount","Bill_Amount","Total","Grand_Total")),discount=num(pick(input,"Discount","Discount_Amount")); const row={bill_code:text(pick(input,"Bill_ID","billId","bill_code"))||code("BILL"),project_id:p.id,bill_date:text(pick(input,"Bill_Date","Date"))||new Date().toISOString().slice(0,10),billing_category:text(pick(input,"Billing_Category","Billing Category","Category"))||categoryOf(input),category:text(pick(input,"Category"))||null,description:text(pick(input,"Description","Service","Particulars","Item"))||"Service Bill",amount,discount,status:text(pick(input,"Status"))||"ACTIVE",notes:text(pick(input,"Notes"))||null,created_via:"Supabase",source_created_by:employeeCodeOf(user)||text((user as Row)?.username)||"LAND VIEW",source_created_at:new Date().toISOString(),idempotency_key:idem||null,unit_price:text(pick(input,"Unit_Price","Rate"))?num(pick(input,"Unit_Price","Rate")):null,quantity:text(pick(input,"Quantity","QTY"))?num(pick(input,"Quantity","QTY")):null}; const saved=await insertRows("bills",row); return billLegacy(saved[0]||row,p.project_code); }
  if (["savePayment","createPayment"].includes(action)) { const p=await projectRow(input.projectId||input.Project_ID); const idem=text(pick(input,"Idempotency_Key","idempotencyKey")); if(idem){const found=await selectRows("payments",{filters:{idempotency_key:idem},limit:1});if(found.length)return paymentLegacy(found[0],p.project_code);} const master=role==="admin"; const who=employeeCodeOf(user)||text((user as Row)?.username)||"Master Admin"; const row={payment_code:text(pick(input,"Payment_ID","paymentId","Income_ID"))||code("PAY"),project_id:p.id,payment_date:text(pick(input,"Payment_Date","Date"))||new Date().toISOString().slice(0,10),amount:num(pick(input,"Amount","Payment_Amount")),payment_method:text(pick(input,"Payment_Method","Method"))||null,reference_no:text(pick(input,"Reference_No","Reference"))||null,notes:text(pick(input,"Notes","Description"))||null,deposit_account:text(pick(input,"Deposit_Account","Account"))||"Office Cash",payment_for:text(pick(input,"Payment_For","Category"))||"Engineering Bill",income_category:text(pick(input,"Income_Category","Category"))||null,transaction_type:text(pick(input,"Transaction_Type"))||"Business Income",affects_business_balance:pick(input,"Affects_Business_Balance")!==""?bool(pick(input,"Affects_Business_Balance"),true):true,received_from:text(pick(input,"Received_From"))||p.client_name_snapshot||null,received_by:who,receipt_url:text(pick(input,"Receipt_URL"))||null,approval_status:master?"Approved":text(pick(input,"Approval_Status"))||"Pending",approved_by:master?who:null,approved_at:master?new Date().toISOString():null,reviewed_by:master?who:null,reviewed_at:master?new Date().toISOString():null,idempotency_key:idem||null,status:"POSTED",source_created_by:who,source_created_at:new Date().toISOString()}; const saved=await insertRows("payments",row); return paymentLegacy(saved[0]||row,p.project_code); }
  if (action === "reviewChairmanPendingApproval") { const id=text(input.id||input.Source_ID); if(!id)throw new Error("Payment ID is required."); const found=await selectRows("payments",{filters:{payment_code:id},limit:1}); if(!found.length)throw new Error("Payment not found."); if(bool(input.acknowledgeOnly)){const rows=await updateRows("payments",{payment_code:id},{reviewed_by:"EMP-0001",reviewed_at:new Date().toISOString(),review_notes:text(input.note)||"Seen by EMP-0001"});return{...(rows[0]?paymentLegacy(rows[0]):{}),Acknowledged:true,Ledger_Posted:true};} const who=employeeCodeOf(user)||text((user as Row)?.username)||"Master Admin"; const status=text(input.status)||"Approved"; const rows=await updateRows("payments",{payment_code:id},{approval_status:status,approved_by:who,approved_at:new Date().toISOString(),reviewed_by:who,reviewed_at:new Date().toISOString(),review_notes:text(input.note)||null,status:"POSTED"}); return{...(rows[0]?paymentLegacy(rows[0]):{}),Ledger_Posted:true}; }
  if (action === "initializeErpSheets") return {initialized:true,modules:["clients","tasks","attendance","leave","expenses","approvals"]};
  if (action === "createErpRecord" || action === "updateErpRecord") {
    const module=text(input.module).toLowerCase(), isUpdate=action==="updateErpRecord", id=text(input.id); const projectId=pick(input,"Project_ID","Project ID","projectId"),employeeId=pick(input,"Employee_ID","Assigned_Employee_ID","employeeId"); const p=projectId?await projectRow(projectId):null, emp=employeeId?await employeeRow(employeeId):null;
    if(module==="tasks"){const taskCode=isUpdate?id:(text(pick(input,"Task_ID"))||code("WF"));const row={task_code:taskCode,project_id:p?.id||null,task_title:text(pick(input,"Task_Title","Task Title","Title"))||"Project Task",description:text(pick(input,"Description"))||null,assigned_employee_id:emp?.id||null,priority:text(pick(input,"Priority"))||"Normal",status:text(pick(input,"Status"))||"Pending",start_date:text(pick(input,"Start_Date"))||null,due_date:text(pick(input,"Due_Date"))||null,progress:text(pick(input,"Progress"))?num(pick(input,"Progress")):0,project_name_snapshot:p?.project_name||null,source_updated_at:new Date().toISOString(),source_created_by:employeeCodeOf(user)||text((user as Row)?.username)||null};const saved=isUpdate?await updateRows("tasks",{task_code:taskCode},row):await insertRows("tasks",{...row,source_created_at:new Date().toISOString()});return taskLegacy(saved[0]||row,p?.project_code||"",emp?.employee_code||"");}
    if(module==="clients"){const clientCode=isUpdate?id:(text(pick(input,"Client_ID"))||code("CL"));const row={client_code:clientCode,name:text(pick(input,"Client_Name","Name"))||"Client",phone_number:text(pick(input,"Phone_Number","Phone"))||null,email:text(pick(input,"Email"))||null,address:text(pick(input,"Address"))||null,status:text(pick(input,"Status"))||"Active",client_type:text(pick(input,"Client_Type"))||null,notes:text(pick(input,"Notes"))||null,created_by_text:employeeCodeOf(user)||null};const saved=isUpdate?await updateRows("clients",{client_code:clientCode},row):await insertRows("clients",row);return clientLegacy(saved[0]||row);}
    if(module==="expenses"){const expCode=isUpdate?id:(text(pick(input,"Expense_ID"))||code("EXP"));const master=role==="admin";const who=employeeCodeOf(user)||text((user as Row)?.username)||"Master Admin";const row={expense_code:expCode,project_id:p?.id||null,expense_date:text(pick(input,"Expense_Date","Date"))||new Date().toISOString().slice(0,10),file_id:p?.project_code||null,project_name_snapshot:p?.project_name||null,category:text(pick(input,"Category"))||"General",description:text(pick(input,"Description"))||"Expense",amount:num(pick(input,"Amount")),requested_by_employee_id:emp?.id||null,requested_by_code:employeeCodeOf(user)||null,requested_at:new Date().toISOString(),approval_status:master?"Approved":text(pick(input,"Approval_Status"))||"Pending",approved_by_code:master?who:null,approved_at:master?new Date().toISOString():null,paid_to:text(pick(input,"Paid_To"))||null,payment_method:text(pick(input,"Payment_Method","Account"))||null,reference_no:text(pick(input,"Reference_No","Reference"))||null,receipt_url:text(pick(input,"Receipt_URL"))||null,notes:text(pick(input,"Notes"))||null,status:master?"POSTED":"PENDING",source_created_by:who,source_created_at:new Date().toISOString()};const saved=isUpdate?await updateRows("expenses",{expense_code:expCode},row):await insertRows("expenses",row);return expenseLegacy(saved[0]||row,p?.project_code||"");}
    if(module==="attendance"){if(!emp)throw new Error("Employee_ID is required.");const attCode=isUpdate?id:(text(pick(input,"Attendance_ID"))||code("ATT"));const row={attendance_code:attCode,employee_id:emp.id,attendance_date:text(pick(input,"Date","Attendance_Date"))||new Date().toISOString().slice(0,10),check_in:text(pick(input,"Check_In"))||null,check_out:text(pick(input,"Check_Out"))||null,work_hours:text(pick(input,"Work_Hours"))?num(pick(input,"Work_Hours")):null,status:text(pick(input,"Status"))||"Present",notes:text(pick(input,"Notes"))||null,source_created_by:employeeCodeOf(user)||null};const saved=isUpdate?await updateRows("attendance",{attendance_code:attCode},row):await insertRows("attendance",{...row,source_created_at:new Date().toISOString()});return{Attendance_ID:attCode,Employee_ID:emp.employee_code,...input};}
    if(module==="leave"){if(!emp)throw new Error("Employee_ID is required.");const leaveCode=isUpdate?id:(text(pick(input,"Leave_ID"))||code("LVREQ"));const row={leave_code:leaveCode,employee_id:emp.id,leave_type:text(pick(input,"Leave_Type"))||null,start_date:text(pick(input,"Start_Date"))||null,end_date:text(pick(input,"End_Date"))||null,reason:text(pick(input,"Reason"))||null,status:text(pick(input,"Status"))||"Pending",source_created_by:employeeCodeOf(user)||null};const saved=isUpdate?await updateRows("leave_requests",{leave_code:leaveCode},row):await insertRows("leave_requests",{...row,source_created_at:new Date().toISOString()});return{Leave_ID:leaveCode,Employee_ID:emp.employee_code,...input};}
    if(module==="approvals"){const approvalCode=isUpdate?id:(text(pick(input,"Approval_ID"))||code("APR"));const row={approval_code:approvalCode,project_id:p?.id||null,approval_type:text(pick(input,"Approval_Type"))||null,status:text(pick(input,"Status"))||"Pending",description:text(pick(input,"Description"))||null,amount:text(pick(input,"Amount"))?num(pick(input,"Amount")):null,category:text(pick(input,"Category"))||null,requested_at:new Date().toISOString(),source_created_by:employeeCodeOf(user)||null};const saved=isUpdate?await updateRows("approvals",{approval_code:approvalCode},row):await insertRows("approvals",{...row,source_created_at:new Date().toISOString()});return{Approval_ID:approvalCode,Project_ID:p?.project_code||"",...input};}
    throw new Error(`ERP module ${module} is still handled by the Google compatibility service.`);
  }
  throw new Error(`Unsupported Supabase LAND VIEW action: ${action}`);
}

export const SUPABASE_DATA_GET_ACTIONS = new Set(["getDashboard","getProjects","getProject","getProjectEmployees","getEmployees","getDocuments","getSiteVisits","getBillingDashboard","getBillingBook","getProjectBilling","getBillingRecords","getPayments","getInvoices","getErpRecords","getFinanceSheet","getChairmanPendingApprovals"]);
export const SUPABASE_DATA_POST_ACTIONS = new Set(["createProject","updateProject","deleteProject","updateProjectEmployees","createEmployee","updateEmployee","deleteEmployee","createDocument","createSiteVisit","saveBill","createBill","savePayment","createPayment","initializeErpSheets","createErpRecord","updateErpRecord","reviewChairmanPendingApproval"]);
