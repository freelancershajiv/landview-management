"use client";

import type { SheetInvoices } from "@/lib/sheet-invoices";
import { downloadBlob, getScopedPrintCss, renderPageToJpeg, waitForImages } from "@/lib/save-document-jpg";

type Prepared = { host: HTMLElement; pages: HTMLElement[]; css: string; dispose: () => void };
const HOST = "[data-lv-v4-print]";
let preparing = false;
const nextPaint = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

function fits(page: HTMLElement) {
  const body = page.querySelector<HTMLElement>(".lvInvoiceBody");
  const footer = page.querySelector<HTMLElement>(".lvInvoiceFooter");
  if (!body || !footer) throw new Error("Invoice body or footer is missing.");
  return body.getBoundingClientRect().bottom + 10 <= footer.getBoundingClientRect().top;
}

function paginate(source: HTMLElement, target: HTMLElement, pages: HTMLElement[]) {
  const contents = source.querySelector<HTMLElement>(".lvInvoiceBody");
  if (!contents) throw new Error("Invoice sections are missing.");
  function newPage() {
    if (pages.length >= 100) throw new Error("Invoice exceeds the 100-page export limit.");
    const page = source.cloneNode(true) as HTMLElement;
    const body = page.querySelector<HTMLElement>(".lvInvoiceBody");
    if (!body) throw new Error("The invoice section is not available.");
    body.replaceChildren();
    target.appendChild(page);
    pages.push(page);
    return { page, body };
  }
  let current = newPage();
  let heading: HTMLElement | null = null;

  function place(sourceBlock: HTMLElement) {
    const block = sourceBlock.cloneNode(true) as HTMLElement;
    current.body.append(block);
    if (fits(current.page)) return;
    block.remove();
    if (!current.body.children.length) throw new Error("An invoice block is too tall for A4.");
    current = newPage();
    current.body.append(block);
    if (!fits(current.page)) throw new Error("An invoice block is too tall for A4.");
  }

  for (const section of Array.from(contents.children) as HTMLElement[]) {
    if (section.classList.contains("lvSectionTitle")) { heading = section; continue; }
    if (!section.classList.contains("lvTableWrap") || !section.querySelector("tbody")) {
      if (heading) { place(heading); heading = null; }
      place(section);
      continue;
    }

    const rows = Array.from(section.querySelectorAll<HTMLTableRowElement>("tbody > tr"));
    let index = 0;
    let first = true;
    while (index < rows.length) {
      const title = heading ? heading.cloneNode(true) as HTMLElement : null;
      if (title && !first) title.setAttribute("data-lv-continued", "");
      if (title) current.body.append(title);
      const wrap = section.cloneNode(true) as HTMLElement;
      const tbody = wrap.querySelector<HTMLTableSectionElement>("tbody");
      if (!tbody) throw new Error("Invoice table body is missing.");
      tbody.replaceChildren();
      current.body.append(wrap);
      if (!fits(current.page)) {
        wrap.remove(); title?.remove();
        if (!current.body.children.length) throw new Error("Insufficient A4 space for an invoice table header.");
        current = newPage();
        continue;
      }

      let added = 0;
      while (index < rows.length) {
        const row = rows[index].cloneNode(true) as HTMLTableRowElement;
        tbody.append(row);
        if (!fits(current.page)) { row.remove(); break; }
        index++;
        added++;
      }
      if (!added) {
        wrap.remove(); title?.remove();
        if (!current.body.children.length) throw new Error("One invoice row is taller than the printable A4 space.");
        current = newPage();
        continue;
      }
      first = false;
      if (index < rows.length) current = newPage();
    }
    heading = null;
  }
  if (heading) place(heading);
}

