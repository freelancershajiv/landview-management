"use client";

import { useCallback, useEffect, useState } from "react";

type ReferenceImage = {
  id: string; category: string; caption: string | null; original_name: string;
  mime_type: string; size_bytes: number; created_at: string; media_url: string;
};
const CATEGORIES = ["Exterior","Interior","Floor Plan","Elevation","Structural","Materials","Other"];

async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  if (file.size > 20 * 1024 * 1024) throw new Error("Choose an image smaller than 20 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image processing is unavailable in this browser.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Could not process image.")), "image/webp", 0.82));
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp" });
  } finally { bitmap.close(); }
}

export default function ProjectReferenceImages({ projectId }: { projectId: string }) {
  const [images, setImages] = useState<ReferenceImage[]>([]);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [caption, setCaption] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/admin/project-reference-images?projectId=${encodeURIComponent(projectId)}`, { credentials: "same-origin", cache: "no-store" });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Could not load reference images.");
      setImages(json.data || []);
    } catch (e: any) { setError(e?.message || "Could not load reference images."); }
    finally { setLoading(false); }
  }, [projectId]);
  useEffect(() => { void load(); }, [load]);

  async function upload() {
    if (!files.length || uploading) return;
    setUploading(true); setError("");
    try {
      for (const original of files) {
        const file = await compressImage(original);
        const form = new FormData();
        form.set("projectId", projectId); form.set("category", category); form.set("caption", caption);
        form.set("file", file, file.name);
        const response = await fetch("/api/admin/project-reference-images", { method: "POST", credentials: "same-origin", body: form });
        const json = await response.json();
        if (!response.ok || !json.success) throw new Error(json.error || "Image upload failed.");
      }
      setFiles([]); setCaption(""); await load();
    } catch (e: any) { setError(e?.message || "Image upload failed."); }
    finally { setUploading(false); }
  }

  async function remove(image: ReferenceImage) {
    if (!window.confirm("Delete this project reference image?")) return;
    setError("");
    try {
      const response = await fetch("/api/admin/project-reference-images", { method: "DELETE", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, id: image.id }) });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Could not delete image.");
      setImages(current => current.filter(item => item.id !== image.id));
    } catch (e: any) { setError(e?.message || "Could not delete image."); }
  }

  return <section className="pc-panel">
    <div className="pc-panel-head"><div><span>PROJECT REFERENCE LIBRARY</span><h2>Reference Images</h2></div><span className="pc-badge">{images.length} images</span></div>
    <p className="pc-note">Upload concept references, client inspiration, floor plans, elevations and material samples. Images are compressed to WebP and stored securely in Cloudflare R2, separately from Site Visit photos.</p>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:10,marginTop:14}}>
      <label style={{display:"grid",gap:6,fontSize:10,color:"var(--theme-ink-_aaa, #aaa)"}}>CATEGORY
        <select value={category} onChange={e=>setCategory(e.target.value)} style={{padding:10,borderRadius:7,background:"var(--theme-bg-_1d1d1d, #1d1d1d)",color:"var(--theme-ink-_eee, #eee)",border:"1px solid var(--theme-line-_555, #555)"}}>{CATEGORIES.map(item=><option key={item}>{item}</option>)}</select>
      </label>
      <label style={{display:"grid",gap:6,fontSize:10,color:"var(--theme-ink-_aaa, #aaa)"}}>CAPTION (OPTIONAL)
        <input value={caption} onChange={e=>setCaption(e.target.value)} maxLength={240} placeholder="e.g. Modern facade inspiration" style={{padding:10,borderRadius:7,background:"var(--theme-bg-_1d1d1d, #1d1d1d)",color:"var(--theme-ink-_eee, #eee)",border:"1px solid var(--theme-line-_555, #555)"}}/>
      </label>
      <label style={{display:"grid",gap:6,fontSize:10,color:"var(--theme-ink-_aaa, #aaa)"}}>SELECT IMAGES
        <input type="file" accept="image/jpeg,image/png,image/webp,image/*" multiple onChange={e=>setFiles(Array.from(e.target.files || []))}/>
      </label>
    </div>
    <div style={{display:"flex",alignItems:"center",gap:10,marginTop:12,flexWrap:"wrap"}}>
      <button className="btn btn-dark" disabled={!files.length || uploading} onClick={upload}>{uploading ? "Compressing & uploading..." : `Upload ${files.length || ""} image${files.length===1?"":"s"}`}</button>
      <span className="pc-note">Up to 20 MB each before automatic compression.</span>
    </div>
    {error && <p role="alert" style={{color:"#ff8177",fontSize:11,marginTop:12}}>{error}</p>}
    {loading ? <div className="pc-empty">Loading reference images...</div> : images.length ? <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))",gap:12,marginTop:18}}>
      {images.map(image=><article key={image.id} style={{overflow:"hidden",border:"1px solid var(--theme-line-rgba_255_255_255__09_, rgba(255,255,255,.09))",borderRadius:10,background:"var(--theme-bg-_1d1d1d, #1d1d1d)"}}>
        <a href={image.media_url} target="_blank" rel="noreferrer"><img src={image.media_url} alt={image.caption || image.category} loading="lazy" style={{width:"100%",height:160,objectFit:"cover",display:"block"}}/></a>
        <div style={{padding:10}}><strong style={{fontSize:11,color:"var(--theme-ink-_eee, #eee)"}}>{image.category}</strong><p style={{fontSize:10,color:"var(--theme-ink-_aaa, #aaa)",margin:"5px 0",minHeight:15}}>{image.caption || image.original_name}</p><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}><small className="pc-note">{(image.size_bytes/1024).toFixed(0)} KB</small><button className="btn btn-small pc-danger" onClick={()=>void remove(image)}>Delete</button></div></div>
      </article>)}
    </div> : <div className="pc-empty">No reference images yet. Select one or more images above to create this project's reference library.</div>}
  </section>;
}
