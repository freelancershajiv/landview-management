"use client";

import { useCallback, useEffect, useState } from "react";

type Service = {
  serviceKey: string; serviceName: string; workflowStatus: string;
  configured: boolean; required: string[]; verified: string[];
  missing: string[]; ready: boolean;
};
type Data = {
  available: boolean; writeEnabled: boolean; advisoryOnly: boolean;
  requirements: { key: string; label: string }[];
  services: Service[]; verifiedKeys: string[]; reason: string;
};
export default function ProjectServiceDocumentReadiness({ projectCode }: { projectCode: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("");
  const [keys, setKeys] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const url = "/api/admin/projects/service-document-requirements?projectId=" + encodeURIComponent(projectCode);
    const response = await fetch(url, { cache: "no-store", credentials: "same-origin" });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.success) throw new Error(String(result?.error || "Document readiness could not load."));
    return result.data as Data;
  }, [projectCode]);

  useEffect(() => {
    let active = true;
    void load().then((response) => { if (active) setData(response); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Readiness unavailable."); });
    return () => { active = false; };
  }, [load]);

  function edit(service: Service) {
    setSelected(service.serviceKey);
    setKeys(service.required);
  }
  async function save() {
    if (!data?.writeEnabled || !selected || saving) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/admin/projects/service-document-requirements", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setRequirements", projectId: projectCode,
          serviceKey: selected, requirements: keys }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) throw new Error(String(result?.error || "Could not save requirements."));
      setData(await load()); setSelected("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Service requirements could not be saved.");
    } finally { setSaving(false); }
  }
  return <section className="lv4-panel">
    <div className="lv4-section-head"><h3>Service document readiness</h3><span className="lv4-chip">Advisory only</span></div>
    <p className="lv4-muted">Configure the five project-wide document categories required by each billed service.
      Verified copies are shared across services, without duplicating scans. Missing or rejected documents affect only the linked service.</p>
    {error && <p className="lv4-doc-error" role="alert">{error}</p>}
    {!data && !error && <p className="lv4-quiet">Loading service requirements…</p>}
    {data && <>
      <p className="lv4-muted">{data.reason}</p>
      {!data.services.length && <p className="lv4-empty">No bill-triggered service workflows are linked to this project yet.</p>}
      <div className="lv4-doc-list">{data.services.map((service) => <div key={service.serviceKey} className="lv4-doc-list-row">
        <div style={{display:"grid",gap:5}}>
          <strong>{service.serviceName || service.serviceKey}</strong>
          <span className="lv4-quiet">{service.workflowStatus || "Pending"} · {service.configured
            ? service.required.length + " required, " + service.verified.length + " verified"
            : "Document requirements not configured"}</span>
          {!!service.missing.length && <span className="lv4-quiet">Missing: {service.missing.map((key) =>
            data.requirements.find((item)=>item.key===key)?.label || key).join(", ")}</span>}
          <span className="lv4-quiet">This preview does not override payment or delivery checks.</span>
          {data.writeEnabled && <div className="lv4-doc-actions">
            <button type="button" onClick={() => edit(service)}>Configure requirements</button>
          </div>}
        </div>
        <span className={"lv4-chip " + (service.ready ? "good" : service.configured ? "warn" : "")}>
          {service.ready ? "Documents ready" : service.configured ? "Missing requirements" : "Unconfigured"}
        </span>
      </div>)}</div>
      {selected && data.writeEnabled && <div style={{marginTop:14,display:"grid",gap:10}}>
        <strong>Required for {data.services.find((service)=>service.serviceKey===selected)?.serviceName || selected}</strong>
        <div className="lv4-doc-form">{data.requirements.map((item) => <label key={item.key} style={{display:"flex",alignItems:"center"}}>
          <input style={{width:16}} type="checkbox" checked={keys.includes(item.key)}
            onChange={(event)=>setKeys((before)=>event.target.checked ?
              [...before,item.key] : before.filter((key)=>key!==item.key))}/>
          {item.label}
        </label>)}</div>
        <div className="lv4-doc-actions">
          <button type="button" className="primary" disabled={saving} onClick={()=>void save()}>
            {saving ? "Saving…" : "Save linked requirements"}
          </button>
          <button type="button" onClick={()=>setSelected("")}>Cancel</button>
        </div>
      </div>}
    </>}
  </section>;
}
