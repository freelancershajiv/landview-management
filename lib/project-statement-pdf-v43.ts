"use client";

import html2canvas from "html2canvas";
import { createA4Pdf } from "@/lib/billing-pdf-v4";
import { downloadBlob } from "@/lib/save-document-jpg";

const PAGE_WIDTH = 794;
const PAGE_HEIGHT = 1120;
let pdfBusy = false;
const normalized = (raw: string) => {
  const match = String(raw || "").trim().toUpperCase().match(/^(?:LV[\s_-]*)?0*(\d{1,8})$/);
  return match ? "LV-" + String(Number(match[1])).padStart(3, "0") : "";
};
const wait = (frame: HTMLIFrameElement) => new Promise<void>((resolve,reject) => {
  const timeout = window.setTimeout(() => reject(new Error("The statement document did not load.")), 20000);
  frame.onload = () => { window.clearTimeout(timeout); resolve(); };
  frame.onerror = () => { window.clearTimeout(timeout); reject(new Error("The statement document is unavailable.")); };
});
async function imagesReady(doc: Document) {
  await Promise.all(Array.from(doc.querySelectorAll<HTMLImageElement>("img")).map(async image => {
    if (!image.complete) await new Promise<void>(resolve => {
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener("error", () => resolve(), { once: true });
    });
    try { await image.decode(); } catch { /* Alt text still renders if asset unavailable. */ }
  }));
}

/** Download one A4 PDF with the same individual pages as the server-side print document. */
export async function downloadProjectStatementPdfV43(fileId: string): Promise<number> {
  if (pdfBusy) throw new Error("The project statement PDF is already being prepared.");
  const code = normalized(fileId);
  if (!code) throw new Error("Enter a valid project File ID to download its statement.");
  pdfBusy = true;
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;left:-12000px;top:0;width:794px;height:1120px;opacity:1;pointer-events:none;border:0";
  const ready = wait(frame);
  frame.src = "/api/billing/project-statement-print?projectId=" + encodeURIComponent(code);
  document.body.append(frame);
  try {
    await ready;
    const doc = frame.contentDocument;
    if (!doc) throw new Error("The statement document is not accessible.");
    const pages = Array.from(doc.querySelectorAll<HTMLElement>(".statement-page"));
    if (!pages.length) throw new Error("The server could not prepare a printable project statement.");
    if (pages.length > 100) throw new Error("Statement exceeds the A4 PDF page safeguard.");
    const override = doc.createElement("style");
    override.textContent = "html,body{background:#fff!important;width:794px!important;overflow:visible!important;margin:0!important;padding:0!important}.tools{display:none!important}.statement-page{margin:0!important;box-shadow:none!important;border:0!important}";
    doc.head.append(override);
    if (doc.fonts?.ready) await doc.fonts.ready;
    await imagesReady(doc);
    const jpegPages: Uint8Array[] = [];
    for (const page of pages) {
      if (page.getBoundingClientRect().height > PAGE_HEIGHT+2)
        throw new Error("A statement page exceeded the A4 layout height.");
      const canvas = await html2canvas(page, {
        backgroundColor: "#ffffff", scale: 1.9, useCORS: true, allowTaint: false,
        width: PAGE_WIDTH, height: PAGE_HEIGHT, windowWidth: PAGE_WIDTH, windowHeight: PAGE_HEIGHT,
        scrollX: 0, scrollY: 0, logging: false,
      });
      const blob = await new Promise<Blob>((resolve,reject) =>
        canvas.toBlob(data => data ? resolve(data) : reject(new Error("Statement PDF page rendering failed.")), "image/jpeg", .91));
      jpegPages.push(new Uint8Array(await blob.arrayBuffer()));
    }
    downloadBlob(createA4Pdf(jpegPages), "LAND-VIEW-Project-Statement-" + code + "-" + new Date().toISOString().slice(0,10) + ".pdf");
    return jpegPages.length;
  } finally {
    frame.remove();
    pdfBusy = false;
  }
}
