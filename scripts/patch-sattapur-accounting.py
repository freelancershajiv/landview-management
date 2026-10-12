from pathlib import Path

route = Path("app/api/project-management/route.ts")
text = route.read_text()

anchor = 'import { calculateProjectFinanceV2Snapshot } from "@/lib/project-finance-core.mjs";\n'
addition = anchor + 'import { accountingRows, isSattapur, sattapurSnapshot } from "@/lib/sattapur-accounting.mjs";\n'
if 'from "@/lib/sattapur-accounting.mjs"' not in text:
    if anchor not in text:
        raise SystemExit("route import anchor not found")
    text = text.replace(anchor, addition, 1)

start = text.find("function isSattapur(row: Row) {")
end = text.find("function calculate(rows: Row[]) {")
if start < 0 or end < 0 or end <= start:
    raise SystemExit("Sattapur helper block anchors not found")
text = text[:start] + text[end:]

old = '''  const entries = calculate(rows).map((row:any) => {\n    incomeBalance += num(row.debit);\n    // Sattapur funding is still a cash allocation for Total Expense, but its\n    // source transaction remains visible only as a Debit/Income row.\n    expenseBalance += num(row.credit) + (isSattapurDeposit(row) ? num(row.debit) : 0);'''
new = '''  const entries = calculate(rows).map((row:any) => {\n    incomeBalance += num(row.debit);\n    // Supplier payments are ordinary project expenses. Sattapur funding rows\n    // are therefore already counted once here as credits; deliveries are\n    // excluded from the cash ledger and only consume the supplier deposit.\n    expenseBalance += num(row.credit);'''
if old not in text:
    raise SystemExit("workspace running totals anchor not found")
text = text.replace(old, new, 1)

old = '''  // Total Deposit always comes from the original debit/income rows. Sattapur\n  // deposits are not moved out of Income. For cash accounting, those linked\n  // deposits are also included in Total Expense without creating a duplicate row.\n  const debit = rows.reduce((s,r) => s + num(r.debit), 0);\n  const credit = entries.reduce((s,r) => s + num(r.credit), 0) + sattapurBricks.depositAmount;'''
new = '''  // Full-ledger totals are based on normalized cash rows. Historical Sattapur\n  // debit deposits are reclassified as expenses for presentation/accounting,\n  // while new Sattapur payments are stored as expenses from the start.\n  const debit = entries.reduce((s,r) => s + num(r.debit), 0);\n  const credit = entries.reduce((s,r) => s + num(r.credit), 0);'''
if old not in text:
    raise SystemExit("workspace total anchors not found")
text = text.replace(old, new, 1)
text = text.replace('const legacyChequeOnHold = rows.reduce((sum:number,row:any) => {', 'const legacyChequeOnHold = entries.reduce((sum:number,row:any) => {', 1)

old = '''  const paidTo = clean(body.paidTo ?? body.paid_to ?? body.Paid_To ?? body.supplier ?? body.Supplier,160) || null;\n  return {'''
new = '''  const paidTo = clean(body.paidTo ?? body.paid_to ?? body.Paid_To ?? body.supplier ?? body.Supplier,160) || null;\n  const paymentMethodRaw = clean(body.paymentMethod ?? body.payment_method ?? body.Payment_Method,40);\n  const paymentMethods = ["Cash","Cheque","Bank Transfer"];\n  const paymentMethod = credit > 0 ? (paymentMethods.includes(paymentMethodRaw) ? paymentMethodRaw : "Cash") : null;\n  return {'''
if old not in text:
    raise SystemExit("validateEntry payment anchor not found")
text = text.replace(old, new, 1)
old = '''    paidTo,\n    category:clean(body.category ?? body.Category,120) || null,\n    memo:clean(body.memo ?? body.Memo,1000) || null'''
new = '''    paidTo,\n    paymentMethod,\n    category:clean(body.category ?? body.Category,120) || null,\n    memo:clean(body.memo ?? body.Memo,1000) || null'''
if old not in text:
    raise SystemExit("validateEntry return anchor not found")
text = text.replace(old, new, 1)

