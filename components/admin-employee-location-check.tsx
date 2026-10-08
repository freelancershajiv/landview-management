"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type EmployeeRow = Record<string, any>;
type Check = {
  id?: string;
  employeeCode?: string;
  requestedAt?: string;
  expiresAt?: string;
  status?: string;
  accuracyM?: number | null;
  matchedProjectCode?: string;
  matchedProjectName?: string;
  distanceM?: number | null;
  respondedAt?: string;
  responseNote?: string;
};

type Props = { employees: EmployeeRow[] };

function text(value: unknown) { return String(value ?? "").trim(); }
function employeeCode(row: EmployeeRow) { return text(row.Employee_ID || row["Employee ID"] || row.EmployeeId); }
function employeeName(row: EmployeeRow) { return text(row.Employee_Name || row["Employee Name"] || row.Name || employeeCode(row)); }
function employeeStatus(row: EmployeeRow) { return text(row.Status || row.status || "Active").toLowerCase(); }
function fmtTime(value: unknown) {
  const raw = text(value);
  if (!raw) return "—";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString("en-GB", { timeZone: "Asia/Dhaka", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || "Location check failed."));
  return json.data;
}
function statusLabel(check?: Check) {
  switch (check?.status) {
    case "PENDING": return "Waiting for employee";
    case "VERIFIED_SITE": return "Verified on site";
    case "NEAR_SITE": return "Near registered site";
    case "NOT_NEAR_SITE": return "Not near registered site";
    case "DENIED": return "Location denied";
    case "ERROR": return "Location unreliable";
    case "EXPIRED": return "Request expired";
    default: return "Not checked";
  }
}
function statusClass(status?: string) {
  if (status === "VERIFIED_SITE") return "verified";
  if (status === "NEAR_SITE") return "near";
  if (status === "PENDING") return "pending";
  if (["NOT_NEAR_SITE", "DENIED", "ERROR"].includes(status || "")) return "bad";
  return "muted";
}

