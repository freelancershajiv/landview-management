import type { SheetInvoices } from "@/lib/sheet-invoices";
import html2canvas from "html2canvas";

let jpgExportPending = false;
const SAFE_PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

function safeFilePart(value: string) {
  return String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
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

function isPrintMedia(mediaText: string) {
  const text = String(mediaText || "").toLowerCase();
  return /\bprint\b/.test(text) && !/\bnot\s+print\b/.test(text);
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

function getScopedPrintCss(hostSelector: string) {
  let output = "";
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      output += collectPrintRules(sheet.cssRules, hostSelector, isPrintMedia(sheet.media.mediaText));
    } catch {
      // Ignore inaccessible cross-origin stylesheets. LAND VIEW print styles are same-origin.
    }
  }
  return output;
}

function waitForFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

async function waitForImages(root: HTMLElement) {
  const images = Array.from(root.querySelectorAll<HTMLImageElement>("img"));
  await Promise.all(images.map(async (image) => {
    if (!image.complete) {
      await new Promise<void>((resolve) => {
        const done = () => resolve();
        image.addEventListener("load", done, { once: true });
        image.addEventListener("error", done, { once: true });
      });
    }
    try {
      await image.decode();
    } catch {
      // A broken optional image should not stop text/table export.
    }
  }));
}

function safeComputedValue(property: string, value: string) {
  if (!/url\(/i.test(value)) return value;
  // Never serialize URL-backed CSS resources into the SVG. Even a single
  // remote background/mask can taint the canvas after drawImage().
  if (/^(background-image|mask-image|-webkit-mask-image|border-image-source|list-style-image|cursor|content)$/i.test(property)) {
    return property === "cursor" ? "auto" : "none";
  }
  return "";
}

function inlineComputedStyles(source: Element, target: Element) {
  const computed = getComputedStyle(source);
  const targetElement = target as HTMLElement;
  let cssText = "";
  for (const property of Array.from(computed)) {
    const value = safeComputedValue(property, computed.getPropertyValue(property));
    if (value) cssText += `${property}:${value};`;
  }
  targetElement.setAttribute("style", cssText);

  const sourceChildren = Array.from(source.children);
  const targetChildren = Array.from(target.children);
  for (let i = 0; i < sourceChildren.length; i += 1) {
    if (targetChildren[i]) inlineComputedStyles(sourceChildren[i], targetChildren[i]);
  }
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read image data."));
    reader.readAsDataURL(blob);
  });
}

async function resourceToDataUrl(src: string) {
  if (src.startsWith("data:")) return src;
  const response = await fetch(src, {
    mode: "cors",
    credentials: new URL(src, window.location.href).origin === window.location.origin ? "same-origin" : "omit",
    cache: "force-cache",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return blobToDataUrl(await response.blob());
}

async function embedImages(source: HTMLElement, target: HTMLElement) {
  const sourceImages = Array.from(source.querySelectorAll<HTMLImageElement>("img"));
  const targetImages = Array.from(target.querySelectorAll<HTMLImageElement>("img"));
  await Promise.all(sourceImages.map(async (image, index) => {
    const targetImage = targetImages[index];
    if (!targetImage) return;

    // Browsers may prefer srcset over src. Remove every alternate network
    // source before assigning the embedded data URI.
    targetImage.removeAttribute("srcset");
    targetImage.removeAttribute("sizes");
    targetImage.removeAttribute("crossorigin");
    targetImage.removeAttribute("loading");
    targetImage.setAttribute("decoding", "sync");

    const src = image.currentSrc || image.src;
    if (!src) {
      targetImage.src = SAFE_PIXEL;
      return;
    }

    try {
      targetImage.src = await resourceToDataUrl(src);
    } catch {
      // Do NOT fall back to the original URL. A remote URL here would taint
      // the canvas and make canvas.toBlob() throw a SecurityError.
      targetImage.src = SAFE_PIXEL;
    }
  }));

  // Inline SVG <image> nodes can also point to external resources. Embed them
  // when possible; otherwise remove the network reference entirely.
  const sourceSvgImages = Array.from(source.querySelectorAll<SVGImageElement>("svg image"));
  const targetSvgImages = Array.from(target.querySelectorAll<SVGImageElement>("svg image"));
  await Promise.all(sourceSvgImages.map(async (image, index) => {
    const targetImage = targetSvgImages[index];
    if (!targetImage) return;
    const src = image.getAttribute("href") || image.getAttributeNS("http://www.w3.org/1999/xlink", "href") || "";
    if (!src) return;
    try {
      const embedded = await resourceToDataUrl(src);
      targetImage.setAttribute("href", embedded);
      targetImage.removeAttributeNS("http://www.w3.org/1999/xlink", "href");
    } catch {
      targetImage.removeAttribute("href");
      targetImage.removeAttributeNS("http://www.w3.org/1999/xlink", "href");
    }
  }));
}

function stripNetworkReferences(root: HTMLElement) {
  [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))].forEach((element) => {
    element.removeAttribute("srcset");
    element.removeAttribute("sizes");
    const style = element.getAttribute("style");
    if (style && /url\(/i.test(style)) {
      for (const property of Array.from(element.style)) {
        if (/url\(/i.test(element.style.getPropertyValue(property))) {
          element.style.removeProperty(property);
        }
      }
    }
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("The browser could not create the JPG file."));
      }, "image/jpeg", 0.96);
    } catch (error) {
      reject(error instanceof Error ? error : new Error("The browser blocked JPG export."));
    }
  });
}

