"use client";

import { useEffect, useMemo, useState } from "react";

type Template = { key:string; type:string; label:string; subject:string; position:string; statement:string; needsPeriod:boolean; active:boolean; updatedAt?:string; updatedBy?:string };

export default function CertificateTemplatesPage(){
  const [templates,setTemplates]=useState<Template[]>([]); const [selected,setSelected]=useState(""); const [draft,setDraft]=useState<Template|null>(null); const [loading,setLoading]=useState(true); const [saving,setSaving]=useState(false); const [error,setError]=useState(""); const [notice,setNotice]=useState("");
  async function load(){setLoading(true);setError("");try{const r=await fetch("/api/certificates/templates",{cache:"no-store",credentials:"same-origin"});const j=await r.json();if(!r.ok||!j?.success)throw new Error(j?.error||"Could not load templates.");const list=Array.isArray(j?.data?.templates)?j.data.templates:[];setTemplates(list);if(!selected&&list[0]){setSelected(list[0].key);setDraft({...list[0]});}}catch(e:any){setError(e?.message||"Could not load templates.");}finally{setLoading(false);}}
  useEffect(()=>{void load();},[]);
  const grouped=useMemo(()=>({project:templates.filter(x=>x.type==="project"),employee:templates.filter(x=>x.type==="employee"),intern:templates.filter(x=>x.type==="intern")}),[templates]);
  function choose(key:string){const t=templates.find(x=>x.key===key);setSelected(key);setDraft(t?{...t}:null);setNotice("");setError("");}
  async function save(){if(!draft||saving)return;setSaving(true);setError("");setNotice("");try{const r=await fetch("/api/certificates/templates",{method:"PATCH",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify(draft)});const j=await r.json();if(!r.ok||!j?.success)throw new Error(j?.error||"Could not save template.");setTemplates(prev=>prev.map(x=>x.key===j.data.key?j.data:x));setDraft({...j.data});setNotice("Template saved. New certificates will use this wording by default.");}catch(e:any){setError(e?.message||"Could not save template.");}finally{setSaving(false);}}
  return <main style={shell}>
    <header style={{marginBottom:16}}><h1 style={{margin:0,fontSize:27}}>Certificate Templates</h1><p style={muted}>Edit the default wording, title and designation used when a certificate type is selected. Issued certificates are not changed.</p></header>
    {error&&<div style={errorBox}>{error}</div>}{notice&&<div style={successBox}>{notice}</div>}
    <div style={layout}>
      <aside style={card}><h2 style={h2}>Templates</h2>{loading?<p style={muted}>Loading…</p>:(["project","employee","intern"] as const).map(group=><section key={group} style={{marginBottom:15}}><strong style={groupTitle}>{group==="project"?"Project / Client":group==="employee"?"Employee":"Intern Student"}</strong>{grouped[group].map(t=><button key={t.key} onClick={()=>choose(t.key)} style={{...templateButton,...(selected===t.key?activeButton:{})}}>{t.label}<small style={{display:"block",opacity:.65,marginTop:2}}>{t.subject}</small></button>)}</section>)}</aside>
      <section style={card}>{!draft?<p style={muted}>Select a template.</p>:<>
        <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center"}}><div><h2 style={h2}>{draft.label}</h2><span style={pill}>{draft.type.toUpperCase()}</span></div><label style={{fontSize:12,fontWeight:800}}><input type="checkbox" checked={draft.active} onChange={e=>setDraft({...draft,active:e.target.checked})}/> Active</label></div>
        <div style={grid}>
          <Field label="Template Label"><input style={input} value={draft.label} onChange={e=>setDraft({...draft,label:e.target.value})}/></Field>
          <Field label="Default Designation / Role"><input style={input} value={draft.position} onChange={e=>setDraft({...draft,position:e.target.value})}/></Field>
          <Field label="Certificate Subject" full><input style={input} value={draft.subject} onChange={e=>setDraft({...draft,subject:e.target.value})}/></Field>
          <Field label="Default Statement" full><textarea style={{...input,minHeight:330,resize:"vertical"}} value={draft.statement} onChange={e=>setDraft({...draft,statement:e.target.value})}/><span style={muted}>This text remains editable on the Issue Certificate screen before issuance.</span></Field>
        </div>
        <div style={{display:"flex",gap:8,marginTop:14,flexWrap:"wrap"}}><button style={primary} onClick={save} disabled={saving}>{saving?"Saving…":"Save Template"}</button><button style={button} onClick={()=>choose(draft.key)}>Discard Changes</button></div>
        {draft.updatedAt&&<p style={{...muted,marginTop:13}}>Last updated: {new Date(draft.updatedAt).toLocaleString("en-GB",{timeZone:"Asia/Dhaka"})}{draft.updatedBy?` · ${draft.updatedBy}`:""}</p>}
      </>}</section>
    </div>
  </main>;
}

function Field({label,children,full=false}:{label:string;children:React.ReactNode;full?:boolean}){return <label style={{display:"flex",flexDirection:"column",gap:6,gridColumn:full?"1 / -1":undefined,fontSize:12,fontWeight:800,color:"#344054"}}>{label}{children}</label>}
const shell={maxWidth:1300,margin:"0 auto",padding:"22px"} as const; const layout={display:"grid",gridTemplateColumns:"330px minmax(0,1fr)",gap:18,alignItems:"start"} as const; const card={background:"#fff",border:"1px solid #e4e7ec",borderRadius:14,padding:18,boxShadow:"0 3px 12px #1018280c"} as const; const h2={margin:"0 0 12px",fontSize:17} as const; const muted={fontSize:12,color:"#667085",fontWeight:500} as const; const groupTitle={display:"block",fontSize:11,textTransform:"uppercase" as const,letterSpacing:.5,color:"#667085",marginBottom:6}; const templateButton={display:"block",width:"100%",textAlign:"left" as const,border:"1px solid #e4e7ec",background:"#fff",borderRadius:9,padding:"9px 10px",marginBottom:6,cursor:"pointer",fontWeight:800,color:"#171717"}; const activeButton={background:"#171717",color:"#fff",borderColor:"#171717"}; const grid={display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginTop:16} as const; const input={width:"100%",boxSizing:"border-box" as const,border:"1px solid #d0d5dd",borderRadius:9,padding:"10px 11px",font:"inherit",background:"#fff",color:"#101828"}; const button={border:"1px solid #d0d5dd",background:"#fff",borderRadius:9,padding:"9px 13px",fontWeight:800,cursor:"pointer"}; const primary={...button,background:"#d71920",borderColor:"#d71920",color:"#fff"}; const pill={display:"inline-flex",background:"#f2f4f7",borderRadius:999,padding:"4px 8px",fontSize:10,fontWeight:900,color:"#475467"}; const errorBox={background:"#fef3f2",color:"#b42318",padding:"10px 12px",borderRadius:9,marginBottom:12,fontSize:13}; const successBox={background:"#ecfdf3",color:"#027a48",padding:"10px 12px",borderRadius:9,marginBottom:12,fontSize:13};
