import type { Metadata } from "next";
import Link from "next/link";
import { selectRows } from "@/lib/supabase-data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

type Row = Record<string, any>;

function text(value: unknown) { return String(value ?? "").trim(); }
function num(value: unknown) { const n = Number(String(value ?? "").replace(/,/g, "").replace(/[^0-9.-]/g, "")); return Number.isFinite(n) ? n : 0; }
function money(value: unknown) { return new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(num(value)); }
function date(value: unknown) {
  const raw = text(value);
  if (!raw) return "—";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", day: "2-digit", month: "short", year: "numeric" }).format(parsed);
}

export default async function VerifyReceiptPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const clean = decodeURIComponent(token || "").replace(/[^A-Za-z0-9]/g, "");
  const receiptPath = clean ? `/verify/receipt/${clean}` : "";
  const payments = receiptPath ? await selectRows("payments", { filters: { receipt_url: receiptPath }, limit: 1 }).catch(() => []) : [];
  const payment = payments[0] as Row | undefined;
  const projects = payment?.project_id ? await selectRows("projects", { filters: { id: payment.project_id }, limit: 1 }).catch(() => []) : [];
  const project = projects[0] as Row | undefined;

  if (!payment || !project) {
    return <main className="vr-shell"><style>{css}</style><section className="vr-card"><div className="vr-brand">LAND <span>VIEW</span></div><div className="vr-bad">!</div><h1>Receipt verification failed</h1><p>This receipt link is invalid, unavailable, or has been altered.</p><Link href="https://www.landview.com.bd">Visit LAND VIEW</Link></section></main>;
  }

  const allocated = num(payment.invoice_allocated_amount);
  const unallocated = num(payment.invoice_unallocated_amount);
  const receiptCode = `RCPT-${text(payment.payment_code)}`;
  const status = text(payment.approval_status || payment.status || "Approved");

  return <main className="vr-shell"><style>{css}</style><section className="vr-card">
    <header className="vr-head"><div><div className="vr-brand">LAND <span>VIEW</span></div><small>Architects & Engineers</small></div><div className="vr-ok"><b>✓</b><span>VERIFIED RECEIPT</span></div></header>
    <div className="vr-rule" />
    <section className="vr-hero"><span>OFFICIAL PAYMENT RECEIPT</span><h1>{receiptCode}</h1><p>This read-only page verifies a payment recorded in the LAND VIEW finance system.</p></section>
    <section className="vr-grid">
      <div><span>File ID</span><strong>{project.project_code}</strong></div>
      <div><span>Client</span><strong>{project.client_name_snapshot || "—"}</strong></div>
      <div><span>Payment ID</span><strong>{payment.payment_code}</strong></div>
      <div><span>Payment Date</span><strong>{date(payment.payment_date)}</strong></div>
      <div><span>Payment Method</span><strong>{payment.payment_method || "—"}</strong></div>
      <div><span>Reference</span><strong>{payment.reference_no || "—"}</strong></div>
    </section>
    <section className="vr-amount"><span>AMOUNT RECEIVED</span><strong>{money(payment.amount)}</strong><small>{status}</small></section>
    <section className="vr-split">
      <div><span>Allocated to invoices</span><strong>{money(allocated)}</strong></div>
      <div className={unallocated > 0.009 ? "warn" : ""}><span>Unallocated / Advance</span><strong>{money(unallocated)}</strong></div>
    </section>
    {text(payment.notes) && <section className="vr-note"><span>Note</span><p>{text(payment.notes)}</p></section>}
    <div className="vr-actions"><Link href={`/client/billing/${encodeURIComponent(project.project_code)}`}>Open Client Billing</Link><span>Use your authorized client login to view invoices and full billing history.</span></div>
    <footer><strong>LAND VIEW — Architects & Engineers</strong><span>Feni Sadar, Feni, Bangladesh · www.landview.com.bd</span></footer>
  </section></main>;
}

const css = `
*{box-sizing:border-box}.vr-shell{min-height:100vh;padding:36px 18px;background:#f2f4f6;color:#111820;font-family:Arial,Helvetica,sans-serif}.vr-card{width:min(760px,100%);margin:0 auto;background:#fff;border:1px solid #d9dfe5;border-radius:16px;padding:28px;box-shadow:0 20px 60px rgba(0,0,0,.08)}.vr-head{display:flex;justify-content:space-between;gap:20px;align-items:center}.vr-brand{font-size:22px;font-weight:950;letter-spacing:.08em}.vr-brand span{color:#b27700}.vr-head small{display:block;margin-top:4px;color:#6d7780;font-size:10px;letter-spacing:.1em}.vr-ok{display:flex;align-items:center;gap:8px;color:#18733b;font-size:10px;font-weight:900}.vr-ok b{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:#e9f7ef}.vr-rule{height:1px;background:#e2e6ea;margin:22px 0}.vr-hero span{color:#9b6900;font-size:9px;font-weight:950;letter-spacing:.14em}.vr-hero h1{margin:7px 0 8px;font-size:25px}.vr-hero p{margin:0;color:#6a747d;font-size:11px;line-height:1.6}.vr-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:22px}.vr-grid div,.vr-split div{padding:12px;border:1px solid #e1e5e9;border-radius:9px;background:#f8f9fa}.vr-grid span,.vr-split span,.vr-note span{display:block;color:#7a858e;font-size:8px;font-weight:900;text-transform:uppercase}.vr-grid strong,.vr-split strong{display:block;margin-top:6px;font-size:11px}.vr-amount{margin-top:12px;padding:22px;border-radius:12px;background:#111820;color:#fff}.vr-amount span{font-size:9px;color:#e0b34a;font-weight:900;letter-spacing:.12em}.vr-amount strong{display:block;margin-top:7px;font-size:28px}.vr-amount small{display:block;margin-top:5px;color:#9fb0bd}.vr-split{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}.vr-split .warn strong{color:#a15c00}.vr-note{margin-top:12px;padding:12px;border-left:3px solid #b27700;background:#fff8e8}.vr-note p{margin:6px 0 0;font-size:11px;line-height:1.55}.vr-actions{margin-top:18px;padding:14px;border:1px solid #e2e6ea;border-radius:10px}.vr-actions a{display:inline-flex;padding:10px 13px;border-radius:7px;background:#b27700;color:#fff;text-decoration:none;font-size:10px;font-weight:900}.vr-actions span{display:block;margin-top:8px;color:#73808a;font-size:9px}.vr-bad{margin:24px auto 12px;width:46px;height:46px;display:grid;place-items:center;border-radius:50%;background:#ffecec;color:#b32828;font-size:22px;font-weight:900}.vr-card>h1{text-align:center}.vr-card>p{text-align:center;color:#6d7780}.vr-card>p+a{display:block;text-align:center}footer{display:flex;justify-content:space-between;gap:12px;margin-top:22px;padding-top:16px;border-top:1px solid #e2e6ea;color:#77818a;font-size:9px}footer strong{color:#303840}@media(max-width:650px){.vr-card{padding:20px}.vr-head{align-items:flex-start}.vr-grid{grid-template-columns:1fr 1fr}.vr-split{grid-template-columns:1fr}footer{flex-direction:column}}@media(max-width:430px){.vr-grid{grid-template-columns:1fr}.vr-brand{font-size:18px}.vr-ok span{display:none}}
`;