async function renderPageToJpeg(page: HTMLElement) {
  const rect = page.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const scale = Math.min(3, Math.max(2, window.devicePixelRatio || 1));

  // The page lives only inside the off-screen JPG export host, so it is
  // safe to sanitize it in place. Embedding all <img> resources and
  // inlining URL-free computed styles keeps html2canvas origin-clean.
  inlineComputedStyles(page, page);
  await embedImages(page, page);
  stripNetworkReferences(page);
  await waitForFrame();

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

  return canvasToJpeg(canvas);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function findPrintablePages(root: HTMLElement) {
  const candidates = Array.from(root.querySelectorAll<HTMLElement>("article, section, div"));
  const pages = candidates.filter((element) => {
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity || 1) === 0) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width < 650 || rect.width > 1000 || rect.height < 900) return false;
    const ratio = rect.height / rect.width;
    return ratio > 1.34 && ratio < 1.5;
  });
  return pages.filter((page) => !pages.some((other) => other !== page && page.contains(other)));
}

export async function saveBillingJpg(result: SheetInvoices, documentLabel = "Billing-Statement") {
  if (jpgExportPending) return 0;
  const sourceRoot = Array.from(document.querySelectorAll<HTMLElement>("[data-billing-id]"))
    .find((element) => element.dataset.billingId === result.id);
  if (!sourceRoot) throw new Error("The printable billing document is not ready.");

  const qrImage = sourceRoot.querySelector<HTMLImageElement>("img[data-billing-qr]");
  if (/^LV-\d+$/.test(result.id) && !qrImage) {
    throw new Error("The invoice QR is not ready. Wait for verification to finish, then try Save JPG again.");
  }

  jpgExportPending = true;
  const hostKey = `lv-jpg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const hostSelector = `[data-jpg-export-host="${hostKey}"]`;
  const host = document.createElement("div");
  host.dataset.jpgExportHost = hostKey;
  host.style.cssText = "position:fixed;left:-100000px;top:0;width:210mm;background:#fff;pointer-events:none;z-index:-2147483648;";
  const cloneRoot = sourceRoot.cloneNode(true) as HTMLElement;
  host.appendChild(cloneRoot);
  const printStyle = document.createElement("style");
  printStyle.dataset.jpgExportStyle = hostKey;
  printStyle.textContent = getScopedPrintCss(hostSelector);

  try {
    document.head.appendChild(printStyle);
    document.body.appendChild(host);
    await waitForImages(sourceRoot);
    if (document.fonts?.ready) await document.fonts.ready;
    await waitForFrame();
    await waitForFrame();

    const pages = findPrintablePages(cloneRoot);
    if (!pages.length) throw new Error("No printable A4 pages were found for JPG export.");

    const displayName = safeFilePart(result.client?.name || result.id || "Project");
    const baseName = [safeFilePart(result.id), displayName, safeFilePart(documentLabel)].filter(Boolean).join("-");
    const blobs: Blob[] = [];
    for (const page of pages) blobs.push(await renderPageToJpeg(page));

    blobs.forEach((blob, index) => {
      const suffix = blobs.length > 1 ? `-${String(index + 1).padStart(2, "0")}` : "";
      downloadBlob(blob, `${baseName}${suffix}.jpg`);
    });
    return blobs.length;
  } finally {
    host.remove();
    printStyle.remove();
    jpgExportPending = false;
  }
}