old = '''        debit:0,\n        credit:value,\n        category:"Bricks",\n        memo:[memo,"SATTPUR_BRICKS_DELIVERY"].filter(Boolean).join("\\\\n"),\n        source:"sattapur_bricks_delivery",'''
new = '''        debit:0,\n        credit:value,\n        category:"Bricks",\n        entry_type:"expense",\n        payment_method:null,\n        source_type:"supplier_delivery",\n        supplier_movement_type:"delivery",\n        memo:[memo,"SATTPUR_BRICKS_DELIVERY"].filter(Boolean).join("\\\\n"),\n        source:"sattapur_bricks_delivery",'''
if old not in text:
    raise SystemExit("delivery row anchor not found")
text = text.replace(old, new, 1)

old = '''    const v = await validateEntry(body);\n    const row = {'''
new = '''    const v = await validateEntry(body);\n    const sattapurPayment = v.credit > 0 && isSattapur({\n      paid_to:v.paidTo, supplier:v.paidTo, details:v.details, entry_date:v.entryDate\n    });\n    const row = {'''
if old not in text:
    raise SystemExit("POST validation anchor not found")
text = text.replace(old, new, 1)
old = '''      credit:v.credit,\n      category:v.category,\n      memo:v.memo,\n      source:"project_management",'''
new = '''      credit:v.credit,\n      category:v.category,\n      payment_method:v.paymentMethod,\n      entry_type:v.credit > 0 ? "expense" : "income",\n      source_type:sattapurPayment ? "supplier_advance_cash" : "project_management",\n      supplier_movement_type:sattapurPayment ? "advance_fund" : null,\n      supplier_advance_applied:0,\n      memo:v.memo,\n      source:sattapurPayment ? "supplier_advance_cash" : "project_management",'''
if old not in text:
    raise SystemExit("POST row metadata anchor not found")
text = text.replace(old, new, 1)

old = '''    const v = await validateEntry(body);\n    const saved = await updateRows("project_management_ledger", { id }, {'''
new = '''    const v = await validateEntry(body);\n    const existingRows = await selectRows("project_management_ledger", { filters:{ id }, limit:1 });\n    if (!existingRows.length) return fail("Ledger entry not found.",404);\n    const existing = existingRows[0];\n    const sattapurPayment = v.credit > 0 && isSattapur({\n      paid_to:v.paidTo, supplier:v.paidTo, details:v.details, entry_date:v.entryDate\n    });\n    const existingSource = clean(existing.source,80);\n    const existingSourceType = clean(existing.source_type,80);\n    const existingMovement = clean(existing.supplier_movement_type,80);\n    const source = sattapurPayment ? "supplier_advance_cash" : (existingSource === "supplier_advance_cash" ? "project_management" : (existingSource || "project_management"));\n    const sourceType = sattapurPayment ? "supplier_advance_cash" : (existingSourceType === "supplier_advance_cash" ? source : (existingSourceType || source));\n    const supplierMovementType = sattapurPayment ? "advance_fund" : (existingMovement === "advance_fund" ? null : (existing.supplier_movement_type || null));\n    const saved = await updateRows("project_management_ledger", { id }, {'''
if old not in text:
    raise SystemExit("PUT validation anchor not found")
text = text.replace(old, new, 1)
old = '''      credit:v.credit,\n      category:v.category,\n      memo:v.memo,\n      updated_at:new Date().toISOString()'''
new = '''      credit:v.credit,\n      category:v.category,\n      payment_method:v.paymentMethod,\n      entry_type:v.credit > 0 ? "expense" : "income",\n      source,\n      source_type:sourceType,\n      supplier_movement_type:supplierMovementType,\n      supplier_advance_applied:0,\n      memo:v.memo,\n      updated_at:new Date().toISOString()'''
if old not in text:
    raise SystemExit("PUT row metadata anchor not found")
text = text.replace(old, new, 1)
route.write_text(text)

page = Path("app/projectmanagement/page.tsx")
text = page.read_text()

anchor = 'const INCOME_CATEGORIES = ["Cash","Cheque","Bank Transfer","Scrap Selling"];\n'
addition = anchor + 'const PAYMENT_METHODS = ["Cash","Cheque","Bank Transfer"];\n'
if 'const PAYMENT_METHODS =' not in text:
    if anchor not in text:
        raise SystemExit("page payment method anchor not found")
    text = text.replace(anchor, addition, 1)

