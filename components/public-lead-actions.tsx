"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const PUBLIC_PREFIXES = ["/services", "/projects", "/team", "/contact", "/feni", "/bn"];
const WHATSAPP_NUMBER = "8801408080400";
const PHONE_NUMBER = "+8801408080400";
const WHATSAPP_MESSAGE = "Hello LAND VIEW, I would like to discuss a building project. Please guide me about the next steps.";
const SERVICE_OPTIONS = ["Architectural Design", "Structural Design", "3D Design - Exterior", "3D Design - Interior", "Electrical Design", "Fire Safety Design", "Plumbing Design", "Plan Approval Design", "Estimate & Costing", "Site Supervision"];

function isPublicMarketingPath(pathname: string) {
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

type FormState = {
  name: string;
  phone: string;
  email: string;
  projectLocation: string;
  projectType: string;
  proposedFloors: string;
  services: string[];
  message: string;
  website: string;
};

const EMPTY_FORM: FormState = { name: "", phone: "", email: "", projectLocation: "", projectType: "", proposedFloors: "", services: [], message: "", website: "" };

export default function PublicLeadActions() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [leadCode, setLeadCode] = useState("");

  const isPublic = isPublicMarketingPath(pathname || "/");
  const whatsappHref = useMemo(() => `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`, []);

  useEffect(() => {
    if (!open) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = before; window.removeEventListener("keydown", onKey); };
  }, [open]);

  if (!isPublic) return null;

  function toggleService(service: string) {
    setForm((current) => ({ ...current, services: current.services.includes(service) ? current.services.filter((item) => item !== service) : [...current.services, service] }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setLeadCode("");
    try {
      const response = await fetch("/api/public/enquiry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          sourcePath: `${pathname || "/"}${searchParams?.toString() ? `?${searchParams.toString()}` : ""}`,
          sourceReferrer: document.referrer || "",
          utmSource: searchParams?.get("utm_source") || "",
          utmMedium: searchParams?.get("utm_medium") || "",
          utmCampaign: searchParams?.get("utm_campaign") || "",
        }),
      });
      const json = await response.json();
      if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not submit your project enquiry."));
      setLeadCode(String(json?.data?.leadCode || "Submitted"));
      setForm(EMPTY_FORM);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit your project enquiry.");
    } finally { setBusy(false); }
  }

  return (
    <>
      <div className="lv-public-lead-actions" aria-label="Contact LAND VIEW">
        <button className="lv-public-lead-action lv-public-enquiry" type="button" onClick={() => { setOpen(true); setError(""); }} aria-label="Send a project enquiry to LAND VIEW">
          <span className="lv-public-lead-icon" aria-hidden="true">✎</span>
          <span className="lv-public-lead-copy"><strong>Project Enquiry</strong><small>Get a project-specific response</small></span>
        </button>
        <a className="lv-public-lead-action lv-public-whatsapp" href={whatsappHref} target="_blank" rel="noopener noreferrer" aria-label="Discuss your project with LAND VIEW on WhatsApp">
          <span className="lv-public-lead-icon" aria-hidden="true">◉</span>
          <span className="lv-public-lead-copy"><strong>WhatsApp</strong><small>Discuss your project</small></span>
        </a>
        <a className="lv-public-lead-action lv-public-call" href={`tel:${PHONE_NUMBER}`} aria-label="Call LAND VIEW engineering enquiries">
          <span className="lv-public-lead-icon" aria-hidden="true">☎</span>
          <span className="lv-public-lead-copy"><strong>Call</strong><small>Engineering enquiries</small></span>
        </a>
      </div>

      {open ? <div className="lv-enquiry-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
        <section className="lv-enquiry-modal" role="dialog" aria-modal="true" aria-labelledby="lv-enquiry-title">
          <button className="lv-enquiry-close" type="button" onClick={() => setOpen(false)} aria-label="Close project enquiry">×</button>
          <span className="lv-enquiry-kicker">START A PROJECT</span>
          <h2 id="lv-enquiry-title">Tell LAND VIEW what you are planning.</h2>
          <p>Share the basic project information below. Your enquiry will appear directly in the LAND VIEW management workspace for follow-up.</p>
          {leadCode ? <div className="lv-enquiry-success"><strong>Enquiry received.</strong><span>Reference: {leadCode}</span><small>Our team can now follow this enquiry from the Admin workspace.</small></div> : <form className="lv-enquiry-form" onSubmit={submit}>
            <label>Full Name *<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your name" maxLength={120}/></label>
            <label>Phone<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="01XXXXXXXXX" maxLength={40}/></label>
            <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@example.com" maxLength={180}/></label>
            <label>Project Location<input value={form.projectLocation} onChange={(e) => setForm({ ...form, projectLocation: e.target.value })} placeholder="Area, Upazila / Thana, District" maxLength={300}/></label>
            <label>Project Type<select value={form.projectType} onChange={(e) => setForm({ ...form, projectType: e.target.value })}><option value="">Select type</option><option>Residential</option><option>Commercial</option><option>Mixed Use</option><option>Institutional</option><option>Mosque</option><option>Interior</option><option>Other</option></select></label>
            <label>Proposed Floors<input value={form.proposedFloors} onChange={(e) => setForm({ ...form, proposedFloors: e.target.value })} placeholder="e.g. G+6" maxLength={80}/></label>
            <fieldset className="lv-enquiry-services"><legend>Services Needed</legend><div>{SERVICE_OPTIONS.map((service) => <label key={service}><input type="checkbox" checked={form.services.includes(service)} onChange={() => toggleService(service)}/><span>{service}</span></label>)}</div></fieldset>
            <label className="lv-enquiry-message">Project Notes<textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Land size, design stage, approval requirement, supervision need or any other details…" maxLength={1800}/></label>
            <input className="lv-enquiry-honeypot" tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} aria-hidden="true"/>
            {error ? <div className="lv-enquiry-error">{error}</div> : null}
            <div className="lv-enquiry-submit-row"><button type="submit" disabled={busy}>{busy ? "Submitting…" : "Send Project Enquiry"}</button><small>Provide either a phone number or email so the team can respond.</small></div>
          </form>}
        </section>
      </div> : null}

      <style>{`
        .lv-public-lead-actions{position:fixed;right:18px;bottom:78px;z-index:95;display:grid;gap:8px;pointer-events:none}
        .lv-public-lead-action{pointer-events:auto;min-height:48px;display:flex;align-items:center;gap:10px;padding:8px 13px 8px 10px;border:1px solid rgba(255,255,255,.16);border-radius:12px;background:rgba(8,17,25,.95);color:#fff!important;text-decoration:none;box-shadow:0 14px 34px rgba(0,0,0,.3);backdrop-filter:blur(12px);transition:transform .18s ease,border-color .18s ease,filter .18s ease;cursor:pointer;font:inherit;text-align:left}
        .lv-public-lead-action:hover{transform:translateY(-2px);border-color:rgba(239,74,80,.75);filter:brightness(1.08)}
        .lv-public-enquiry{border-color:rgba(239,74,80,.72)}.lv-public-whatsapp{border-color:rgba(76,175,80,.52)}
        .lv-public-lead-icon{width:32px;height:32px;display:grid;place-items:center;border-radius:9px;background:rgba(255,255,255,.08);font-size:16px;flex:0 0 auto}
        .lv-public-enquiry .lv-public-lead-icon{background:rgba(239,74,80,.15);color:#ef4a50}.lv-public-whatsapp .lv-public-lead-icon{background:rgba(76,175,80,.16)}.lv-public-call .lv-public-lead-icon{background:rgba(239,74,80,.14);color:#ef4a50}
        .lv-public-lead-copy{display:grid;gap:1px;line-height:1.15}.lv-public-lead-copy strong{font-size:11px;letter-spacing:.04em;text-transform:uppercase}.lv-public-lead-copy small{font-size:10px;color:#aeb9c2;white-space:nowrap}
        .lv-enquiry-overlay{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:22px;background:rgba(2,7,11,.78);backdrop-filter:blur(8px);overflow:auto}
        .lv-enquiry-modal{position:relative;width:min(100%,840px);max-height:min(92vh,980px);overflow:auto;padding:30px;border:1px solid #33414c;border-top:4px solid #d61f26;border-radius:16px;background:#0b151e;color:#fff;box-shadow:0 28px 80px rgba(0,0,0,.52)}
        .lv-enquiry-close{position:absolute;right:14px;top:12px;width:38px;height:38px;border:1px solid #35434e;border-radius:9px;background:#101c26;color:#fff;font-size:24px;cursor:pointer}.lv-enquiry-kicker{display:block;color:#ef4a50;font-size:10px;font-weight:900;letter-spacing:.17em}.lv-enquiry-modal h2{max-width:650px;margin:8px 45px 0 0;font:500 clamp(28px,4vw,42px)/1.05 Georgia,"Times New Roman",serif}.lv-enquiry-modal>p{max-width:680px;margin:12px 0 22px;color:#aeb9c2;font-size:12px;line-height:1.65}
        .lv-enquiry-form{display:grid;grid-template-columns:1fr 1fr;gap:12px}.lv-enquiry-form>label{display:grid;gap:6px;color:#cbd3d9;font-size:10px;font-weight:800}.lv-enquiry-form input,.lv-enquiry-form select,.lv-enquiry-form textarea{width:100%;border:1px solid #35434e;border-radius:8px;background:#101c26;color:#fff;padding:11px 12px;font:inherit;outline:none}.lv-enquiry-form input:focus,.lv-enquiry-form select:focus,.lv-enquiry-form textarea:focus{border-color:#d61f26;box-shadow:0 0 0 2px rgba(214,31,38,.13)}.lv-enquiry-form textarea{min-height:104px;resize:vertical}.lv-enquiry-message,.lv-enquiry-services,.lv-enquiry-submit-row,.lv-enquiry-error{grid-column:1/-1}
        .lv-enquiry-services{margin:0;padding:12px;border:1px solid #35434e;border-radius:9px}.lv-enquiry-services legend{padding:0 6px;color:#cbd3d9;font-size:10px;font-weight:800}.lv-enquiry-services>div{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px 10px}.lv-enquiry-services label{display:flex;align-items:center;gap:8px;min-height:34px;color:#d7dde2;font-size:11px}.lv-enquiry-services input{width:16px;height:16px;accent-color:#d61f26;padding:0}.lv-enquiry-honeypot{position:absolute!important;left:-9999px!important;width:1px!important;height:1px!important;opacity:0!important}
        .lv-enquiry-submit-row{display:flex;align-items:center;gap:14px;flex-wrap:wrap}.lv-enquiry-submit-row button{min-height:44px;border:1px solid #ef4a50;border-radius:8px;background:linear-gradient(180deg,#d61f26,#ad171d);color:#fff;padding:0 18px;font-weight:900;cursor:pointer}.lv-enquiry-submit-row button:disabled{opacity:.55}.lv-enquiry-submit-row small{color:#8997a2}.lv-enquiry-error{padding:10px 12px;border-left:3px solid #ef4a50;border-radius:7px;background:rgba(214,31,38,.12);color:#ffd2d4;font-size:11px}.lv-enquiry-success{display:grid;gap:8px;padding:22px;border:1px solid rgba(75,181,95,.45);border-radius:11px;background:rgba(75,181,95,.09)}.lv-enquiry-success strong{font-size:20px}.lv-enquiry-success span{color:#b7e6c0;font-weight:900}.lv-enquiry-success small{color:#a9b7c0;line-height:1.5}
        @media(max-width:620px){.lv-public-lead-actions{right:12px;bottom:72px;display:flex;gap:7px}.lv-public-lead-action{min-height:46px;padding:7px;border-radius:50%}.lv-public-lead-icon{width:32px;height:32px}.lv-public-lead-copy{display:none}.lv-enquiry-overlay{padding:10px;align-items:end}.lv-enquiry-modal{width:100%;max-height:94vh;padding:23px 16px 20px;border-radius:16px 16px 0 0}.lv-enquiry-form{grid-template-columns:1fr}.lv-enquiry-message,.lv-enquiry-services,.lv-enquiry-submit-row,.lv-enquiry-error{grid-column:auto}.lv-enquiry-services>div{grid-template-columns:1fr}.lv-enquiry-submit-row{align-items:stretch;flex-direction:column}.lv-enquiry-submit-row button{width:100%}}
      `}</style>
    </>
  );
}
