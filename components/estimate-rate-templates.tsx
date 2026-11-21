"use client";

import { useEffect, useState } from "react";

type Rates = { ratePerSft: number; contingencyPct: number; allowances: { id: string; item: string; amount: number }[] };
type Template = { id: string; name: string; savedAt: string; rates: Rates };
const storageKey = "landview.summary-estimate.rate-templates.v1";

function validTemplate(value: unknown): value is Template {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<Template>;
  const rates = entry.rates;
  return typeof entry.id === "string" && typeof entry.name === "string" && typeof entry.savedAt === "string"
    && !!rates && Number.isFinite(rates.ratePerSft) && rates.ratePerSft >= 0
    && Number.isFinite(rates.contingencyPct) && rates.contingencyPct >= 0
    && Array.isArray(rates.allowances) && rates.allowances.every((item) => item
      && typeof item.id === "string" && typeof item.item === "string"
      && Number.isFinite(item.amount) && item.amount >= 0);
}

export default function EstimateRateTemplates({ rates, apply }: { rates: Rates; apply: (rates: Rates) => void }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState("");
  const [message, setMessage] = useState("");
  const [available, setAvailable] = useState(false);
  const chosen = templates.find((entry) => entry.id === selected);

  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
      if (Array.isArray(saved)) setTemplates(saved.filter(validTemplate));
      setAvailable(true);
    } catch {
      setMessage("Saved templates could not be read in this browser.");
    }
  }, []);

  function save() {
    if (!available || !name.trim()) return;
    const entry = { id: crypto.randomUUID(), name: name.trim(), savedAt: new Date().toISOString(), rates };
    if (!validTemplate(entry)) {
      setMessage("Enter valid nonnegative rates before saving a version.");
      return;
    }
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
      const next = [entry, ...(Array.isArray(saved) ? saved.filter(validTemplate) : [])];
      localStorage.setItem(storageKey, JSON.stringify(next));
      setTemplates(next);
      setSelected(entry.id);
      setMessage("New template version saved in this browser.");
    } catch {
      setMessage("This browser could not save another template version.");
    }
  }

  return (
    <fieldset>
      <legend>Saved rate templates</legend>
      <p>Versions are stored in this browser. Applying one replaces the rate, contingency and allowances in the current draft.</p>
      <label>Template name <input maxLength={80} value={name} onChange={(event) => setName(event.target.value)} /></label>{" "}
      <button type="button" disabled={!available || !name.trim()} onClick={save}>Save new version</button>{" "}
      <label>Version <select value={selected} onChange={(event) => setSelected(event.target.value)}>
        <option value="">Select version</option>
        {templates.map((entry) => <option key={entry.id} value={entry.id}>
          {entry.name} · {new Date(entry.savedAt).toLocaleString("en-BD", { timeZone: "Asia/Dhaka" })}
        </option>)}
      </select></label>{" "}
      <button type="button" disabled={!chosen} onClick={() => {
        if (!chosen) return;
        apply(chosen.rates);
        setMessage("Template applied to draft.");
      }}>Apply version</button>
      {message && <p role="status">{message}</p>}
    </fieldset>
  );
}