export async function prepareBillingV4(result: SheetInvoices): Promise<Prepared> {
  if (preparing) throw new Error("Another document is being prepared.");
  preparing = true;
  const root = Array.from(document.querySelectorAll<HTMLElement>(".lvInvoiceRevampRoot[data-billing-id]"))
    .find((element) => element.dataset.billingId === result.id);
  if (!root) {
    preparing = false;
    throw new Error("Open the project billing statement before exporting.");
  }
  if (/^LV-\d+$/.test(result.id) && !root.querySelector("img[data-billing-qr]")) {
    preparing = false;
    throw new Error("The invoice verification QR is not ready. Refresh billing and try again.");
  }

  const host = document.createElement("div");
  host.dataset.lvV4Print = "1";
  host.style.cssText = "position:absolute;left:-100000px;top:0;width:210mm;background:#fff;pointer-events:none;z-index:-2147483640";
  const clone = root.cloneNode(true) as HTMLElement;
  host.append(clone);
  const css = getScopedPrintCss(HOST) + [
    HOST + "{width:210mm!important;background:white!important}",
    HOST + " .lvInvoiceOriginal{display:none!important}",
    HOST + " .lvInvoiceRevampPrint{display:block!important;position:static!important;top:auto!important;left:auto!important;width:210mm!important}",
    HOST + " .lvInvoicePage{position:relative!important;display:block!important;width:210mm!important;height:296mm!important;min-height:296mm!important;max-height:296mm!important;box-sizing:border-box!important;overflow:hidden!important;background:white!important;break-after:auto!important;page-break-after:auto!important}",
    HOST + " .lvInvoicePage .lvInfoRow strong:nth-child(4){white-space:normal!important;text-overflow:clip!important}",
    HOST + " [data-lv-continued]::after{content:' (CONTINUED)';font-size:8pt;color:#666}",
  ].join("\n");
  const style = document.createElement("style");
  style.dataset.lvV4PrintCss = "1";
  style.textContent = css;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true; host.remove(); style.remove();
  };

  try {
    document.head.append(style);
    document.body.append(host);
    const sheet = clone.querySelector<HTMLElement>(".lvInvoiceRevampPrint");
    if (!sheet) throw new Error("The printable invoice could not be found.");
    const originals = Array.from(sheet.querySelectorAll<HTMLElement>(":scope > article.lvInvoicePage"));
    if (!originals.length) throw new Error("The invoice has no printable pages.");
    await waitForImages(clone);
    if (document.fonts?.ready) await document.fonts.ready;
    await nextPaint();
    sheet.replaceChildren();
    const pages: HTMLElement[] = [];
    for (const original of originals) paginate(original, sheet, pages);
    pages.forEach((page, index) => {
      const counter = page.querySelector<HTMLElement>(".lvTitleBlock small");
      if (counter) counter.textContent = "Page " + (index + 1) + " of " + pages.length;
    });
    await nextPaint();
    if (pages.some((page) => !fits(page))) throw new Error("A4 pagination failed: content overlaps the footer.");
    return { host, pages, css, dispose };
  } catch (error) {
    dispose(); throw error;
  } finally {
    preparing = false;
  }
}

function jpegDimensions(bytes: Uint8Array) {
  if (bytes[0] !== 255 || bytes[1] !== 216) throw new Error("PDF export requires JPEG pages.");
  let i = 2;
  while (i < bytes.length) {
    if (bytes[i] !== 255) { i++; continue; }
    while (bytes[i] === 255) i++;
    const marker = bytes[i++];
    if (marker === 216 || marker === 1 || (marker >= 208 && marker <= 215)) continue;
    if (marker === 217 || marker === 218) break;
    const length = (bytes[i] << 8) | bytes[i + 1];
    if (length < 2) break;
    if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)) {
      return { height: (bytes[i + 3] << 8) | bytes[i + 4], width: (bytes[i + 5] << 8) | bytes[i + 6] };
    }
    i += length;
  }
  throw new Error("Invalid JPEG image dimensions.");
}

