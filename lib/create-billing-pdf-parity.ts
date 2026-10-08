import html2canvas from "html2canvas";
import type { SheetInvoices } from "@/lib/sheet-invoices";

const MAX_PDF_BYTES = 2_500_000;
const SAFE_PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
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

function splitSelectorList(selectorText: string) {
  const parts: string[] = [];
  let current = "";
  let round = 0;
  let square = 0;
  let quote = "";
  for (let i = 0; i < selectorText.length; i += 1) {
    const char = selectorText[i];
    if (quote) {
      current += char;
      if (char === quote && selectorText[i - 1] !== "\\") quote = "";
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === "(") round += 1;
    if (char === ")") round = Math.max(0, round - 1);
    if (char === "[") square += 1;
    if (char === "]") square = Math.max(0, square - 1);
    if (char === "," && round === 0 && square === 0) {
      if (current.trim()) parts.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function isPrintMedia(mediaText: string) {
  const text = String(mediaText || "").toLowerCase();
  return /\bprint\b/.test(text) && !/\bnot\s+print\b/.test(text);
}

function scopeSelector(selector: string, hostSelector: string) {
  const value = selector.trim();
  if (!value) return hostSelector;
  if (value === "html" || value === "body" || value === ":root") return hostSelector;
  if (value.startsWith("html body")) return `${hostSelector}${value.slice("html body".length)}`;
  if (value.startsWith("body")) return `${hostSelector}${value.slice("body".length)}`;
  if (value.startsWith("html")) return `${hostSelector}${value.slice("html".length)}`;
  if (value.startsWith(":root")) return `${hostSelector}${value.slice(":root".length)}`;
  return `${hostSelector} ${value}`;
}

function collectPrintRules(rules: CSSRuleList, hostSelector: string, inPrint = false): string {
  let output = "";
  for (const rule of Array.from(rules)) {
    if (rule.type === CSSRule.MEDIA_RULE) {
      const mediaRule = rule as CSSMediaRule;
      output += collectPrintRules(mediaRule.cssRules, hostSelector, inPrint || isPrintMedia(mediaRule.media.mediaText));
      continue;
    }
    const nested = rule as CSSRule & { cssRules?: CSSRuleList };
    if (nested.cssRules && rule.type !== CSSRule.STYLE_RULE) {
      output += collectPrintRules(nested.cssRules, hostSelector, inPrint);
      continue;
    }
    if (!inPrint || rule.type !== CSSRule.STYLE_RULE) continue;
    const styleRule = rule as CSSStyleRule;
    const selectors = splitSelectorList(styleRule.selectorText)
      .map((selector) => scopeSelector(selector, hostSelector))
      .join(", ");
    if (selectors) output += `${selectors}{${styleRule.style.cssText}}\n`;
  }
  return output;
}

function scopedPrintCss(hostSelector: string) {
  let output = "";
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      output += collectPrintRules(sheet.cssRules, hostSelector, isPrintMedia(sheet.media.mediaText));
    } catch {
      // Ignore inaccessible third-party stylesheets. LAND VIEW invoice styles are same-origin.
    }
  }
  return output;
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

function safeComputedValue(property: string, value: string) {
  if (!/url\(/i.test(value)) return value;
  if (/^(background-image|mask-image|-webkit-mask-image|border-image-source|list-style-image|cursor|content)$/i.test(property)) {
    return property === "cursor" ? "auto" : "none";
  }
  return "";
}

function freezeComputedStyles(root: HTMLElement) {
  const elements: HTMLElement[] = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))];
  const snapshots = elements.map((element) => {
    const computed = getComputedStyle(element);
    let cssText = "";
    for (const property of Array.from(computed)) {
      const value = safeComputedValue(property, computed.getPropertyValue(property));
      if (value) cssText += `${property}:${value};`;
    }
    return { element, cssText };
  });
  snapshots.forEach(({ element, cssText }) => element.setAttribute("style", cssText));
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read invoice image data."));
    reader.readAsDataURL(blob);
  });
}

