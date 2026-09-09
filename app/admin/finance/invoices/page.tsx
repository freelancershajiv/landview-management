"use client";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { landViewApi } from "@/lib/api";
import { buildSheetInvoices, invoiceTabs, normalizeFileId, type SheetInvoices } from "@/lib/sheet-invoices";
import styles from "./invoice.module.css";

const money = (value:number) => new Intl.NumberFormat("en-BD",{minimumFractionDigits:2,maximumFractionDigits:2}).format(value);
export default function InvoicePage() {
  const [fileId,setFileId] = useState("");
  const [result,setResult] = useState<SheetInvoices|null>(null);
  const [error,setError] = useState("");
  const [busy,setBusy] = useState(false);
  const [selected,setSelected] = useState(0);
  const [issued,setIssued] = useState("");
  const request = useRef(0);
  async function load(event:FormEvent) {
    event.preventDefault();
    const id = normalizeFileId(fileId);
    if (!id) {setError("Enter a File ID such as 209 or LV-209."); return;}
    const version = ++request.current;
    setBusy(true); setError(""); setResult(null);
    try {
      const sheets = await Promise.all(invoiceTabs.map(tab => landViewApi.getFinanceSheet(tab)));
      const invoices = buildSheetInvoices(sheets,id);
      if (version === request.current) {
        setResult(invoices);
        setIssued(new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Dhaka",day:"2-digit",month:"short",year:"numeric"}).format(new Date()));
      }
    } catch(err) {if(version === request.current) setError(err instanceof Error ? err.message : "Could not load invoices.");}
    finally {if(version === request.current) setBusy(false);}
  }
  const invoice = result?.invoices[selected];
  return <div className={styles.workspace}>
    <div className={styles.controls}>
      <Link href="/admin/finance">← Finance</Link><h1>Invoices</h1>
      <form onSubmit={load}><label htmlFor="invoice-file">File ID</label><input id="invoice-file" placeholder="209 or LV-209" value={fileId} onChange={e=>{setFileId(e.target.value);setResult(null);setError("");request.current++;setBusy(false);}} required autoComplete="off"/><button disabled={busy}>{busy ? "Loading…" : "Load invoices"}</button></form>
      {error && <p role="alert">{error}</p>}
      {busy && <p role="status">Loading bills and deposits…</p>}
      {!result && !busy && !error && <p>Enter a File ID to fill all three invoices.</p>}
      {result && <nav aria-label="Invoice type">{result.invoices.map((item,i)=><button key={item.name} aria-pressed={selected===i} onClick={()=>setSelected(i)}>{item.name} · ৳{money(item.due)}</button>)}<button onClick={()=>window.print()}>Print / Save as PDF</button></nav>}
    </div>
    {result && invoice && <article className={styles.paper}>
      <header className={styles.brand}><div><strong>LAND VIEW</strong><p>ENGINEERS & ARCHITECTS</p></div><div><h2>{invoice.name} Invoice</h2><p>{result.id} · {issued}</p></div></header>
      <section className={styles.details}><div><h3>Owner details</h3><strong>{result.client.name}</strong><p>{result.client.address}</p><p>{result.client.phone}</p></div><div><h3>Building details</h3><p>Floor / Story: {result.client.floor || "—"}</p><p>Building type: {result.client.type || "—"}</p><p>Land area: {result.client.area || "—"}</p></div></section>
      <table><thead><tr><th scope="col">SL</th><th scope="col">Services</th><th scope="col">Price</th><th scope="col">Qty</th><th scope="col">Amount (৳)</th></tr></thead><tbody>{invoice.items.map((item,i)=><tr key={i}><td>{i+1}</td><td>{item.service || "—"}</td><td>{item.price || "—"}</td><td>{item.quantity || "—"}</td><td>{money(item.amount)}</td></tr>)}{!invoice.items.length && <tr><td colSpan={5}>No billed services.</td></tr>}</tbody></table>
      <section className={styles.totals}>{[["Bill amount",invoice.gross],["Discount",invoice.discount],["Deposited",invoice.paid],[invoice.due < 0 ? "Credit balance" : invoice.due === 0 ? "Balance paid" : "Total due",Math.abs(invoice.due)]].map(([label,value])=><div key={String(label)}><span>{label}</span><strong>৳{money(Number(value))}</strong></div>)}</section>
      {invoice.payments.length > 0 && <section className={styles.payments}><h3>Payment history</h3><table><thead><tr><th scope="col">Date</th><th scope="col">Details</th><th scope="col">Amount (৳)</th></tr></thead><tbody>{invoice.payments.map((payment,i)=><tr key={i}><td>{payment.date || "—"}</td><td>{payment.details || "—"}</td><td>{money(payment.amount)}</td></tr>)}</tbody></table></section>}
      <footer>Electronically generated invoice. No signature required.</footer>
    </article>}
  </div>;
}
