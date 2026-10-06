"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ErrorState, LoadingState, PageHeader } from "@/components/lv-ui";

type ProjectLocation = {
  projectId: string;
  projectName: string;
  clientName: string;
  legacyLocation: string;
  division: string;
  district: string;
  upazilaThana: string;
  localBodyType: string;
  localBodyName: string;
  wardNo: string;
  villageArea: string;
  roadHolding: string;
};
type Option = { name: string; bnName?: string; category?: string };
type LocationForm = Omit<ProjectLocation, "projectId" | "projectName" | "clientName" | "legacyLocation">;

const EMPTY: LocationForm = { division:"", district:"", upazilaThana:"", localBodyType:"", localBodyName:"", wardNo:"", villageArea:"", roadHolding:"" };
const LOCAL_TYPES = ["Union Parishad", "Paurashava / Municipality", "City Corporation", "Other"];

const css = `
.project-locations-page{display:grid;gap:18px;max-width:1180px}.pl-card{border:1px solid var(--theme-line-rgba_255_255_255__1_,rgba(255,255,255,.1));border-radius:12px;background:var(--theme-bg-_111a22,#111a22);overflow:hidden}.pl-head{padding:16px 18px;border-bottom:1px solid var(--theme-line-rgba_255_255_255__08_,rgba(255,255,255,.08));background:var(--theme-bg-_16212a,#16212a)}.pl-head strong{display:block;color:var(--theme-ink-_fff,#fff);font-size:13px}.pl-head span{display:block;margin-top:5px;color:var(--theme-ink-_7f8b94,#7f8b94);font-size:10px;line-height:1.5}.pl-picker{display:grid;grid-template-columns:minmax(220px,.7fr) minmax(320px,1.3fr);gap:10px;padding:16px}.pl-input,.pl-select{height:42px;border:1px solid var(--theme-line-rgba_255_255_255__12_,rgba(255,255,255,.12));border-radius:8px;background:var(--theme-bg-_0d151c,#0d151c);color:var(--theme-ink-_eef2f4,#eef2f4);padding:0 11px;font-size:11px;outline:none}.pl-input:focus,.pl-select:focus{border-color:#d61f26;box-shadow:0 0 0 3px rgba(214,31,38,.1)}.pl-meta{padding:0 16px 16px;color:var(--theme-ink-_87939c,#87939c);font-size:10px}.pl-meta b{color:var(--theme-ink-_dce2e6,#dce2e6)}.pl-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:16px}.pl-field{display:grid;gap:6px}.pl-field.full{grid-column:1/-1}.pl-field>span{color:var(--theme-ink-_8a969f,#8a969f);font-size:9px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.pl-field small{color:var(--theme-ink-_687680,#687680);font-size:9px;line-height:1.4}.pl-preview{grid-column:1/-1;padding:14px;border:1px dashed var(--theme-line-rgba_214_31_38__38_,rgba(214,31,38,.38));border-radius:9px;background:var(--theme-bg-rgba_214_31_38__05_,rgba(214,31,38,.05))}.pl-preview span{display:block;color:#ef6c66;font-size:8px;font-weight:900;letter-spacing:.12em}.pl-preview strong{display:block;margin-top:7px;color:var(--theme-ink-_fff,#fff);font-size:12px;line-height:1.55}.pl-actions{grid-column:1/-1;display:flex;align-items:center;justify-content:flex-end;gap:9px}.pl-btn{height:40px;padding:0 14px;border:1px solid var(--theme-line-rgba_255_255_255__14_,rgba(255,255,255,.14));border-radius:8px;background:var(--theme-bg-_18232d,#18232d);color:var(--theme-ink-_fff,#fff);font-size:10px;font-weight:900;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}.pl-btn.primary{background:#d61f26;border-color:#d61f26}.pl-btn:disabled{opacity:.5;cursor:not-allowed}.pl-message{grid-column:1/-1;padding:11px 12px;border-radius:8px;font-size:10px}.pl-message.ok{background:rgba(46,160,98,.1);color:#9ce0b8;border:1px solid rgba(46,160,98,.3)}.pl-message.err{background:rgba(214,31,38,.08);color:#ffaaa5;border:1px solid rgba(214,31,38,.3)}@media(max-width:720px){.pl-picker,.pl-form{grid-template-columns:1fr}.pl-field.full,.pl-preview,.pl-actions,.pl-message{grid-column:auto}.pl-actions{justify-content:stretch}.pl-actions .pl-btn{flex:1}}
`;

function address(form: LocationForm) {
  const parts = [form.roadHolding, form.villageArea, form.wardNo ? `Ward ${form.wardNo}` : "", form.localBodyName, form.upazilaThana, form.district, form.division].map(v=>String(v||"").trim()).filter(Boolean);
  return parts.length ? `${parts.join(", ")}, Bangladesh` : "";
}
async function getJson(url: string) {
  const response = await fetch(url, { cache:"no-store", credentials:"same-origin" });
  const json = await response.json();
  if (!response.ok || !json?.success) throw new Error(String(json?.error || "Request failed."));
  return json.data;
}