async function resourceToDataUrl(src: string) {
  if (src.startsWith("data:")) return src;
  const absolute = new URL(src, window.location.href);
  const response = await fetch(absolute.href, {
    mode: "cors",
    credentials: absolute.origin === window.location.origin ? "same-origin" : "omit",
    cache: "force-cache",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return blobToDataUrl(await response.blob());
}

async function embedImages(root: HTMLElement) {
  await Promise.all(Array.from(root.querySelectorAll<HTMLImageElement>("img")).map(async (image) => {
    image.removeAttribute("srcset");
    image.removeAttribute("sizes");
    image.removeAttribute("crossorigin");
    image.removeAttribute("loading");
    image.setAttribute("decoding", "sync");
    const src = image.currentSrc || image.src;
    if (!src) {
      image.src = SAFE_PIXEL;
      return;
    }
    try {
      image.src = await resourceToDataUrl(src);
    } catch {
      image.src = SAFE_PIXEL;
    }
  }));

  await Promise.all(Array.from(root.querySelectorAll<SVGImageElement>("svg image")).map(async (image) => {
    const src = image.getAttribute("href") || image.getAttributeNS("http://www.w3.org/1999/xlink", "href") || "";
    if (!src) return;
    try {
      image.setAttribute("href", await resourceToDataUrl(src));
      image.removeAttributeNS("http://www.w3.org/1999/xlink", "href");
    } catch {
      image.removeAttribute("href");
      image.removeAttributeNS("http://www.w3.org/1999/xlink", "href");
    }
  }));
}

function stripNetworkReferences(root: HTMLElement) {
  [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))].forEach((element) => {
    element.removeAttribute("srcset");
    element.removeAttribute("sizes");
    const inlineStyle = element.getAttribute("style");
    if (!inlineStyle || !/url\(/i.test(inlineStyle)) return;
    for (const property of Array.from(element.style)) {
      if (/url\(/i.test(element.style.getPropertyValue(property))) element.style.removeProperty(property);
    }
  });
}

function printablePages(root: HTMLElement) {
  const candidates = Array.from(root.querySelectorAll<HTMLElement>("article"));
  const pages = candidates.filter((element) => {
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity || 1) === 0) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width < 650 || rect.width > 1000 || rect.height < 900) return false;
    const ratio = rect.height / rect.width;
    return ratio > 1.32 && ratio < 1.52;
  });
  return pages.filter((page) => !pages.some((other) => other !== page && page.contains(other)));
}

function canvasJpeg(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    try {
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error("Could not render the invoice PDF page.")),
        "image/jpeg",
        quality,
      );
    } catch (error) {
      reject(error instanceof Error ? error : new Error("The browser could not render the invoice PDF page."));
    }
  });
}

async function preparePage(page: HTMLElement) {
  // At this point the off-screen clone already has the same @media print rules as
  // Print / Save PDF. Freeze those computed values before html2canvas renders so
  // screen-only CSS, viewport changes, or CSS-module ordering cannot alter it.
  freezeComputedStyles(page);
  await embedImages(page);
  stripNetworkReferences(page);
  await waitImages(page);
  await waitFrame();
}

async function renderPage(page: HTMLElement, scale: number, quality: number): Promise<JpegPage> {
  const rect = page.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const canvas = await html2canvas(page, {
    backgroundColor: "#ffffff",
    scale,
    useCORS: false,
    allowTaint: false,
    foreignObjectRendering: false,
    logging: false,
    width,
    height,
    windowWidth: width,
    windowHeight: height,
    scrollX: 0,
    scrollY: 0,
    imageTimeout: 5000,
  });
  return { blob: await canvasJpeg(canvas, quality), width: canvas.width, height: canvas.height };
}

const ascii = (value: string) => new TextEncoder().encode(value);

function joinBytes(parts: Uint8Array[]) {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
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
  const key = `lv-whatsapp-pdf-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const hostSelector = `[data-whatsapp-pdf-host="${key}"]`;
  const host = document.createElement("div");
  host.dataset.whatsappPdfHost = key;
  host.style.cssText = "position:fixed;left:-100000px;top:0;width:210mm;background:#fff;pointer-events:none;z-index:-2147483648;";
  const clone = source.cloneNode(true) as HTMLElement;
  host.appendChild(clone);
  const printStyle = document.createElement("style");
  printStyle.dataset.whatsappPdfStyle = key;
  printStyle.textContent = scopedPrintCss(hostSelector);

  try {
    document.head.appendChild(printStyle);
    document.body.appendChild(host);
    await waitImages(source);
    if (document.fonts?.ready) await document.fonts.ready;
    await waitFrame();
    await waitFrame();

    const pages = printablePages(clone);
    if (!pages.length) throw new Error("No printable A4 invoice pages were found.");

    for (const page of pages) await preparePage(page);

    let pdf: Blob | null = null;
    const settings = [
      { scale: 2.0, quality: 0.90 },
      { scale: 1.65, quality: 0.82 },
      { scale: 1.32, quality: 0.72 },
    ];
    for (const setting of settings) {
      const rendered: JpegPage[] = [];
      for (const page of pages) rendered.push(await renderPage(page, setting.scale, setting.quality));
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
    printStyle.remove();
    pending = false;
  }
}
