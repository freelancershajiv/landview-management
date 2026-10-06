from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

HELPER = r'''import type { SheetInvoices } from "@/lib/sheet-invoices";

let jpgExportPending = false;

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

function inlineComputedStyles(source: Element, target: Element) {
  const computed = getComputedStyle(source);
  const targetElement = target as HTMLElement;
  let cssText = "";
  for (const property of Array.from(computed)) {
    const value = computed.getPropertyValue(property);
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

async function embedImages(source: HTMLElement, target: HTMLElement) {
  const sourceImages = Array.from(source.querySelectorAll<HTMLImageElement>("img"));
  const targetImages = Array.from(target.querySelectorAll<HTMLImageElement>("img"));
  await Promise.all(sourceImages.map(async (image, index) => {
    const targetImage = targetImages[index];
    if (!targetImage) return;
    const src = image.currentSrc || image.src;
    if (!src) return;
    if (src.startsWith("data:")) {
      targetImage.src = src;
      return;
    }
    try {
      const response = await fetch(src, { credentials: "same-origin", cache: "force-cache" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      targetImage.src = await blobToDataUrl(await response.blob());
    } catch {
      targetImage.src = src;
    }
  }));
}

function loadSvgImage(blob: Blob) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.decoding = "sync";
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("The JPG renderer could not read the printable page."));
    };
    image.src = url;
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The browser could not create the JPG file."));
    }, "image/jpeg", 0.96);
  });
}

async function renderPageToJpeg(page: HTMLElement) {
  const rect = page.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const clone = page.cloneNode(true) as HTMLElement;
  inlineComputedStyles(page, clone);
  await embedImages(page, clone);

  const wrapper = document.createElement("div");
  wrapper.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  wrapper.style.width = `${width}px`;
  wrapper.style.height = `${height}px`;
  wrapper.style.margin = "0";
  wrapper.style.padding = "0";
  wrapper.style.background = "#fff";
  wrapper.appendChild(clone);

  const markup = new XMLSerializer().serializeToString(wrapper);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject width="100%" height="100%">${markup}</foreignObject></svg>`;
  const image = await loadSvgImage(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));

  const scale = Math.min(3, Math.max(2, window.devicePixelRatio || 1));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The browser does not support JPG canvas export.");
  context.scale(scale, scale);
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
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
'''


def replace_once(path: Path, old: str, new: str):
    text = path.read_text(encoding="utf-8")
    if old not in text:
        raise RuntimeError(f"Expected patch anchor not found in {path}: {old[:120]!r}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


helper_path = ROOT / "lib" / "save-document-jpg.ts"
helper_path.write_text(HELPER, encoding="utf-8")

billing = ROOT / "app" / "admin" / "finance" / "invoices" / "page.tsx"
replace_once(
    billing,
    'import EmailInvoiceButton from "@/components/email-invoice-button";\n',
    'import EmailInvoiceButton from "@/components/email-invoice-button";\nimport { saveBillingJpg } from "@/lib/save-document-jpg";\n',
)
replace_once(
    billing,
    '<button className={styles.printButton} type="button" onClick={() => printBillingPdf(result)}>Print / Save PDF</button>',
    '<button className={styles.printButton} type="button" onClick={() => printBillingPdf(result)}>Print / Save PDF</button>\n              <button className={styles.printButton} type="button" onClick={() => void saveBillingJpg(result).catch((error) => window.alert(error instanceof Error ? error.message : "Could not save JPG."))}>Save JPG</button>',
)

proposal = ROOT / "components" / "proposal-workspace.tsx"
replace_once(
    proposal,
    'import { printBillingPdf } from "@/components/project-billing-document";\n',
    'import { printBillingPdf } from "@/components/project-billing-document";\nimport { saveBillingJpg } from "@/lib/save-document-jpg";\n',
)
replace_once(
    proposal,
    '  const [printing,setPrinting]=useState(false);\n',
    '  const [printing,setPrinting]=useState(false);\n  const [exportingJpg,setExportingJpg]=useState(false);\n',
)

print_handler_end = '''  async function printProposal(){
    if(printing||saving)return;
    if(!record.Proposal_ID||!bundle)return setError("Save the proposal before printing.");
    if(editing)return setError("Save your changes before printing.");
    if(!canPrint)return setError("Your account does not have Print / Save PDF permission.");
    setError("");
    setPrinting(true);
    try{
      // Use the same saved data and print helper as the visible Finance-style preview.
      const printed=await printBillingPdf(toFinanceInvoice(bundle,record.Proposal_ID));
      if(!printed)return;
      setStage(3);
      // Recording activity must not delay opening the browser print dialog.
      void updateProposalAction(record.Proposal_ID,"print").catch(()=>{
        setMessage("Print activity could not be recorded. The saved proposal is unchanged.");
      });
    }catch(e){
      setError(e instanceof Error?e.message:"Could not print proposal.");
    }finally{
      setPrinting(false);
    }
  }
'''

jpg_handler = print_handler_end + '''
  async function saveProposalJpg(){
    if(exportingJpg||printing||saving)return;
    if(!record.Proposal_ID||!bundle)return setError("Save the proposal before exporting JPG.");
    if(editing)return setError("Save your changes before exporting JPG.");
    if(!canPrint)return setError("Your account does not have proposal export permission.");
    setError("");
    setExportingJpg(true);
    try{
      const pages=await saveBillingJpg(toFinanceInvoice(bundle,record.Proposal_ID),"Proposal");
      if(!pages)return;
      setStage(3);
      setMessage(`${record.Proposal_ID} saved as ${pages===1?"a JPG":"JPG pages"}.`);
    }catch(e){
      setError(e instanceof Error?e.message:"Could not save proposal JPG.");
    }finally{
      setExportingJpg(false);
    }
  }
'''
replace_once(proposal, print_handler_end, jpg_handler)

print_button = '{record.Proposal_ID&&canPrint&&<button className="pw-btn primary" disabled={printing||saving||editing||!bundle} onClick={()=>void printProposal()}>{printing?"Preparing PDF…":"Print / Save PDF"}</button>}'
replace_once(
    proposal,
    print_button,
    print_button + '{record.Proposal_ID&&canPrint&&<button className="pw-btn" disabled={exportingJpg||printing||saving||editing||!bundle} onClick={()=>void saveProposalJpg()}>{exportingJpg?"Preparing JPG…":"Save JPG"}</button>}',
)
replace_once(proposal, '<b>3 · Print / PDF</b>', '<b>3 · Print / PDF / JPG</b>')

print("Applied Billing + Proposal Save JPG export.")
