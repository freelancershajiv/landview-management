import html2canvas from "html2canvas";
import type { SheetInvoices } from "@/lib/sheet-invoices";

const MAX_PDF_BYTES = 2_500_000;
let pending = false;

type JpegPage = { blob: Blob; width: number; height: number };

function safePart(value: unknown) {
  return String(value ?? "")
    .trim()
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._ -]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);
}

function printMedia(value: string) {
  const text = String(value || "").toLowerCase();
  return /\bprint\b/.test(text) && !/\bnot\s+print\b/.test(text);
}

function scopeSelector(selector: string, host: string) {
  return selector.split(",").map((part) => {
    const value = part.trim();
    if (!value || value === "html" || value === "body" || value === ":root") return host;
    if (/^(?:html\s+body|html|body|:root)\b/.test(value)) {
      return host + value.replace(/^(?:html\s+body|html|body|:root)/, "");
    }
    return `${host} ${value}`;
  }).join(", ");
}

function collectPrintCss(rules: CSSRuleList, host: string, insidePrint = false): string {
  let css = "";
  for (const rule of Array.from(rules)) {
    if (rule.type === CSSRule.MEDIA_RULE) {
      const media = rule as CSSMediaRule;
      css += collectPrintCss(media.cssRules, host, insidePrint || printMedia(media.media.mediaText));
      continue;
    }
    const nested = rule as CSSRule & { cssRules?: CSSRuleList };
    if (nested.cssRules && rule.type !== CSSRule.STYLE_RULE) {
      css += collectPrintCss(nested.cssRules, host, insidePrint);
      continue;
    }
    if (!insidePrint || rule.type !== CSSRule.STYLE_RULE) continue;
    const style = rule as CSSStyleRule;
    css += `${scopeSelector(style.selectorText, host)}{${style.style.cssText}}\n`;
  }
  return css;
}

function scopedPrintCss(host: string) {
  let css = "";
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      css += collectPrintCss(sheet.cssRules, host, printMedia(sheet.media.mediaText));
    } catch {
      // Ignore inaccessible third-party stylesheets. LAND VIEW invoice CSS is same-origin.
    }
  }
  return css;
}

function waitFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

async function waitImages(root: HTMLElement) {
  await Promise.all(Array.from(root.querySelectorAll<HTMLImageElement>("img")).map(async (image) => {
    if (!image.complete) {
      await new Promise<void>((resolve) => {
        const done = () => resolve();
        image.addEventListener("load", done, { once: true });
        image.addEventListener("error", done, { once: true });
      });
    }
    try { await image.decode(); } catch {}
  }));
}

function printablePages(root: HTMLElement) {
  const pages = Array.from(root.querySelectorAll<HTMLElement>("article")).filter((element) => {
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const rect = element.getBoundingClientRect();
    if (rect.width < 650 || rect.width > 1000 || rect.height < 900) return false;
    const ratio = rect.height / rect.width;
    return ratio > 1.32 && ratio < 1.52;
  });
  return pages.filter((page) => !pages.some((other) => other !== page && page.contains(other)));
}

function canvasJpeg(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not render the invoice PDF page.")), "image/jpeg", quality);
  });
}

async function renderPage(page: HTMLElement, scale: number, quality: number): Promise<JpegPage> {
  const rect = page.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const canvas = await html2canvas(page, {
    backgroundColor: "#ffffff",
    scale,
    useCORS: true,
    allowTaint: false,
    logging: false,
    width,
    height,
    windowWidth: width,
    windowHeight: height,
    scrollX: 0,
    scrollY: 0,
    imageTimeout: 8000,
  });
  return { blob: await canvasJpeg(canvas, quality), width: canvas.width, height: canvas.height };
}

const ascii = (value: string) => new TextEncoder().encode(value);

function joinBytes(parts: Uint8Array[]) {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.byteLength; }
  return output;
}

