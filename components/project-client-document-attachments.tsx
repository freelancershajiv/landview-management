"use client";

import { useCallback, useEffect, useState } from "react";

type FileEntry = {
  id: string; name: string; type: string; bytes: number;
  status: string; createdAt: string; storedAt: string;
};
type Inventory = {
  available: boolean; uploadEnabled: boolean; files: FileEntry[]; reason?: string;
};
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
};
export default function ProjectClientDocumentAttachments({
  projectCode, registerId, canWrite, onChanged,
}: { projectCode: string; registerId: string; canWrite: boolean; onChanged?: () => void }) {
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<File | null>(null);

  const endpoint = "/api/admin/projects/client-document-files";
  const query = "?projectId=" + encodeURIComponent(projectCode) +
    "&registerId=" + encodeURIComponent(registerId);

  const refresh = useCallback(async () => {
    const response = await fetch(endpoint + query, { cache: "no-store", credentials: "same-origin" });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.success) throw new Error(String(result?.error || "Private files are unavailable."));
    setInventory(result.data as Inventory);
  }, [query]);

  useEffect(() => {
    let active = true;
    // Avoid updating state when a different project/receipt is mounted.
    void fetch(endpoint + query, { cache: "no-store", credentials: "same-origin" })
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.success) throw new Error(String(j?.error || "Could not load files."));
        if (active) setInventory(j.data as Inventory);
      }).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "File lookup failed."); });
    return () => { active = false; };
  }, [query]);

  async function post(payload: Record<string, unknown>) {
    const response = await fetch(endpoint, {
      method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: projectCode, registerId, ...payload }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.success) throw new Error(String(result?.error || "Document operation failed."));
    return result.data;
  }
  async function upload() {
    if (!selected || !canWrite || !inventory?.uploadEnabled || busy) return;
    setError(""); setMessage(""); setBusy(true);
    try {
      const ext = "." + (selected.name.split(".").pop() || "").toLowerCase();
      if (!ACCEPTED[selected.type]?.includes(ext) || selected.size < 1 || selected.size > MAX_BYTES)
        throw new Error("Choose a PDF, JPG, PNG or WebP file (maximum 10 MB).");
      const signed = await post({ action: "prepare", fileName: selected.name,
        contentType: selected.type, fileSize: selected.size }) as { fileId: string; uploadUrl: string };
      // Signed URL is restricted to a generated path; no public bucket or client-side service key.
      const sent = await fetch(signed.uploadUrl, {
        method: "PUT", body: selected, headers: { "Content-Type": selected.type },
      });
      if (!sent.ok) throw new Error("Storage rejected the upload. No document was verified or published.");
      await post({ action: "complete", fileId: signed.fileId });
      await refresh(); setSelected(null); setMessage("Private scan stored. Verify the receiving record separately.");
      onChanged?.();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Upload failed."); }
    finally { setBusy(false); }
  }
  async function open(fileId: string) {
    setError("");
    try {
      // Open a same-origin placeholder synchronously to avoid popup blocking.
      const tab = window.open("about:blank", "_blank");
      const response = await fetch(endpoint + query + "&downloadFileId=" + encodeURIComponent(fileId), {
        cache: "no-store", credentials: "same-origin",
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success || !result.data?.url) {
        tab?.close(); throw new Error(String(result?.error || "Could not open private scan."));
      }
      if (tab) { tab.opener = null; tab.location.replace(result.data.url); }
      else window.location.assign(result.data.url);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Private file link failed."); }
  }

  return <div style={{display:"grid",gap:8,marginTop:10,maxWidth:680}}>
    <strong style={{fontSize:12}}>Private scans and PDFs</strong>
    {error && <div className="lv4-doc-error" role="alert">{error}</div>}
    {message && <div className="lv4-doc-message" role="status">{message}</div>}
    {!inventory && !error && <span className="lv4-quiet">Loading private file inventory…</span>}
    {inventory && !inventory.available && <p className="lv4-muted">{inventory.reason || "Upload storage is not deployed."}</p>}
    {inventory?.available && <>
      {!inventory.files.length && <span className="lv4-quiet">No digital scans stored with this receiving record.</span>}
      {inventory.files.map((file) => <div key={file.id} className="lv4-doc-actions" style={{alignItems:"center"}}>
        <span className="lv4-quiet" style={{overflowWrap:"anywhere"}}>{file.name} · {(file.bytes/1024/1024).toFixed(2)} MB · Private</span>
        <button type="button" onClick={() => void open(file.id)}>Open securely</button>
      </div>)}
      {canWrite && inventory.uploadEnabled && <div className="lv4-doc-actions" style={{alignItems:"center"}}>
        <input aria-label="Choose client scan" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp"
          onChange={(event)=>setSelected(event.currentTarget.files?.[0] || null)}/>
        <button type="button" className="primary" disabled={!selected || busy} onClick={()=>void upload()}>
          {busy ? "Uploading…" : "Upload private scan"}
        </button>
      </div>}
      {(!canWrite || !inventory.uploadEnabled) && <span className="lv4-quiet">Uploads are locked in preview until backup, schema and controlled release checks pass.</span>}
    </>}
  </div>;
}