old = 'const blank=(type:"income"|"expense"="expense")=>({entryDate:new Date().toISOString().slice(0,10),receivedFrom:type==="income"?"Mr. Mahi Bhai":"",paidTo:type==="income"?"Eng Shajiv":"",supplier:type==="income"?"Eng Shajiv":"",details:"",sft:"",rate:"",debit:"",credit:"",category:type==="income"?"Cash":"Other Expenses",chequeStatus:"Cashed",memo:""});'
new = 'const blank=(type:"income"|"expense"="expense")=>({entryDate:new Date().toISOString().slice(0,10),receivedFrom:type==="income"?"Mr. Mahi Bhai":"",paidTo:type==="income"?"Eng Shajiv":"",supplier:type==="income"?"Eng Shajiv":"",details:"",sft:"",rate:"",debit:"",credit:"",category:type==="income"?"Cash":"Other Expenses",paymentMethod:"Cash",chequeStatus:"Cashed",memo:""});'
if old not in text:
    raise SystemExit("blank form anchor not found")
text = text.replace(old, new, 1)

old = '''      category:r.category||"Other Expenses",\n      chequeStatus:chequeStatus(r),'''
new = '''      category:r.category||"Other Expenses",\n      paymentMethod:r.payment_method||(["Cheque","Bank Transfer","Cash"].includes(String(r.category||""))?String(r.category):"Cash"),\n      chequeStatus:chequeStatus(r),'''
if old not in text:
    raise SystemExit("openEdit anchor not found")
text = text.replace(old, new, 1)

old = '''        credit:num(form.credit),\n        category:form.category,\n        memo:form.category==="Cheque" ?'''
new = '''        credit:num(form.credit),\n        category:form.category,\n        paymentMethod:entryType==="expense"?form.paymentMethod:null,\n        memo:form.category==="Cheque" ?'''
if old not in text:
    raise SystemExit("save body anchor not found")
text = text.replace(old, new, 1)

old = '<label><span>Paid To</span><input list="pm-party-options" value={form.paidTo} onChange={e=>setForm({...form,paidTo:e.target.value,supplier:e.target.value})} placeholder="Supplier / contractor / other party"/></label>'
new = '<label><span>Paid To</span><input list="pm-party-options" value={form.paidTo} onChange={e=>{const paidTo=e.target.value;const sattapur=entryType==="expense"&&/sattapur/i.test(paidTo);setForm({...form,paidTo,supplier:paidTo,category:sattapur?"Bricks":form.category});}} placeholder="Supplier / contractor / other party"/></label>'
if old not in text:
    raise SystemExit("Paid To input anchor not found")
text = text.replace(old, new, 1)

category_line = '<label><span>{entryType==="income" ? "Income Category" : "Expense Category"}</span><select value={form.category} onChange={e=>{const category=e.target.value;const suggested=entryType==="expense"?suggestedPartyForCategory(data,category):"";setForm({...form,category,paidTo:suggested||form.paidTo,supplier:suggested||form.paidTo,chequeStatus:category==="Cheque"?form.chequeStatus:"Cashed"});}}>{(entryType==="income" ? incomeEntryCategories : expenseEntryCategories).map(c=><option key={c}>{c}</option>)}</select></label>'
payment_line = category_line + '\n              {entryType==="expense"&&<label><span>Payment Method</span><select value={form.paymentMethod||"Cash"} onChange={e=>setForm({...form,paymentMethod:e.target.value})}>{PAYMENT_METHODS.map(method=><option key={method}>{method}</option>)}</select></label>}'
if payment_line not in text:
    if category_line not in text:
        raise SystemExit("entry category anchor not found")
    text = text.replace(category_line, payment_line, 1)

text = text.replace('<td><span className="pm-category-tag">{category}</span></td>', '<td><span className="pm-category-tag">{category}</span>{r.payment_method&&<span className="pm-payment-method">{r.payment_method}</span>}</td>')

old = 'Sattapur Bricks deposits are treated as expenses immediately because the cash has already been paid out. Brick deliveries are tracked separately and reduce the amount still held with Sattapur.'
new = 'Payments to Sattapur are project expenses and simultaneously fund the Sattapur deposit. Brick deliveries reduce that deposit without creating a second project expense.'
if old in text:
    text = text.replace(old, new, 1)