async function makePdf(pages: JpegPage[]) {
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const lastObject = 2 + pages.length * 3;
  const objects = new Map<number, Uint8Array>();
  const object = (id: number, parts: Uint8Array[]) => {
    objects.set(id, joinBytes([ascii(`${id} 0 obj\n`), ...parts, ascii("\nendobj\n")]));
  };

  object(1, [ascii("<< /Type /Catalog /Pages 2 0 R >>")]);
  object(2, [ascii(`<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(" ")}] /Count ${pages.length} >>`)]);

  for (let i = 0; i < pages.length; i += 1) {
    const page = pages[i];
    const pageId = 3 + i * 3;
    const imageId = pageId + 1;
    const contentId = pageId + 2;
    const image = new Uint8Array(await page.blob.arrayBuffer());
    const stream = ascii(`q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im${i + 1} Do\nQ\n`);
    object(pageId, [ascii(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im${i + 1} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`)]);
    object(imageId, [ascii(`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Interpolate true /Length ${image.byteLength} >>\nstream\n`), image, ascii("\nendstream")]);
    object(contentId, [ascii(`<< /Length ${stream.byteLength} >>\nstream\n`), stream, ascii("endstream")]);
  }

  const chunks: Uint8Array[] = [ascii("%PDF-1.4\n")];
  const offsets = new Array<number>(lastObject + 1).fill(0);
  let cursor = chunks[0].byteLength;
  for (let id = 1; id <= lastObject; id += 1) {
    const data = objects.get(id);
    if (!data) throw new Error("Invoice PDF assembly failed.");
    offsets[id] = cursor;
    chunks.push(data);
    cursor += data.byteLength;
  }
  const xref = cursor;
  const lines = ["xref", `0 ${lastObject + 1}`, "0000000000 65535 f "];
  for (let id = 1; id <= lastObject; id += 1) lines.push(`${String(offsets[id]).padStart(10, "0")} 00000 n `);
  chunks.push(ascii(`${lines.join("\n")}\ntrailer\n<< /Size ${lastObject + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
  const bytes = joinBytes(chunks);
  return new Blob([bytes.buffer], { type: "application/pdf" });
}

export async function createBillingPdf(result: SheetInvoices) {
  if (pending) throw new Error("The invoice PDF is already being prepared.");
  const source = Array.from(document.querySelectorAll<HTMLElement>("[data-billing-id]"))
    .find((element) => element.dataset.billingId === result.id);
  if (!source) throw new Error("The printable billing document is not ready.");
  if (/^LV-\d+$/.test(result.id) && !source.querySelector("img[data-billing-qr]")) {
    throw new Error("The invoice QR is not ready. Wait for verification to finish, then try again.");
  }

  pending = true;
  const key = `lv-pdf-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const selector = `[data-whatsapp-pdf-host="${key}"]`;
  const host = document.createElement("div");
  host.dataset.whatsappPdfHost = key;
  host.style.cssText = "position:fixed;left:-100000px;top:0;width:210mm;background:#fff;pointer-events:none;z-index:-2147483648;";
  const clone = source.cloneNode(true) as HTMLElement;
  host.appendChild(clone);
  const style = document.createElement("style");
  style.textContent = scopedPrintCss(selector);

  try {
    document.head.appendChild(style);
    document.body.appendChild(host);
    await waitImages(clone);
    if (document.fonts?.ready) await document.fonts.ready;
    await waitFrame();
    await waitFrame();

    const pages = printablePages(clone);
    if (!pages.length) throw new Error("No printable A4 invoice pages were found.");

    let pdf: Blob | null = null;
    for (const settings of [{ scale: 1.3, quality: 0.78 }, { scale: 1.08, quality: 0.64 }]) {
      const rendered: JpegPage[] = [];
      for (const page of pages) rendered.push(await renderPage(page, settings.scale, settings.quality));
      pdf = await makePdf(rendered);
      if (pdf.size <= MAX_PDF_BYTES) break;
    }
    if (!pdf || pdf.size > MAX_PDF_BYTES) {
      throw new Error("This invoice is too large to send directly through WhatsApp. Use Print / Save PDF for this unusually long invoice.");
    }

    const filename = [safePart(result.id), safePart(result.client.name || "Client"), "Invoice"].filter(Boolean).join("-") + ".pdf";
    return { blob: pdf, filename, pageCount: pages.length };
  } finally {
    host.remove();
    style.remove();
    pending = false;
  }
}
