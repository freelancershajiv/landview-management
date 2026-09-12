"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { landViewApi } from "@/lib/api";

const OPENING_BALANCE = -63847.541895;
const incomeCategories = ["Design Bill","Supervision Bill","Soil Test","Digital Survey","3D Design","Estimate & Costing","Plan Approval","Other Income"];
const expenseCategories = ["Office Rent","Salary / Wages","Staff Commission / Bonus","Utility","Internet / Phone","Transport","Site Visit","Printing / Stationery","Software / Subscription","Equipment","Design Outsourcing","Soil Test / Survey Cost","Municipality / Approval Cost","Marketing","Government Fee","Refreshment","Maintenance","Staff Welfare / Gifts","Miscellaneous"];
const methods = ["Cash","bKash","Nagad","Bank","Card","Cheque","Other"];

function t(value: unknown){return String(value??"").trim()}
function money(value:number){return new Intl.NumberFormat("en-BD",{style:"currency",currency:"BDT",maximumFractionDigits:2}).format(value)}
function septemberDate(value:string){return /^2026-09-\d{2}$/.test(value)}

export default function SeptemberLedgerEntryPage(){
  const [userId,setUserId]=useState("admin");
  const [income,setIncome]=useState({date:"2026-09-13",category:incomeCategories[0],description:"",amount:"",method:"Cash",project:"",from:"",reference:"",notes:""});
  const [expense,setExpense]=useState({date:"2026-09-13",category:expenseCategories[0],description:"",amount:"",method:"Cash",project:"",reference:"",notes:""});
  const [incomeBusy,setIncomeBusy]=useState(false),[expenseBusy,setExpenseBusy]=useState(false),[error,setError]=useState(""),[ok,setOk]=useState("");

  useEffect(()=>{void landViewApi.getSession().then(s=>setUserId(t(s?.user?.userId||s?.user?.User_ID||s?.user?.username||"admin"))).catch(()=>{})},[]);

  async function submitIncome(event:FormEvent){
    event.preventDefault();setError("");setOk("");
    if(!septemberDate(income.date)){setError("Use a September 2026 date for this opening ledger period.");return}
    if(!income.description.trim()||Number(income.amount)<=0){setError("Enter an income description and valid amount.");return}
    setIncomeBusy(true);
    try{
      await landViewApi.createPayment({
        Payment_Date:income.date,
        Project_ID:income.project.trim().toUpperCase(),
        Category:income.category,
        Payment_For:income.description.trim(),
        Amount:Number(income.amount),
        Payment_Method:income.method,
        Reference:income.reference.trim(),
        Received_From:income.from.trim(),
        Received_By:userId,
        Notes:income.notes.trim(),
        Created_At:new Date().toISOString(),
        Created_By:userId,
      });
      setOk("Income saved to the LAND VIEW source ledger. It will appear in Accounts after the finance sync.");
      setIncome(v=>({...v,description:"",amount:"",project:"",from:"",reference:"",notes:""}));
    }catch(e:any){setError(e?.message||"Could not save income.")}finally{setIncomeBusy(false)}
  }

  async function submitExpense(event:FormEvent){
    event.preventDefault();setError("");setOk("");
    if(!septemberDate(expense.date)){setError("Use a September 2026 date for this opening ledger period.");return}
    if(!expense.description.trim()||Number(expense.amount)<=0){setError("Enter an expense description and valid amount.");return}
    setExpenseBusy(true);
    try{
      await landViewApi.createErpRecord("expenses",{
        Expense_Date:expense.date,
        Project_ID:expense.project.trim().toUpperCase(),
        Category:expense.category,
        Description:expense.description.trim(),
        Amount:Number(expense.amount),
        Payment_Method:expense.method,
        Reference:expense.reference.trim(),
        Status:"Pending",
        Notes:expense.notes.trim(),
        Created_At:new Date().toISOString(),
        Created_By:userId,
      });
      setOk("Expense saved as Pending. Chairman Eng Jamal Rony (EMP-0001) must approve it before it counts as an approved expense.");
      setExpense(v=>({...v,description:"",amount:"",project:"",reference:"",notes:""}));
    }catch(e:any){setError(e?.message||"Could not save expense.")}finally{setExpenseBusy(false)}
  }

  return <main className="ledger-entry-page">
    <style>{`
      .ledger-entry-page{color:#eef2f5}.lep-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-end;margin-bottom:16px}.lep-head h1{margin:4px 0 0;font-size:32px}.lep-head p{max-width:650px;margin:0;color:#96a1aa;font-size:11px;line-height:1.55}.lep-back{color:#ffaaa5;text-decoration:none;font-size:10px;font-weight:800}.lep-balance{display:grid;grid-template-columns:1.1fr .9fr;gap:12px;margin-bottom:18px}.lep-card{padding:15px;border:1px solid #343f47;border-radius:10px;background:#101820}.lep-card span{display:block;color:#7f8c96;font-size:9px;text-transform:uppercase}.lep-card strong{display:block;margin-top:7px;font-size:24px}.lep-card.neg strong{color:#ff9b9b}.lep-card p{margin:7px 0 0;color:#8d99a2;font-size:10px;line-height:1.5}.lep-msg{margin-bottom:14px;padding:10px 12px;border-radius:8px;font-size:10px}.lep-msg.err{background:#3e1d20;color:#ffaaaa;border:1px solid #6f3337}.lep-msg.ok{background:#173724;color:#9fe7b7;border:1px solid #2c6746}.lep-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.lep-form{padding:18px;border:1px solid #343f47;border-radius:11px;background:#111920}.lep-form h2{margin:0 0 4px;font-size:20px}.lep-form>p{margin:0 0 14px;color:#87939d;font-size:10px;line-height:1.5}.fields{display:grid;grid-template-columns:1fr 1fr;gap:9px}.fields label{display:grid;gap:5px;color:#89949d;font-size:9px}.fields label.wide{grid-column:1/-1}.fields input,.fields select,.fields textarea{width:100%;border:1px solid #3b4650;border-radius:7px;background:#0b1116;color:#eef2f5;padding:9px;font-size:10px}.fields textarea{min-height:70px;resize:vertical}.lep-submit{grid-column:1/-1;height:40px;border:0;border-radius:7px;font-size:10px;font-weight:900;cursor:pointer}.income-submit{background:#1e633f;color:#d3ffe2}.expense-submit{background:#8a2d31;color:#fff1f1}.lep-submit:disabled{opacity:.55}@media(max-width:900px){.lep-balance,.lep-grid{grid-template-columns:1fr}.lep-head{align-items:flex-start;flex-direction:column}}@media(max-width:560px){.fields{grid-template-columns:1fr}.fields label.wide,.lep-submit{grid-column:auto}}
    `}</style>
    <div className="lep-head"><div><small>SEPTEMBER 2026</small><h1>New ledger entry</h1></div><div><p>Start September from the reconciled 31-Aug closing balance. Income is recorded when received; every new office expense is Pending until Chairman Eng Jamal Rony approves it.</p><Link className="lep-back" href="/admin/accounts">← Back to Accounts Ledger</Link></div></div>

    <div className="lep-balance">
      <div className="lep-card neg"><span>1 September opening balance</span><strong>{money(OPENING_BALANCE)}</strong><p>Confirmed 31-Aug-2026 LAND VIEW office closing balance: −63,847.541895.</p></div>
      <div className="lep-card"><span>Expense approval authority</span><strong>EMP-0001</strong><p>Chairman Eng Jamal Rony approves or rejects Pending September office expenses from his Employee portal.</p></div>
    </div>

    {error&&<div className="lep-msg err">{error}</div>}{ok&&<div className="lep-msg ok">{ok}</div>}

    <div className="lep-grid">
      <form className="lep-form" onSubmit={submitIncome}><h2>Record income</h2><p>Use this for money LAND VIEW actually received in September.</p><div className="fields">
        <label>Date<input type="date" min="2026-09-01" max="2026-09-30" value={income.date} onChange={e=>setIncome({...income,date:e.target.value})}/></label>
        <label>Category<select value={income.category} onChange={e=>setIncome({...income,category:e.target.value})}>{incomeCategories.map(x=><option key={x}>{x}</option>)}</select></label>
        <label className="wide">Description<input value={income.description} onChange={e=>setIncome({...income,description:e.target.value})} placeholder="e.g. LV-280 design bill payment"/></label>
        <label>Amount (BDT)<input inputMode="decimal" value={income.amount} onChange={e=>setIncome({...income,amount:e.target.value.replace(/[^0-9.]/g,"")})}/></label>
        <label>Payment method<select value={income.method} onChange={e=>setIncome({...income,method:e.target.value})}>{methods.map(x=><option key={x}>{x}</option>)}</select></label>
        <label>File / Project ID<input value={income.project} onChange={e=>setIncome({...income,project:e.target.value})} placeholder="LV-280"/></label>
        <label>Received from<input value={income.from} onChange={e=>setIncome({...income,from:e.target.value})} placeholder="Client / payer"/></label>
        <label>Reference<input value={income.reference} onChange={e=>setIncome({...income,reference:e.target.value})} placeholder="Trx / receipt"/></label>
        <label className="wide">Notes<textarea value={income.notes} onChange={e=>setIncome({...income,notes:e.target.value})}/></label>
        <button className="lep-submit income-submit" disabled={incomeBusy}>{incomeBusy?"SAVING…":"SAVE INCOME"}</button>
      </div></form>

      <form className="lep-form" onSubmit={submitExpense}><h2>Submit expense</h2><p>Saved as Pending; it affects approved-expense totals only after Chairman approval.</p><div className="fields">
        <label>Date<input type="date" min="2026-09-01" max="2026-09-30" value={expense.date} onChange={e=>setExpense({...expense,date:e.target.value})}/></label>
        <label>Category<select value={expense.category} onChange={e=>setExpense({...expense,category:e.target.value})}>{expenseCategories.map(x=><option key={x}>{x}</option>)}</select></label>
        <label className="wide">Description<input value={expense.description} onChange={e=>setExpense({...expense,description:e.target.value})} placeholder="What was paid / purchased?"/></label>
        <label>Amount (BDT)<input inputMode="decimal" value={expense.amount} onChange={e=>setExpense({...expense,amount:e.target.value.replace(/[^0-9.]/g,"")})}/></label>
        <label>Payment method<select value={expense.method} onChange={e=>setExpense({...expense,method:e.target.value})}>{methods.map(x=><option key={x}>{x}</option>)}</select></label>
        <label>File / Project ID<input value={expense.project} onChange={e=>setExpense({...expense,project:e.target.value})} placeholder="Optional LV-xxx"/></label>
        <label>Reference<input value={expense.reference} onChange={e=>setExpense({...expense,reference:e.target.value})} placeholder="Trx / receipt"/></label>
        <label className="wide">Notes<textarea value={expense.notes} onChange={e=>setExpense({...expense,notes:e.target.value})}/></label>
        <button className="lep-submit expense-submit" disabled={expenseBusy}>{expenseBusy?"SUBMITTING…":"SUBMIT EXPENSE FOR CHAIRMAN APPROVAL"}</button>
      </div></form>
    </div>
  </main>
}