export default function ProjectLocationsPage(){
  const [projects,setProjects]=useState<ProjectLocation[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [search,setSearch]=useState("");
  const [selectedId,setSelectedId]=useState("");
  const [form,setForm]=useState<LocationForm>(EMPTY);
  const [divisions,setDivisions]=useState<Option[]>([]);
  const [districts,setDistricts]=useState<Option[]>([]);
  const [upazilas,setUpazilas]=useState<Option[]>([]);
  const [localOptions,setLocalOptions]=useState<{unions:Option[];pourashavas:Option[]}>({unions:[],pourashavas:[]});
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState<{kind:"ok"|"err";text:string}|null>(null);

  const selected=useMemo(()=>projects.find(p=>p.projectId===selectedId)||null,[projects,selectedId]);
  const filteredProjects=useMemo(()=>{const q=search.trim().toLowerCase();return projects.filter(p=>!q||[p.projectId,p.projectName,p.clientName,p.legacyLocation,p.division,p.district,p.upazilaThana,p.localBodyName].join(" ").toLowerCase().includes(q));},[projects,search]);
  const generatedAddress=useMemo(()=>address(form),[form]);
  const localNames=useMemo(()=>form.localBodyType==="Union Parishad"?localOptions.unions:form.localBodyType==="Paurashava / Municipality"?localOptions.pourashavas:[],[form.localBodyType,localOptions]);

  async function load(){
    setLoading(true);setError("");
    try{
      const [projectData,divisionData]=await Promise.all([getJson("/api/projects/locations"),getJson("/api/bangladesh-locations?level=divisions")]);
      setProjects(projectData);setDivisions(divisionData);
      if(typeof window!=="undefined"){
        const wanted=new URLSearchParams(window.location.search).get("project")||"";
        if(wanted&&projectData.some((p:ProjectLocation)=>p.projectId===wanted))setSelectedId(wanted);
      }
    }catch(e:any){setError(e?.message||"Could not load project locations.");}finally{setLoading(false);}
  }
  useEffect(()=>{void load();},[]);
  useEffect(()=>{if(!selected){setForm(EMPTY);return;}setForm({division:selected.division||"",district:selected.district||"",upazilaThana:selected.upazilaThana||"",localBodyType:selected.localBodyType||"",localBodyName:selected.localBodyName||"",wardNo:selected.wardNo||"",villageArea:selected.villageArea||"",roadHolding:selected.roadHolding||""});setMessage(null);},[selected]);
  useEffect(()=>{if(!form.division){setDistricts([]);return;}void getJson(`/api/bangladesh-locations?level=districts&division=${encodeURIComponent(form.division)}`).then(setDistricts).catch(()=>setDistricts([]));},[form.division]);
  useEffect(()=>{if(!form.division||!form.district){setUpazilas([]);return;}void getJson(`/api/bangladesh-locations?level=upazilas&division=${encodeURIComponent(form.division)}&district=${encodeURIComponent(form.district)}`).then(setUpazilas).catch(()=>setUpazilas([]));},[form.division,form.district]);
  useEffect(()=>{if(!form.division||!form.district||!form.upazilaThana){setLocalOptions({unions:[],pourashavas:[]});return;}void getJson(`/api/bangladesh-locations?level=local&division=${encodeURIComponent(form.division)}&district=${encodeURIComponent(form.district)}&upazila=${encodeURIComponent(form.upazilaThana)}`).then(setLocalOptions).catch(()=>setLocalOptions({unions:[],pourashavas:[]}));},[form.division,form.district,form.upazilaThana]);

  async function save(e:React.FormEvent){
    e.preventDefault();if(!selectedId||saving)return;setSaving(true);setMessage(null);
    try{
      const response=await fetch("/api/projects/locations",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",cache:"no-store",body:JSON.stringify({projectId:selectedId,...form,fullAddress:generatedAddress})});
      const json=await response.json();if(!response.ok||!json?.success)throw new Error(String(json?.error||"Could not save location."));
      setProjects(current=>current.map(p=>p.projectId===selectedId?{...p,...json.data,legacyLocation:generatedAddress}:p));
      setMessage({kind:"ok",text:"Structured address saved. The public map can now filter this project by its administrative location."});
    }catch(e:any){setMessage({kind:"err",text:e?.message||"Could not save location."});}finally{setSaving(false);}
  }

  if(loading)return <LoadingState label="Loading project locations..."/>;
  if(error)return <ErrorState message={error} onRetry={load}/>;
  return <><style dangerouslySetInnerHTML={{__html:css}}/><div className="project-locations-page">
    <PageHeader eyebrow="PROJECT ADDRESS DIRECTORY" title="Project Locations" description="Store each project by Division → District/Zila → Upazila/Thana → Union/Municipality/City Corporation → Ward, while preserving the existing site pin for the interactive map." action={<Link className="pl-btn" href="/admin/projects">← Projects</Link>}/>
    <section className="pl-card">
      <div className="pl-head"><strong>Select a project</strong><span>Search by File ID, project name, client or existing address. Existing projects remain valid even if structured address fields have not been filled yet.</span></div>
      <div className="pl-picker"><input className="pl-input" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search LV-157, project name, client or address"/><select className="pl-select" value={selectedId} onChange={e=>setSelectedId(e.target.value)}><option value="">Choose project…</option>{filteredProjects.map(p=><option key={p.projectId} value={p.projectId}>{p.projectId} · {p.projectName||p.clientName||"Unnamed project"}</option>)}</select></div>
      {selected&&<div className="pl-meta"><b>{selected.projectId}</b> · {selected.projectName||selected.clientName||"Project"}{selected.legacyLocation?<> · Existing address: {selected.legacyLocation}</>:null}</div>}
    </section>
    {selected&&<section className="pl-card"><div className="pl-head"><strong>Bangladesh administrative address</strong><span>Division, District and Upazila are cascading. Union and Paurashava options come from the selected Upazila; City Corporation and Other remain editable for urban/special cases.</span></div>
      <form className="pl-form" onSubmit={save}>
        <label className="pl-field"><span>Division</span><select className="pl-select" value={form.division} onChange={e=>setForm(v=>({...v,division:e.target.value,district:"",upazilaThana:"",localBodyName:"",wardNo:""}))}><option value="">Select division…</option>{divisions.map(o=><option key={o.name} value={o.name}>{o.name}{o.bnName?` · ${o.bnName}`:""}</option>)}</select></label>
        <label className="pl-field"><span>District / Zila</span><select className="pl-select" value={form.district} disabled={!form.division} onChange={e=>setForm(v=>({...v,district:e.target.value,upazilaThana:"",localBodyName:"",wardNo:""}))}><option value="">Select district…</option>{districts.map(o=><option key={o.name} value={o.name}>{o.name}{o.bnName?` · ${o.bnName}`:""}</option>)}</select></label>
        <label className="pl-field"><span>Upazila / Thana</span><select className="pl-select" value={form.upazilaThana} disabled={!form.district} onChange={e=>setForm(v=>({...v,upazilaThana:e.target.value,localBodyName:"",wardNo:""}))}><option value="">Select upazila / thana…</option>{upazilas.map(o=><option key={o.name} value={o.name}>{o.name}{o.bnName?` · ${o.bnName}`:""}</option>)}</select></label>
        <label className="pl-field"><span>Local body type</span><select className="pl-select" value={form.localBodyType} onChange={e=>setForm(v=>({...v,localBodyType:e.target.value,localBodyName:"",wardNo:""}))}><option value="">Select type…</option>{LOCAL_TYPES.map(type=><option key={type} value={type}>{type}</option>)}</select></label>
        <label className="pl-field"><span>Union / Municipality / City Corporation</span>{localNames.length?<select className="pl-select" value={form.localBodyName} onChange={e=>setForm(v=>({...v,localBodyName:e.target.value,wardNo:""}))}><option value="">Select local area…</option>{localNames.map(o=><option key={o.name} value={o.name}>{o.name}{o.bnName?` · ${o.bnName}`:""}</option>)}</select>:<input className="pl-input" value={form.localBodyName} onChange={e=>setForm(v=>({...v,localBodyName:e.target.value}))} placeholder="Enter local body name"/>}<small>Union/Paurashava lists appear automatically where available.</small></label>
        <label className="pl-field"><span>Ward No.</span><input className="pl-input" value={form.wardNo} onChange={e=>setForm(v=>({...v,wardNo:e.target.value.replace(/[^0-9A-Za-z/-]/g,"")}))} placeholder="05"/></label>
        <label className="pl-field"><span>Village / Area / Mohalla</span><input className="pl-input" value={form.villageArea} onChange={e=>setForm(v=>({...v,villageArea:e.target.value}))} placeholder="Village, area or mohalla"/></label>
        <label className="pl-field"><span>Road / Street / Holding No.</span><input className="pl-input" value={form.roadHolding} onChange={e=>setForm(v=>({...v,roadHolding:e.target.value}))} placeholder="Optional road, street or holding"/></label>
        <div className="pl-preview"><span>GENERATED PROJECT ADDRESS</span><strong>{generatedAddress||selected.legacyLocation||"Choose the administrative address above."}</strong></div>
        {message&&<div className={`pl-message ${message.kind}`}>{message.text}</div>}
        <div className="pl-actions"><button type="button" className="pl-btn" onClick={()=>setForm({division:selected.division||"",district:selected.district||"",upazilaThana:selected.upazilaThana||"",localBodyType:selected.localBodyType||"",localBodyName:selected.localBodyName||"",wardNo:selected.wardNo||"",villageArea:selected.villageArea||"",roadHolding:selected.roadHolding||""})}>Reset</button><button className="pl-btn primary" disabled={saving}>{saving?"Saving…":"Save structured address"}</button></div>
      </form>
    </section>}
  </div></>;
}