export default function AdminEmployeeLocationCheck({ employees }: Props) {
  const active = useMemo(() => employees.filter((row) => employeeCode(row) && employeeStatus(row) === "active"), [employees]);
  const [checks, setChecks] = useState<Record<string, Check>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await requestJson("/api/admin/employee-location-check");
      const map: Record<string, Check> = {};
      for (const row of Array.isArray(data) ? data : []) {
        const code = text(row?.employeeCode).toUpperCase();
        if (code) map[code] = row;
      }
      setChecks(map);
    } catch (err: any) {
      setError(err?.message || "Could not load employee location checks.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!Object.values(checks).some((check) => check.status === "PENDING")) return;
    const timer = window.setInterval(() => void load(), 4000);
    return () => window.clearInterval(timer);
  }, [checks, load]);

  async function requestLocation(code: string, name: string) {
    if (!code || busy) return;
    if (!window.confirm(`Request a fresh work-location check from ${name} (${code})?\n\nThe employee will be asked to share one GPS reading. You will only see whether it matches a registered LAND VIEW site.`)) return;
    setBusy(code);
    setError("");
    try {
      const result = await requestJson("/api/admin/employee-location-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeCode: code }),
      });
      setChecks((current) => ({ ...current, [code.toUpperCase()]: result }));
      setOpen(true);
    } catch (err: any) {
      setError(err?.message || "Could not request employee location.");
    } finally {
      setBusy("");
    }
  }

  return <section className="aelc">
    <style>{`
      .aelc{margin:0 0 18px;border:1px solid var(--lv-border,#303943);border-radius:12px;background:var(--lv-surface,#fff);overflow:hidden}.aelc-head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 16px}.aelc-head h2{margin:0;font-size:16px}.aelc-head p{margin:4px 0 0;color:var(--lv-muted,#75808a);font-size:10px;line-height:1.45}.aelc-toggle{border:1px solid var(--lv-border-strong,#38434e);border-radius:8px;background:var(--lv-white,#fff);color:var(--lv-text,#17202a);padding:8px 11px;font-size:10px;font-weight:900;cursor:pointer;white-space:nowrap}.aelc-error{margin:0 16px 12px;padding:9px 10px;border:1px solid rgba(191,75,75,.3);border-radius:8px;background:rgba(191,75,75,.08);color:var(--lv-danger,#b84b4b);font-size:10px}.aelc-list{border-top:1px solid var(--lv-border,#303943)}.aelc-row{display:grid;grid-template-columns:minmax(170px,1.2fr) minmax(180px,1.4fr) minmax(180px,1.5fr) auto;gap:12px;align-items:center;padding:12px 16px;border-bottom:1px solid var(--lv-border,#303943)}.aelc-row:last-child{border-bottom:0}.aelc-person strong{display:block;font-size:11px}.aelc-person span,.aelc-detail small{display:block;margin-top:3px;color:var(--lv-muted,#75808a);font-size:9px}.aelc-state{display:inline-flex;width:max-content;padding:5px 8px;border-radius:999px;border:1px solid;font-size:9px;font-weight:900}.aelc-state.verified{color:#3f8d55;border-color:rgba(63,141,85,.35);background:rgba(63,141,85,.08)}.aelc-state.near{color:#987020;border-color:rgba(152,112,32,.35);background:rgba(152,112,32,.08)}.aelc-state.pending{color:#4c78a8;border-color:rgba(76,120,168,.35);background:rgba(76,120,168,.08)}.aelc-state.bad{color:#b84b4b;border-color:rgba(184,75,75,.35);background:rgba(184,75,75,.08)}.aelc-state.muted{color:var(--lv-muted,#75808a);border-color:var(--lv-border,#d7dce1);background:var(--lv-paper,#f5f6f7)}.aelc-detail{font-size:10px;line-height:1.45}.aelc-detail strong{font-size:10px}.aelc-btn{border:0;border-radius:8px;background:#d94b45;color:#fff;padding:9px 11px;font-size:9px;font-weight:900;cursor:pointer;white-space:nowrap}.aelc-btn:disabled{opacity:.5;cursor:wait}.aelc-empty{padding:18px;color:var(--lv-muted,#75808a);font-size:10px;text-align:center}@media(max-width:900px){.aelc-row{grid-template-columns:1fr 1fr}.aelc-row .aelc-btn{width:100%}}@media(max-width:620px){.aelc-head{align-items:flex-start;flex-direction:column}.aelc-toggle{width:100%}.aelc-row{grid-template-columns:1fr}.aelc-row .aelc-btn{width:100%}}
    `}</style>
    <div className="aelc-head">
      <div><h2>Employee Site Location Check</h2><p>Request a fresh GPS verification. The result only reveals a registered project match, distance and GPS accuracy—never an unrelated exact location.</p></div>
      <button type="button" className="aelc-toggle" onClick={() => setOpen((value) => !value)}>{open ? "Hide location checks" : "Check employee location"}</button>
    </div>
    {error && <div className="aelc-error">{error}</div>}
    {open && <div className="aelc-list">
      {!active.length ? <div className="aelc-empty">No active employees found.</div> : active.map((row) => {
        const code = employeeCode(row).toUpperCase();
        const name = employeeName(row);
        const check = checks[code];
        const matched = check?.matchedProjectCode ? `${check.matchedProjectCode}${check.matchedProjectName ? ` · ${check.matchedProjectName}` : ""}` : "";
        return <div className="aelc-row" key={code}>
          <div className="aelc-person"><strong>{name}</strong><span>{code}</span></div>
          <div><span className={`aelc-state ${statusClass(check?.status)}`}>{statusLabel(check)}</span><small style={{display:"block",marginTop:4,color:"var(--lv-muted,#75808a)",fontSize:9}}>{check?.respondedAt ? `Checked ${fmtTime(check.respondedAt)}` : check?.requestedAt ? `Requested ${fmtTime(check.requestedAt)}` : "No recent check"}</small></div>
          <div className="aelc-detail">{matched ? <><strong>{matched}</strong><small>{check?.distanceM != null ? `${Math.round(Number(check.distanceM))} m from registered point` : ""}{check?.accuracyM != null ? ` · GPS ±${Math.round(Number(check.accuracyM))} m` : ""}</small></> : <><strong>{check?.responseNote || "No site match yet"}</strong>{check?.accuracyM != null && <small>GPS ±{Math.round(Number(check.accuracyM))} m</small>}</>}</div>
          <button type="button" className="aelc-btn" disabled={busy === code || check?.status === "PENDING"} onClick={() => void requestLocation(code, name)}>{busy === code ? "REQUESTING…" : check?.status === "PENDING" ? "WAITING…" : "CHECK LOCATION"}</button>
        </div>;
      })}
    </div>}
  </section>;
}