text = text.replace('<div className="pm-stat-head"><span>Sattapur Hold</span><b>⌁</b></div>', '<div className="pm-stat-head"><span>Sattapur Deposit</span><b>⌁</b></div>', 1)
text = text.replace('<small>Deposit paid − delivered brick value</small>', '<small>Sattapur payments − delivered brick value</small>', 1)

start = text.find('{sattapurLedgerOpen&&(')
end_marker = '      {sattapurDeliveryOpen&&admin&&'
end = text.find(end_marker, start)
if start < 0 or end < 0:
    raise SystemExit("Sattapur ledger modal anchors not found")
ledger_modal = '''{sattapurLedgerOpen&&(<div className="pm-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSattapurLedgerOpen(false)}}><div className="pm-modal pm-sattapur-ledger-modal"><div className="pm-modal-head"><div><h2>Sattapur Ledger</h2><p>Payments increase the Sattapur deposit; brick deliveries reduce it. Delivery value is not charged to project expense a second time.</p></div><button className="pm-close" onClick={()=>setSattapurLedgerOpen(false)}>×</button></div><div className="pm-sattapur-detail-scroll"><table className="pm-table pm-sattapur-ledger-table"><thead><tr><th>Date</th><th>Type</th><th>Details</th><th>Payment Method</th><th className="num-col">Deposit</th><th className="num-col">Delivery</th><th className="num-col">Deposit Balance</th></tr></thead><tbody>{(sattapurBricks.ledger||[]).slice().sort((a:any,b:any)=>String(b.date||"").localeCompare(String(a.date||""))||String(b.createdAt||"").localeCompare(String(a.createdAt||""))).map((r:any)=><tr key={r.id}><td>{dateText(r.date)}</td><td><span className={"pm-sattapur-type "+(r.type==="Delivery"?"delivery":"deposit")}>{r.type}</span></td><td className="wide-col">{r.details}</td><td>{r.paymentMethod||"—"}</td><td className="num-col pm-money-debit">{num(r.deposit)?money(r.deposit):"—"}</td><td className="num-col pm-money-credit">{num(r.delivery)?money(r.delivery):"—"}</td><td className="num-col pm-balance">{money(r.runningDeposit)}</td></tr>)}{!(sattapurBricks.ledger||[]).length&&<tr><td colSpan={7} className="pm-empty">No Sattapur ledger entries found.</td></tr>}</tbody></table></div></div></div>)}\n'''
text = text[:start] + ledger_modal + text[end:]

style_anchor = '.pm-category-tag{'
idx = text.find(style_anchor)
if idx >= 0 and '.pm-payment-method{' not in text:
    insert_at = text.find('}', idx) + 1
    text = text[:insert_at] + '.pm-payment-method{display:inline-flex;margin-left:6px;padding:3px 7px;border-radius:999px;background:#eef4f2;color:#426258;font-size:9px;font-weight:800;white-space:nowrap}' + text[insert_at:]

page.write_text(text)

integration_test = Path("tests/sattapur-project-management-integration.test.cjs")
integration_test.write_text(r'''/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("Project Management stores Sattapur payment as expense plus supplier advance funding", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../app/api/project-management/route.ts"), "utf8");
  assert.match(source, /payment_method:v\.paymentMethod/);
  assert.match(source, /source:sattapurPayment \? "supplier_advance_cash" : "project_management"/);
  assert.match(source, /source_type:sattapurPayment \? "supplier_advance_cash" : "project_management"/);
  assert.match(source, /supplier_movement_type:sattapurPayment \? "advance_fund" : null/);
  assert.match(source, /const debit = entries\.reduce/);
  assert.match(source, /const credit = entries\.reduce/);
  assert.doesNotMatch(source, /credit = entries\.reduce\([^\n]+\+ sattapurBricks\.depositAmount/);
});

test("Project Management UI separates expense category from payment method and uses canonical Sattapur ledger", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../app/projectmanagement/page.tsx"), "utf8");
  assert.match(source, /const PAYMENT_METHODS = \["Cash","Cheque","Bank Transfer"\]/);
  assert.match(source, /<span>Payment Method<\/span>/);
  assert.match(source, /paymentMethod:entryType==="expense"\?form\.paymentMethod:null/);
  assert.match(source, /sattapurBricks\.ledger/);
  assert.match(source, /Payments increase the Sattapur deposit/);
});
''')
