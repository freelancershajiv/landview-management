"use client";

import { FormEvent, useMemo, useState } from "react";
import { publicServices } from "@/lib/public-services";
import styles from "@/app/contact/page.module.css";

const WHATSAPP_NUMBER = "8801902500400";
const extraServices = ["Fire Safety Design", "Other / Not sure yet"];
const serviceOptions = [...publicServices.map((service) => service.name), ...extraServices];

type FormState = {
  name: string;
  phone: string;
  email: string;
  projectLocation: string;
  projectType: string;
  proposedFloors: string;
  landArea: string;
  services: string[];
  message: string;
  website: string;
};

const initialState: FormState = {
  name: "",
  phone: "",
  email: "",
  projectLocation: "",
  projectType: "",
  proposedFloors: "",
  landArea: "",
  services: [],
  message: "",
  website: "",
};

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function whatsappMessage(form: FormState, leadCode = "") {
  const lines = [
    "Hello LAND VIEW, I would like to discuss a building project.",
    clean(form.name) ? `Name: ${clean(form.name)}` : "",
    clean(form.phone) ? `Mobile: ${clean(form.phone)}` : "",
    clean(form.email) ? `Email: ${clean(form.email)}` : "",
    clean(form.projectLocation) ? `Project location: ${clean(form.projectLocation)}` : "",
    clean(form.projectType) ? `Project type: ${clean(form.projectType)}` : "",
    clean(form.proposedFloors) ? `Proposed floors: ${clean(form.proposedFloors)}` : "",
    clean(form.landArea) ? `Land area: ${clean(form.landArea)}` : "",
    form.services.length ? `Services needed: ${form.services.join(", ")}` : "",
    clean(form.message) ? `Project note: ${clean(form.message)}` : "",
    leadCode ? `LAND VIEW enquiry reference: ${leadCode}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

export default function PublicContactEnquiry() {
  const [form, setForm] = useState<FormState>(initialState);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [leadCode, setLeadCode] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const whatsappUrl = useMemo(
    () => `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(whatsappMessage(form, leadCode))}`,
    [form, leadCode],
  );

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setError("");
  }

  function toggleService(service: string) {
    setForm((current) => ({
      ...current,
      services: current.services.includes(service)
        ? current.services.filter((item) => item !== service)
        : [...current.services, service],
    }));
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError("");
    setSubmitting(true);

    try {
      const params = new URLSearchParams(window.location.search);
      const message = [clean(form.landArea) ? `Land area: ${clean(form.landArea)}` : "", clean(form.message)].filter(Boolean).join("\n");
      const response = await fetch("/api/public/enquiry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          message,
          sourcePath: `${window.location.pathname}${window.location.search}`,
          sourceReferrer: document.referrer,
          utmSource: params.get("utm_source") || "",
          utmMedium: params.get("utm_medium") || "",
          utmCampaign: params.get("utm_campaign") || "",
        }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not submit your project enquiry."));
      setLeadCode(String(json?.data?.leadCode || ""));
      setSubmitted(true);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Could not submit your project enquiry.");
    } finally {
      setSubmitting(false);
    }
  }

  return <section className={styles.enquiryPanel} id="project-enquiry" aria-labelledby="project-enquiry-title">
    <div className={styles.enquiryIntro}>
      <span className={styles.eyebrow}>PROJECT ENQUIRY</span>
      <h2 id="project-enquiry-title">Tell us what you are planning.</h2>
      <p>Share the essentials first. LAND VIEW can then understand the project, identify the relevant disciplines and respond with the right next step.</p>
      <div className={styles.enquirySteps}>
        <span><b>01</b> Project information</span>
        <span><b>02</b> Required services</span>
        <span><b>03</b> LAND VIEW follow-up</span>
      </div>
    </div>

    <form className={styles.enquiryForm} onSubmit={submit}>
      <div className={styles.formGrid}>
        <label className={styles.field}><span>Your name *</span><input required minLength={2} value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="Name" autoComplete="name" /></label>
        <label className={styles.field}><span>Mobile number *</span><input required value={form.phone} onChange={(event) => update("phone", event.target.value)} placeholder="01XXXXXXXXX" inputMode="tel" autoComplete="tel" /></label>
        <label className={styles.field}><span>Email</span><input type="email" value={form.email} onChange={(event) => update("email", event.target.value)} placeholder="Optional" autoComplete="email" /></label>
        <label className={styles.field}><span>Project location *</span><input required value={form.projectLocation} onChange={(event) => update("projectLocation", event.target.value)} placeholder="Area, upazila / district" /></label>
        <label className={styles.field}><span>Project type</span><select value={form.projectType} onChange={(event) => update("projectType", event.target.value)}><option value="">Select project type</option><option>Residential Building</option><option>Commercial Building</option><option>Mixed-use Building</option><option>Industrial / Factory</option><option>Interior Project</option><option>Renovation / Redesign</option><option>Other</option></select></label>
        <label className={styles.field}><span>Proposed floors</span><input value={form.proposedFloors} onChange={(event) => update("proposedFloors", event.target.value)} placeholder="Example: G+5 / 6 storey" /></label>
        <label className={`${styles.field} ${styles.fieldWide}`}><span>Land area</span><input value={form.landArea} onChange={(event) => update("landArea", event.target.value)} placeholder="Example: 8 Decimal / 5 Katha / 4,500 sq ft" /></label>
      </div>

      <fieldset className={styles.servicePicker}>
        <legend>Which services do you need?</legend>
        <div className={styles.serviceChoices}>{serviceOptions.map((service) => <label key={service} className={`${styles.serviceChoice} ${form.services.includes(service) ? styles.serviceChoiceActive : ""}`}><input type="checkbox" checked={form.services.includes(service)} onChange={() => toggleService(service)} /><span>{service}</span></label>)}</div>
      </fieldset>

      <label className={styles.field}><span>Anything else we should know?</span><textarea value={form.message} onChange={(event) => update("message", event.target.value)} rows={5} placeholder="Site condition, preferred timeline, existing drawings, approval status or any specific requirement." /></label>
      <label className={styles.honeypot} aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={form.website} onChange={(event) => update("website", event.target.value)} /></label>

      {error && <div className={styles.formError} role="alert">{error}</div>}
      {submitted && <div className={styles.formSuccess} role="status"><strong>Enquiry received.</strong><span>{leadCode ? `Reference: ${leadCode}. ` : ""}You can continue the same project brief on WhatsApp now.</span></div>}

      <div className={styles.formActions}>
        <button className={styles.primaryButton} type="submit" disabled={submitting}>{submitting ? "Submitting…" : submitted ? "Enquiry submitted" : "Submit project enquiry"}</button>
        <a className={styles.whatsappButton} href={whatsappUrl} target="_blank" rel="noopener noreferrer">Continue on WhatsApp</a>
      </div>
      <p className={styles.formNote}>WhatsApp opens <strong>01902 500 400</strong>. Your form details are automatically prepared in the message; only the information you choose to send is shared.</p>
    </form>
  </section>;
}
