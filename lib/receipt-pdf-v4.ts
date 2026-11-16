"use client";

import html2canvas from "html2canvas";
import { createA4Pdf } from "@/lib/billing-pdf-v4";
import { downloadBlob } from "@/lib/save-document-jpg";

const paperWidth = 794;
const paperHeight = 1120;
let busy = false;

function safeName(value: string) {
  return value.replace(/[^a-z0-9._-]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || "LAND-VIEW-Receipt";
}

const load = (frame: HTMLIFrameElement) => new Promise<void>((resolve, reject) => {
  const timer = window.setTimeout(() => reject(new Error("The verified receipt did not load.")), 15000);
  frame.onload = () => { window.clearTimeout(timer); resolve(); };
  frame.onerror = () => { window.clearTimeout(timer); reject(new Error("Unable to load the receipt.")); };
});

async function waitImages(root: Element) {
  await Promise.all(Array.from(root.querySelectorAll<HTMLImageElement>("img")).map(async (image) => {
    if (!image.complete) await new Promise<void>((resolve) => {
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener("error", () => resolve(), { once: true });
    });
    try { await image.decode(); } catch { /* preserve textual verification URL */ }
  }));
}

export async function downloadReceiptPdfV4(receiptToken: string): Promise<number> {
  if (busy) throw new Error("The receipt PDF is already being generated.");
  if (!/^[a-z0-9]{20,80}$/i.test(receiptToken)) throw new Error("The receipt verification token is invalid.");
  busy = true;
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;left:-10000px;top:0;width:794px;height:1120px;opacity:1;pointer-events:none;border:0";
  const loading = load(frame);
  frame.src = "/api/billing/receipt-print?token=" + encodeURIComponent(receiptToken);
  document.body.append(frame);
  try {
    await loading;
    const doc = frame.contentDocument;
    if (!doc) throw new Error("The receipt document is not accessible.");
    const sheet = doc.querySelector<HTMLElement>(".sheet");
    if (!sheet) throw new Error("The receipt is not issued, verified, or available.");
    const title = (doc.title.split("·")[0] || "LAND-VIEW-Receipt").trim();
    const style = doc.createElement("style");
    style.textContent = [
      "html,body{background:#fff!important;width:794px!important;height:auto!important;overflow:visible!important}",
      ".tools{display:none!important}",
      ".sheet{display:block!important;position:relative!important;width:794px!important;max-width:none!important;height:1120px!important;min-height:1120px!important;max-height:1120px!important;padding:35px 40px 140px!important;margin:0!important;overflow:hidden!important;box-shadow:none!important;border:0!important;border-radius:0!important;box-sizing:border-box!important;background:white!important}",
      ".sheet .bottom{position:absolute!important;left:40px!important;right:40px!important;bottom:28px!important;margin:0!important;background:#fff!important}",
      ".sheet .legal{margin:15px 0 0!important}",
      ".sheet .detail{break-inside:auto!important}",
      ".sheet thead{display:table-header-group!important}",
      ".sheet .detail tr{break-inside:avoid!important}",
    ].join("\n");
    doc.head.append(style);
    await waitImages(sheet);
    await doc.fonts?.ready;

    const container = doc.createElement("div");
    container.style.cssText = "position:absolute;left:0;top:0;width:794px";
    doc.body.append(container);
    const footer = sheet.querySelector<HTMLElement>("footer.bottom");
    if (!footer) throw new Error("The receipt verification footer is missing.");
    const legal = sheet.querySelector<HTMLElement>(".legal");
    const stableDoc: Document = doc;
    const stableSheet: HTMLElement = sheet;
    const stableFooter: HTMLElement = footer;
    const content = Array.from(sheet.children) as HTMLElement[];
    let current = doc.createElement("main");
    const pages: HTMLElement[] = [];

    function newPage() {
      if (pages.length >= 100) throw new Error("Receipt exceeds the 100-page PDF safeguard.");
      const page = stableDoc.createElement("main");
      page.className = "sheet";
      const brand = stableSheet.querySelector<HTMLElement>("header.header")?.cloneNode(true);
      if (brand) page.append(brand);
      page.append(stableFooter.cloneNode(true));
      container.append(page);
      pages.push(page);
      current = page;
    }
    function fits() {
      const foot = current.querySelector<HTMLElement>("footer.bottom");
      const children = Array.from(current.children).filter((item) => item !== foot);
      const last = children[children.length - 1] as HTMLElement | undefined;
      return !last || !!foot && last.getBoundingClientRect().bottom + 10 < foot.getBoundingClientRect().top;
    }
    function put(node: HTMLElement) {
      const item = node.cloneNode(true) as HTMLElement;
      current.insertBefore(item, current.querySelector("footer.bottom"));
      if (fits()) return;
      item.remove();
      newPage();
      current.insertBefore(item, current.querySelector("footer.bottom"));
      if (!fits()) throw new Error("A receipt section is too large to fit on A4.");
    }
    newPage();
    for (const element of content) {
      if (element.matches("header.header, footer.bottom, .tools, script")) continue;
      if (element === legal) continue;
      if (element.matches(".detail") && element.querySelector("tbody > tr")) {
        const rows = Array.from(element.querySelectorAll<HTMLTableRowElement>("tbody > tr"));
        let i = 0;
        while (i < rows.length) {
          const block = element.cloneNode(true) as HTMLElement;
          const tbody = block.querySelector("tbody");
          if (!tbody) throw new Error("The receipt allocation table is missing.");
          tbody.replaceChildren();
          const note = block.querySelector("section + p, table + p");
          if (note && i < rows.length) note.remove();
          current.insertBefore(block, current.querySelector("footer.bottom"));
          if (!fits()) {
            block.remove();
            if (current.children.length <= 2) throw new Error("The receipt table heading cannot fit on A4.");
            newPage();
            continue;
          }
          let inserted = 0;
          while (i < rows.length) {
            const row = rows[i].cloneNode(true) as HTMLTableRowElement;
            tbody.append(row);
            if (!fits()) { row.remove(); break; }
            i++; inserted++;
          }
          if (!inserted) {
            block.remove();
            if (current.children.length <= 2) throw new Error("A receipt allocation row is taller than A4.");
            newPage();
            continue;
          }
          if (i < rows.length) newPage();
        }
        continue;
      }
      put(element);
    }
    if (legal) put(legal);
    sheet.remove();
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    await waitImages(container);
    if (pages.some((page) => {
      const foot = page.querySelector<HTMLElement>("footer.bottom");
      const blocks = Array.from(page.children).filter((item) => item !== foot);
      return !foot || !!blocks.length && (blocks[blocks.length - 1] as HTMLElement).getBoundingClientRect().bottom + 10 >= foot.getBoundingClientRect().top;
    })) throw new Error("Receipt content overlaps the page footer.");

    const images: Uint8Array[] = [];
    for (const page of pages) {
      const canvas = await html2canvas(page, {
        backgroundColor: "#fff", scale: 2, useCORS: true, allowTaint: false,
        width: paperWidth, height: paperHeight, windowWidth: paperWidth, windowHeight: paperHeight,
        scrollX: 0, scrollY: 0, logging: false,
      });
      const jpeg = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Unable to render the receipt PDF.")), "image/jpeg", .92);
      });
      images.push(new Uint8Array(await jpeg.arrayBuffer()));
    }
    downloadBlob(createA4Pdf(images), safeName(title) + "-LAND-VIEW-Receipt.pdf");
    return pages.length;
  } finally {
    frame.remove();
    busy = false;
  }
}
