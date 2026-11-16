import { NextRequest, NextResponse } from "next/server";
import { selectRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;
const text = (value: unknown) => String(value ?? "").trim();
const num = (value: unknown) => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
};
const safe = (value: unknown) => text(value).replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const money = (value: unknown) => "BDT " + num(value).toLocaleString("en-BD", {minimumFractionDigits: 2, maximumFractionDigits: 2});
const date = (value: unknown) => {
  const raw = text(value);
  if (!raw) return "—";
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? raw : new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka", day: "2-digit", month: "short", year: "numeric",
  }).format(d);
};

function unavailable(status = 404) {
  return new NextResponse("Receipt unavailable. Please open the original verification link and try again.", {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function GET(request: NextRequest) {
  const token = text(request.nextUrl.searchParams.get("token"));
  if (!/^[A-Za-z0-9]{20,80}$/.test(token)) return unavailable(400);

  try {
    const path = "/verify/receipt/" + token;
    const receipt = (await selectRows("payment_receipts", {
      filters: { verification_token: token }, limit: 1,
    }))[0] as Row | undefined;
    if (!receipt || receipt.receipt_path !== path ||
        text(receipt.status).toLowerCase() !== "issued" || receipt.voided_at) return unavailable();

    const payment = (await selectRows("payments", { filters: { id: receipt.payment_id }, limit: 1 }))[0] as Row | undefined;
    if (!payment || text(payment.receipt_url) !== path || text(payment.project_id) !== text(receipt.project_id)) return unavailable();
    const paymentStatus = text(payment.approval_status || payment.status).toLowerCase();
    if (!["approved", "received", "paid", "verified", "complete", "completed", "posted"].includes(paymentStatus)) return unavailable();

    const project = (await selectRows("projects", { filters: { id: payment.project_id }, limit: 1 }))[0] as Row | undefined;
    if (!project) return unavailable();

    const [allocations, bills] = await Promise.all([
      selectRows("payment_invoice_allocations", {
        select: "bill_code,invoice_code,service_name,allocated_amount",
        filters: { payment_id: payment.id }, limit: 500,
      }),
      selectRows("bills", {
        select: "bill_code,description", filters: { project_id: project.id }, limit: 5000,
      }),
    ]) as [Row[], Row[]];

    const descriptions = new Map(bills.map(b => [text(b.bill_code), text(b.description)]));
    const allocated = allocations.reduce((sum, a) => sum + num(a.allocated_amount), 0);
    const advance = Math.max(0, num(payment.amount) - allocated);
    const verifyUrl = "https://app.landview.com.bd" + path;
    const qrSrc = "/api/billing-verification/qr?data=" + encodeURIComponent(verifyUrl);
    const receiptCode = text(receipt.receipt_code) || "RCPT-" + text(payment.payment_code);
    const rows = allocations.map(a => `<tr><td><strong>${safe(descriptions.get(text(a.bill_code)) || a.service_name || "Invoice payment")}</strong>
      <small>${safe(a.bill_code || a.invoice_code)}</small></td><td class="right">${safe(money(a.allocated_amount))}</td></tr>`).join("");
    const allocationSection = rows ? `<section class="detail"><h2>Invoice allocation</h2><table>
      <thead><tr><th>Service / bill</th><th class="right">Paid from this receipt</th></tr></thead>
      <tbody>${rows}</tbody></table></section>` : `<section class="detail"><h2>Invoice allocation</h2>
      <p>No invoice allocation recorded. The received amount is shown separately and remains valid.</p></section>`;

    const autoPrint = request.nextUrl.searchParams.get("autoprint") === "1";
    // This endpoint is a standalone document, not a Next.js page: the app's fixed
    // loader, navigation and global theme styles never enter the print tree.
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
      <meta name="viewport" content="width=device-width, initial-scale=1"/><meta name="robots" content="noindex,nofollow"/>
      <title>${safe(receiptCode)} · LAND VIEW Receipt</title>
      <style>
        @page{size:A4 portrait;margin:0}
        *{box-sizing:border-box}html,body{margin:0;padding:0;background:#f1f3f6;color:#14202b;font-family:Arial,Helvetica,sans-serif}
        .tools{max-width:780px;margin:20px auto 12px;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:0 16px}
        .tools button,.tools a{display:inline-flex;align-items:center;min-height:38px;border:1px solid #ced5dd;border-radius:8px;background:white;padding:9px 14px;color:#182534;text-decoration:none;font-size:13px;font-weight:700;cursor:pointer}
        .tools button{background:#b9232b;color:white;border-color:#b9232b}
        .sheet{width:min(780px,calc(100% - 32px));margin:0 auto 28px;background:white;padding:34px 37px;border:1px solid #dfe5ea;border-radius:10px;box-shadow:0 9px 35px #19283c18}
        .header{display:flex;justify-content:space-between;align-items:start;gap:12px;border-bottom:2px solid #b9232b;padding-bottom:17px}
        .brand{display:flex;align-items:center;gap:9px;font-size:25px;font-weight:900;letter-spacing:.04em}.brand img{width:42px;height:42px;object-fit:contain}.brand b{color:#b9232b}.sub{font-size:11px;color:#65717d;margin-top:5px}
        .verified{font-size:10px;color:#137847;font-weight:900;text-transform:uppercase;border:1px solid #a0d4b9;padding:9px;border-radius:6px}
        .eyebrow{font-size:10px;font-weight:900;letter-spacing:.13em;color:#a3252d;margin:24px 0 6px}
        h1{font-size:23px;overflow-wrap:anywhere;margin:0 0 16px}h2{font-size:13px;margin:0 0 10px}
        .sum{border-radius:9px;background:#132334;color:white;padding:22px 24px;margin:0 0 16px}
        .sum span{font-size:10px;color:#bfcbd4;text-transform:uppercase;letter-spacing:.12em}.sum strong{display:block;font-size:27px;margin-top:6px}
        .grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
        .box{border:1px solid #dbe2e8;border-radius:8px;padding:11px;background:#fafbfc;min-height:59px}
        .box span{display:block;font-size:9px;color:#6b7884;text-transform:uppercase;margin-bottom:6px}
        .box strong{font-size:11px;overflow-wrap:anywhere}
        .split{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:9px}
        .detail{margin-top:22px;break-inside:auto}.detail table{width:100%;border-collapse:collapse}
        th,td{text-align:left;padding:10px 8px;border-bottom:1px solid #e0e5ea;font-size:11px;vertical-align:top}
        th{color:#667481;font-size:10px}.right{text-align:right;white-space:nowrap}td small{display:block;color:#7b8995;margin-top:4px}
        .note{margin-top:20px;padding:10px 13px;border-left:3px solid #b9232b;background:#f9f8f5;font-size:11px}
        .bottom{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;border-top:1px solid #dfe5ea;margin-top:22px;padding-top:15px;font-size:10px;color:#70808c}
        .qr{text-align:center}.qr img{width:90px;height:90px;display:block;margin:0 auto 3px}.qr a{color:#475667;font-size:9px}
        .legal{font-size:9px;color:#74818d;line-height:1.6;margin-top:18px}
        @media(max-width:620px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.sheet{padding:22px 17px}.bottom{align-items:start}}
        @media print{
          html,body{width:100%!important;height:auto!important;overflow:visible!important;margin:0!important;background:white!important}
          .tools{display:none!important}.sheet{width:210mm!important;max-width:210mm!important;margin:0!important;padding:10mm!important;border:0!important;border-radius:0!important;box-shadow:none!important}
          .detail table thead{display:table-header-group!important}.detail tr{break-inside:avoid!important;page-break-inside:avoid!important}
          .sum,.verified{-webkit-print-color-adjust:exact;print-color-adjust:exact}
          .grid{grid-template-columns:repeat(3,minmax(0,1fr))}
          .header,.sum,.grid,.split,.bottom{break-inside:avoid}
        }
      </style></head><body>
      <div class="tools"><button type="button" onclick="window.print()">Print / Save PDF</button>
        <a href="${safe(path)}">View verified receipt</a></div>
      <main class="sheet">
        <header class="header"><div><div class="brand"><img src="/land-view-logo.svg" alt="LAND VIEW logo"/> <span>LAND <b>VIEW</b></span></div><div class="sub">Engineers and Architects · Feni, Bangladesh</div></div><div class="verified">✓ Verified payment receipt</div></header>
        <p class="eyebrow">OFFICIAL PAYMENT RECEIPT</p><h1>${safe(receiptCode)}</h1>
        <section class="sum"><span>Amount received</span><strong>${safe(money(payment.amount))}</strong></section>
        <section class="grid">
          <div class="box"><span>Project / File ID</span><strong>${safe(project.project_code)}</strong></div>
          <div class="box"><span>Client</span><strong>${safe(project.client_name_snapshot || "—")}</strong></div>
          <div class="box"><span>Payment ID</span><strong>${safe(payment.payment_code)}</strong></div>
          <div class="box"><span>Payment date</span><strong>${safe(date(payment.payment_date))}</strong></div>
          <div class="box"><span>Method</span><strong>${safe(payment.payment_method || "—")}</strong></div>
          <div class="box"><span>Reference</span><strong>${safe(payment.reference_no || "—")}</strong></div>
        </section>
        <section class="split">
          <div class="box"><span>Allocated to invoices</span><strong>${safe(money(allocated))}</strong></div>
          <div class="box"><span>Not allocated to invoices</span><strong>${safe(money(advance))}</strong></div>
        </section>
        ${allocationSection}
        ${payment.notes ? `<section class="note"><strong>Payment notes</strong><p>${safe(payment.notes)}</p></section>` : ""}
        <footer class="bottom"><div><strong>LAND VIEW — Architects &amp; Engineers</strong><p>Feni Sadar, Feni, Bangladesh</p><p>www.landview.com.bd</p></div>
          <div class="qr"><img src="${safe(qrSrc)}" alt="Receipt verification QR code"/><a href="${safe(path)}">Scan to verify</a></div></footer>
        <p class="legal">This receipt confirms the amount received for the identified project. Service allocations reflect the current invoice ledger; subsequent reallocation does not change the original payment amount.</p>
      </main>
      ${autoPrint ? `<script>window.addEventListener("load",function(){window.setTimeout(function(){window.print()},400)},{once:true});</script>` : ""}
      </body></html>`;

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store, max-age=0",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Receipt print page failed:", error);
    return new NextResponse("Could not prepare this receipt for printing. Try again from the receipt page.", {
      status: 502, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
}
