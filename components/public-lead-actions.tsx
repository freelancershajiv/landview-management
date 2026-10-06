"use client";

import { usePathname } from "next/navigation";

const PUBLIC_PREFIXES = ["/services", "/projects", "/team", "/contact", "/feni", "/bn"];
const WHATSAPP_NUMBER = "8801408080400";
const PHONE_NUMBER = "+8801408080400";
const WHATSAPP_MESSAGE = "Hello LAND VIEW, I would like to discuss a building project. Please guide me about the next steps.";

function isPublicMarketingPath(pathname: string) {
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export default function PublicLeadActions() {
  const pathname = usePathname();
  if (!isPublicMarketingPath(pathname || "/")) return null;

  const whatsappHref = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`;

  return (
    <div className="lv-public-lead-actions" aria-label="Contact LAND VIEW">
      <a
        className="lv-public-lead-action lv-public-whatsapp"
        href={whatsappHref}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Discuss your project with LAND VIEW on WhatsApp"
      >
        <span className="lv-public-lead-icon" aria-hidden="true">◉</span>
        <span className="lv-public-lead-copy"><strong>WhatsApp</strong><small>Discuss your project</small></span>
      </a>
      <a className="lv-public-lead-action lv-public-call" href={`tel:${PHONE_NUMBER}`} aria-label="Call LAND VIEW engineering enquiries">
        <span className="lv-public-lead-icon" aria-hidden="true">☎</span>
        <span className="lv-public-lead-copy"><strong>Call</strong><small>Engineering enquiries</small></span>
      </a>
      <style>{`
        .lv-public-lead-actions{position:fixed;right:18px;bottom:78px;z-index:95;display:grid;gap:8px;pointer-events:none}
        .lv-public-lead-action{pointer-events:auto;min-height:48px;display:flex;align-items:center;gap:10px;padding:8px 13px 8px 10px;border:1px solid rgba(255,255,255,.16);border-radius:12px;background:rgba(8,17,25,.95);color:#fff!important;text-decoration:none;box-shadow:0 14px 34px rgba(0,0,0,.3);backdrop-filter:blur(12px);transition:transform .18s ease,border-color .18s ease,filter .18s ease}
        .lv-public-lead-action:hover{transform:translateY(-2px);border-color:rgba(239,74,80,.75);filter:brightness(1.08)}
        .lv-public-whatsapp{border-color:rgba(76,175,80,.52)}
        .lv-public-lead-icon{width:32px;height:32px;display:grid;place-items:center;border-radius:9px;background:rgba(255,255,255,.08);font-size:16px;flex:0 0 auto}
        .lv-public-whatsapp .lv-public-lead-icon{background:rgba(76,175,80,.16)}
        .lv-public-call .lv-public-lead-icon{background:rgba(239,74,80,.14);color:#ef4a50}
        .lv-public-lead-copy{display:grid;gap:1px;line-height:1.15}
        .lv-public-lead-copy strong{font-size:11px;letter-spacing:.04em;text-transform:uppercase}
        .lv-public-lead-copy small{font-size:10px;color:#aeb9c2;white-space:nowrap}
        @media(max-width:620px){
          .lv-public-lead-actions{right:12px;bottom:72px;display:flex;gap:7px}
          .lv-public-lead-action{min-height:46px;padding:7px;border-radius:50%}
          .lv-public-lead-icon{width:32px;height:32px}
          .lv-public-lead-copy{display:none}
        }
      `}</style>
    </div>
  );
}