/** Portable A4 PDF generator, with one rendered invoice page per PDF page. */
export function createA4Pdf(images: Uint8Array[]): Blob {
  if (!images.length) throw new Error("The document has no pages.");
  const encoder = new TextEncoder(), chunks: Uint8Array[] = [], offsets: number[] = [];
  let size = 0;
  const raw = (value: Uint8Array) => { chunks.push(value); size += value.length; };
  const add = (value: string) => raw(encoder.encode(value));
  const obj = (id: number, body: string) => {
    offsets[id] = size;
    add(id + " 0 obj\n" + body + "\nendobj\n");
  };
  add("%PDF-1.4\n%LANDVIEW\n");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  const ids = images.map((_, index) => index * 3 + 3);
  obj(2, "<< /Type /Pages /Count " + images.length + " /Kids [" + ids.map((id) => id + " 0 R").join(" ") + "] >>");
  images.forEach((image, index) => {
    const id = ids[index], picture = id + 2, dimensions = jpegDimensions(image);
    const commands = "q\n595.28 0 0 841.89 0 0 cm\n/Im0 Do\nQ\n";
    obj(id, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 " + picture + " 0 R >> >> /Contents " + (id + 1) + " 0 R >>");
    offsets[id + 1] = size;
    add((id + 1) + " 0 obj\n<< /Length " + encoder.encode(commands).length + " >>\nstream\n" + commands + "endstream\nendobj\n");
    offsets[picture] = size;
    add(picture + " 0 obj\n<< /Type /XObject /Subtype /Image /Width " + dimensions.width + " /Height " + dimensions.height + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + image.length + " >>\nstream\n");
    raw(image);
    add("\nendstream\nendobj\n");
  });
  const xref = size;
  add("xref\n0 " + (3 + images.length * 3) + "\n0000000000 65535 f \n");
  for (let id = 1; id < 3 + images.length * 3; id++) {
    add(String(offsets[id]).padStart(10, "0") + " 00000 n \n");
  }
  add("trailer\n<< /Size " + (3 + images.length * 3) + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF");
  const bytes = new Uint8Array(size);
  let position = 0;
  for (const chunk of chunks) { bytes.set(chunk, position); position += chunk.length; }
  return new Blob([bytes.buffer], { type: "application/pdf" });
}

export async function downloadBillingPdfV4(result: SheetInvoices, filename: string) {
  const ready = await prepareBillingV4(result);
  try {
    const images: Uint8Array[] = [];
    for (const page of ready.pages) {
      images.push(new Uint8Array(await (await renderPageToJpeg(page)).arrayBuffer()));
    }
    downloadBlob(createA4Pdf(images), filename + ".pdf");
    return ready.pages.length;
  } finally { ready.dispose(); }
}

export function openBillingPreviewV4(result: SheetInvoices, filename: string) {
  const viewer = window.open("", "_blank");
  if (!viewer) throw new Error("Allow pop-ups to open the invoice preview.");
  viewer.document.body.textContent = "Preparing accurate A4 preview…";
  void (async () => {
    const ready = await prepareBillingV4(result);
    try {
      const d = viewer.document;
      d.head.replaceChildren(); d.body.replaceChildren();
      const base = d.createElement("base"); base.href = location.origin + "/"; d.head.append(base);
      d.title = filename;
      const style = d.createElement("style");
      style.textContent = ready.css + [
        "@page{size:A4 portrait;margin:0}",
        "body{margin:0;background:#dce2e7;font:14px Arial,sans-serif}",
        ".lvV4Toolbar{position:sticky;top:0;z-index:5;display:flex;align-items:center;justify-content:center;gap:12px;padding:12px;background:#fff;border-bottom:1px solid #cbd5df}",
        ".lvV4Toolbar button{background:#b9232b;color:#fff;border:0;border-radius:6px;padding:10px 16px;font-weight:700;cursor:pointer}",
        ".lvV4Toolbar button+button{background:#172a3a}",
        "[data-lv-v4-print]{position:static!important;left:auto!important;top:auto!important;pointer-events:auto!important;z-index:auto!important;margin:20px auto!important}",
        "[data-lv-v4-print] article{margin-bottom:15px!important;box-shadow:0 6px 25px #1c2d3a26}",
        "@media print{body{background:#fff!important}.lvV4Toolbar{display:none!important}[data-lv-v4-print]{margin:0!important}[data-lv-v4-print] article{margin:0!important;box-shadow:none!important;break-after:page!important;page-break-after:always!important}[data-lv-v4-print] article:last-child{break-after:auto!important;page-break-after:auto!important}}",
      ].join("\n");
      d.head.append(style);
      const toolbar = d.createElement("nav"); toolbar.className = "lvV4Toolbar";
      const count = d.createElement("strong");
      count.textContent = "LAND VIEW · " + ready.pages.length + " A4 page(s)";
      const print = d.createElement("button"); print.textContent = "Print / Save as PDF"; print.onclick = () => viewer.print();
      const download = d.createElement("button"); download.textContent = "Download PDF";
      download.onclick = () => {
        download.disabled = true; download.textContent = "Preparing PDF…";
        void downloadBillingPdfV4(result, filename)
          .catch((e) => viewer.alert(e instanceof Error ? e.message : "PDF download failed."))
          .finally(() => { download.disabled = false; download.textContent = "Download PDF"; });
      };
      toolbar.append(count, print, download);
      d.body.append(toolbar, ready.host.cloneNode(true));
    } finally { ready.dispose(); }
  })().catch((error) => {
    if (!viewer.closed) viewer.document.body.textContent = error instanceof Error ? error.message : "Preview unavailable.";
  });
}
