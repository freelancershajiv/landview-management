"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useEffect } from "react";
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
type LocalOption = Option & { type: "Union Parishad" | "Paurashava / Municipality" };
type LocalResponse = { unions: Option[]; pourashavas: Option[] };

const css = `
.project-locations-page{display:grid;gap:14px;max-width:none}.pl-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 14px;border:1px solid var(--theme-line-rgba_255_255_255__1_,rgba(255,255,255,.1));border-radius:12px;background:var(--theme-bg-_111a22,#111a22)}.pl-search{height:40px;min-width:260px;flex:1 1 320px;border:1px solid var(--theme-line-rgba_255_255_255__12_,rgba(255,255,255,.12));border-radius:8px;background:var(--theme-bg-_0d151c,#0d151c);color:var(--theme-ink-_eef2f4,#eef2f4);padding:0 12px;font-size:11px;outline:none}.pl-search:focus,.pl-cell-input:focus,.pl-cell-select:focus{border-color:#d61f26;box-shadow:0 0 0 2px rgba(214,31,38,.1)}.pl-summary{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.pl-chip{display:inline-flex;align-items:center;height:30px;padding:0 9px;border-radius:999px;background:var(--theme-bg-_18232d,#18232d);color:var(--theme-ink-_9ca7ae,#9ca7ae);font-size:9px;font-weight:800;white-space:nowrap}.pl-chip.changed{background:rgba(214,31,38,.1);color:#ff9b96;border:1px solid rgba(214,31,38,.25)}.pl-actions{display:flex;align-items:center;gap:8px}.pl-btn{height:40px;padding:0 14px;border:1px solid var(--theme-line-rgba_255_255_255__14_,rgba(255,255,255,.14));border-radius:8px;background:var(--theme-bg-_18232d,#18232d);color:var(--theme-ink-_fff,#fff);font-size:10px;font-weight:900;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;white-space:nowrap}.pl-btn.primary{background:#d61f26;border-color:#d61f26}.pl-btn:disabled{opacity:.45;cursor:not-allowed}.pl-message{padding:10px 12px;border-radius:9px;font-size:10px}.pl-message.ok{background:rgba(46,160,98,.1);color:#9ce0b8;border:1px solid rgba(46,160,98,.3)}.pl-message.err{background:rgba(214,31,38,.08);color:#ffaaa5;border:1px solid rgba(214,31,38,.3)}.pl-table-card{border:1px solid var(--theme-line-rgba_255_255_255__1_,rgba(255,255,255,.1));border-radius:12px;background:var(--theme-bg-_111a22,#111a22);overflow:hidden}.pl-table-wrap{width:100%;overflow:auto;max-height:calc(100vh - 260px);min-height:420px}.pl-table{width:100%;min-width:1380px;border-collapse:separate;border-spacing:0}.pl-table th{position:sticky;top:0;z-index:3;height:42px;padding:0 9px;border-bottom:1px solid var(--theme-line-rgba_255_255_255__12_,rgba(255,255,255,.12));background:var(--theme-bg-_16212a,#16212a);color:var(--theme-ink-_88959e,#88959e);font-size:8px;font-weight:900;letter-spacing:.08em;text-align:left;text-transform:uppercase;white-space:nowrap}.pl-table td{padding:7px 7px;border-bottom:1px solid var(--theme-line-rgba_255_255_255__065_,rgba(255,255,255,.065));vertical-align:middle}.pl-table tr:last-child td{border-bottom:0}.pl-table tbody tr:hover td{background:rgba(255,255,255,.018)}.pl-table tr.dirty td{background:rgba(214,31,38,.025)}.pl-sl{width:46px;text-align:center!important;color:var(--theme-ink-_687680,#687680);font-size:9px;font-variant-numeric:tabular-nums}.pl-id{width:88px}.pl-id strong{display:block;color:#ef6c66;font-size:10px;white-space:nowrap}.pl-id small{display:block;margin-top:3px;color:#d9938f;font-size:7px;font-weight:900;text-transform:uppercase}.pl-project{min-width:220px;max-width:300px}.pl-project strong{display:block;color:var(--theme-ink-_e6ebee,#e6ebee);font-size:10px;line-height:1.35}.pl-owner{min-width:170px;max-width:220px;color:var(--theme-ink-_aeb8be,#aeb8be);font-size:10px;line-height:1.35}.pl-location-cell{min-width:155px}.pl-location-cell.local{min-width:215px}.pl-location-cell.ward{min-width:92px;width:92px}.pl-cell-input,.pl-cell-select{width:100%;height:34px;border:1px solid var(--theme-line-rgba_255_255_255__1_,rgba(255,255,255,.1));border-radius:7px;background:var(--theme-bg-_0d151c,#0d151c);color:var(--theme-ink-_e8edf0,#e8edf0);padding:0 8px;font-size:9px;outline:none}.pl-cell-select:disabled{opacity:.48}.pl-empty{padding:36px;text-align:center;color:var(--theme-ink-_75828b,#75828b);font-size:10px}.pl-row-error{display:block;margin-top:4px;color:#ff8e88;font-size:7px;line-height:1.25}.pl-row-saved{display:block;margin-top:4px;color:#8cd7aa;font-size:7px;line-height:1.25}.pl-help{padding:10px 14px;border-top:1px solid var(--theme-line-rgba_255_255_255__08_,rgba(255,255,255,.08));color:var(--theme-ink-_71808a,#71808a);font-size:9px;line-height:1.55;background:var(--theme-bg-_0d151c,#0d151c)}
@media(max-width:760px){.pl-toolbar{align-items:stretch}.pl-search{min-width:100%;flex-basis:100%}.pl-actions{width:100%}.pl-actions .pl-btn{flex:1}.pl-table-wrap{max-height:calc(100vh - 315px)}}
`;

function text(value: unknown){return String(value ?? "").trim();}
function projectSerial(projectId:string){const match=text(projectId).match(/\d+/);return match?Number(match[0]):Number.MAX_SAFE_INTEGER;}
function locationKey(...values:string[]){return values.map(v=>text(v).toLowerCase()).join("|");}
function address(row:ProjectLocation){
  const parts=[row.roadHolding,row.villageArea,row.wardNo?`Ward ${row.wardNo}`:"",row.localBodyName,row.upazilaThana,row.district,row.division].map(text).filter(Boolean);
  return parts.length?`${parts.join(", ")}, Bangladesh`:"";
}
function includeCurrent(options:Option[],current:string){
  const value=text(current);if(!value||options.some(o=>o.name===value))return options;
  return [{name:value},...options];
}
async function getJson(url:string){
  const response=await fetch(url,{cache:"no-store",credentials:"same-origin"});
  const json=await response.json();
  if(!response.ok||!json?.success)throw new Error(String(json?.error||"Request failed."));
  return json.data;
}

export default function ProjectLocationsPage(){
  const [projects,setProjects]=useState<ProjectLocation[]>([]);
  const [drafts,setDrafts]=useState<Record<string,ProjectLocation>>({});
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [search,setSearch]=useState("");
  const [divisions,setDivisions]=useState<Option[]>([]);
  const [districtCache,setDistrictCache]=useState<Record<string,Option[]>>({});
  const [upazilaCache,setUpazilaCache]=useState<Record<string,Option[]>>({});
  const [localCache,setLocalCache]=useState<Record<string,LocalResponse>>({});
  const [dirty,setDirty]=useState<Set<string>>(new Set());
  const [saving,setSaving]=useState(false);
  const [rowErrors,setRowErrors]=useState<Record<string,string>>({});
  const [savedRows,setSavedRows]=useState<Set<string>>(new Set());
  const [message,setMessage]=useState<{kind:"ok"|"err";text:string}|null>(null);
  const loadingKeys=useRef(new Set<string>());

  const sortedProjects=useMemo(()=>[...projects].sort((a,b)=>projectSerial(a.projectId)-projectSerial(b.projectId)||a.projectId.localeCompare(b.projectId)),[projects]);
  const visibleProjects=useMemo(()=>{const q=search.trim().toLowerCase();return sortedProjects.filter(p=>!q||[p.projectId,p.projectName,p.clientName].join(" ").toLowerCase().includes(q));},[sortedProjects,search]);

  async function load(){
    setLoading(true);setError("");setMessage(null);
    try{
      const [projectData,divisionData]=await Promise.all([getJson("/api/projects/locations"),getJson("/api/bangladesh-locations?level=divisions")]);
      const rows=(projectData||[]) as ProjectLocation[];
      setProjects(rows);
      setDrafts(Object.fromEntries(rows.map(p=>[p.projectId,{...p}])));
      setDivisions(divisionData||[]);
      setDirty(new Set());setRowErrors({});setSavedRows(new Set());
    }catch(e:any){setError(e?.message||"Could not load project locations.");}
    finally{setLoading(false);}
  }
  useEffect(()=>{void load();},[]);

  async function ensureDistricts(division:string){
    const d=text(division);if(!d||districtCache[d])return;
    const key=`district:${d}`;if(loadingKeys.current.has(key))return;loadingKeys.current.add(key);
    try{const data=await getJson(`/api/bangladesh-locations?level=districts&division=${encodeURIComponent(d)}`);setDistrictCache(c=>({...c,[d]:data||[]}));}catch{}finally{loadingKeys.current.delete(key);}
  }
  async function ensureUpazilas(division:string,district:string){
    const d=text(division),z=text(district);if(!d||!z)return;const cacheKey=locationKey(d,z);if(upazilaCache[cacheKey])return;
    const key=`upazila:${cacheKey}`;if(loadingKeys.current.has(key))return;loadingKeys.current.add(key);
    try{const data=await getJson(`/api/bangladesh-locations?level=upazilas&division=${encodeURIComponent(d)}&district=${encodeURIComponent(z)}`);setUpazilaCache(c=>({...c,[cacheKey]:data||[]}));}catch{}finally{loadingKeys.current.delete(key);}
  }
  async function ensureLocal(division:string,district:string,upazila:string){
    const d=text(division),z=text(district),u=text(upazila);if(!d||!z||!u)return;const cacheKey=locationKey(d,z,u);if(localCache[cacheKey])return;
    const key=`local:${cacheKey}`;if(loadingKeys.current.has(key))return;loadingKeys.current.add(key);
    try{const data=await getJson(`/api/bangladesh-locations?level=local&division=${encodeURIComponent(d)}&district=${encodeURIComponent(z)}&upazila=${encodeURIComponent(u)}`);setLocalCache(c=>({...c,[cacheKey]:data||{unions:[],pourashavas:[]}}));}catch{}finally{loadingKeys.current.delete(key);}
  }
  function localOptions(row:ProjectLocation):LocalOption[]{
    const found=localCache[locationKey(row.division,row.district,row.upazilaThana)]||{unions:[],pourashavas:[]};
    return [...(found.unions||[]).map(o=>({...o,type:"Union Parishad" as const})),...(found.pourashavas||[]).map(o=>({...o,type:"Paurashava / Municipality" as const}))];
  }
  function markChanged(projectId:string,patch:Partial<ProjectLocation>){
    setDrafts(current=>({...current,[projectId]:{...current[projectId],...patch}}));
    setDirty(current=>{const next=new Set(current);next.add(projectId);return next;});
    setSavedRows(current=>{const next=new Set(current);next.delete(projectId);return next;});
    setRowErrors(current=>{if(!current[projectId])return current;const next={...current};delete next[projectId];return next;});
    setMessage(null);
  }
  function changeDivision(id:string,value:string){markChanged(id,{division:value,district:"",upazilaThana:"",localBodyType:"",localBodyName:"",wardNo:""});void ensureDistricts(value);}
  function changeDistrict(id:string,value:string){const row=drafts[id];markChanged(id,{district:value,upazilaThana:"",localBodyType:"",localBodyName:"",wardNo:""});void ensureUpazilas(row?.division||"",value);}
  function changeUpazila(id:string,value:string){const row=drafts[id];markChanged(id,{upazilaThana:value,localBodyType:"",localBodyName:"",wardNo:""});void ensureLocal(row?.division||"",row?.district||"",value);}
  function changeLocal(id:string,value:string){
    const row=drafts[id];if(!row)return;const match=localOptions(row).find(o=>o.name===value);
    markChanged(id,{localBodyName:value,localBodyType:match?.type||(value?row.localBodyType||"Other":"")});
  }

  async function saveOne(id:string,row:ProjectLocation){
    const response=await fetch("/api/projects/locations",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",cache:"no-store",body:JSON.stringify({projectId:id,division:row.division,district:row.district,upazilaThana:row.upazilaThana,localBodyType:row.localBodyType,localBodyName:row.localBodyName,wardNo:row.wardNo,villageArea:row.villageArea,roadHolding:row.roadHolding,fullAddress:address(row)})});
    const json=await response.json();if(!response.ok||!json?.success)throw new Error(String(json?.error||"Could not save location."));
    return json.data as ProjectLocation;
  }
  async function saveAll(){
    if(saving||dirty.size===0)return;setSaving(true);setMessage(null);setRowErrors({});setSavedRows(new Set());
    const ids=Array.from(dirty);const successes:string[]=[];const failures:Record<string,string>={};const updatedRows:Record<string,ProjectLocation>={};
    try{
      for(let i=0;i<ids.length;i+=6){
        const batch=ids.slice(i,i+6);
        await Promise.all(batch.map(async id=>{try{const data=await saveOne(id,drafts[id]);successes.push(id);updatedRows[id]=data;}catch(e:any){failures[id]=e?.message||"Save failed.";}}));
      }
      if(successes.length){
        setProjects(current=>current.map(p=>updatedRows[p.projectId]?{...p,...updatedRows[p.projectId]}:p));
        setDrafts(current=>{const next={...current};for(const id of successes)next[id]={...next[id],...updatedRows[id]};return next;});
        setDirty(current=>{const next=new Set(current);for(const id of successes)next.delete(id);return next;});
        setSavedRows(new Set(successes));
      }
      setRowErrors(failures);
      const failedCount=Object.keys(failures).length;
      setMessage(failedCount?{kind:"err",text:`Saved ${successes.length} project${successes.length===1?"":"s"}; ${failedCount} row${failedCount===1?"":"s"} could not be saved. The failed rows remain marked for correction.`}:{kind:"ok",text:`Saved location updates for ${successes.length} project${successes.length===1?"":"s"}.`});
    }finally{setSaving(false);}
  }

  if(loading)return <LoadingState label="Loading all project locations..."/>;
  if(error)return <ErrorState message={error} onRetry={load}/>;

  return <><style dangerouslySetInnerHTML={{__html:css}}/><div className="project-locations-page">
    <PageHeader eyebrow="PROJECT ADDRESS DIRECTORY" title="Project Locations" description="Update every project from one page. Projects are serially ordered and only the project details, owner and core Bangladesh administrative address fields are shown." action={<div className="pl-actions"><Link className="pl-btn" href="/admin/projects">← Projects</Link><button type="button" className="pl-btn primary" disabled={saving||dirty.size===0} onClick={saveAll}>{saving?`Saving ${dirty.size}…`:dirty.size?`Save All Changes (${dirty.size})`:"All Changes Saved"}</button></div>}/>
    <div className="pl-toolbar"><input className="pl-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search File ID, project details or owner name…"/><div className="pl-summary"><span className="pl-chip">{projects.length} projects</span><span className="pl-chip">{visibleProjects.length} shown</span>{dirty.size>0&&<span className="pl-chip changed">{dirty.size} unsaved</span>}</div></div>
    {message&&<div className={`pl-message ${message.kind}`}>{message.text}</div>}
    <section className="pl-table-card"><div className="pl-table-wrap"><table className="pl-table"><thead><tr><th className="pl-sl">SL</th><th>File ID</th><th>Project Details</th><th>Owner Name</th><th>Division</th><th>Zila / District</th><th>Upazila / Thana</th><th>Union / Municipality</th><th>Ward</th></tr></thead><tbody>
      {visibleProjects.map((project,index)=>{const row=drafts[project.projectId]||project;const districtOptions=includeCurrent(districtCache[row.division]||[],row.district);const upazilaOptions=includeCurrent(upazilaCache[locationKey(row.division,row.district)]||[],row.upazilaThana);const locals=localOptions(row);const localSelectOptions=includeCurrent(locals,row.localBodyName);return <tr key={project.projectId} className={dirty.has(project.projectId)?"dirty":""}>
        <td className="pl-sl">{index+1}</td>
        <td className="pl-id"><strong>{project.projectId}</strong>{dirty.has(project.projectId)&&<small>Unsaved</small>}{rowErrors[project.projectId]&&<span className="pl-row-error">{rowErrors[project.projectId]}</span>}{savedRows.has(project.projectId)&&<span className="pl-row-saved">Saved</span>}</td>
        <td className="pl-project"><strong>{project.projectName||"Unnamed project"}</strong></td>
        <td className="pl-owner">{project.clientName||"—"}</td>
        <td className="pl-location-cell"><select className="pl-cell-select" value={row.division} onChange={e=>changeDivision(project.projectId,e.target.value)}><option value="">—</option>{includeCurrent(divisions,row.division).map(o=><option key={o.name} value={o.name}>{o.name}</option>)}</select></td>
        <td className="pl-location-cell"><select className="pl-cell-select" value={row.district} disabled={!row.division} onFocus={()=>void ensureDistricts(row.division)} onChange={e=>changeDistrict(project.projectId,e.target.value)}><option value="">—</option>{districtOptions.map(o=><option key={o.name} value={o.name}>{o.name}</option>)}</select></td>
        <td className="pl-location-cell"><select className="pl-cell-select" value={row.upazilaThana} disabled={!row.district} onFocus={()=>void ensureUpazilas(row.division,row.district)} onChange={e=>changeUpazila(project.projectId,e.target.value)}><option value="">—</option>{upazilaOptions.map(o=><option key={o.name} value={o.name}>{o.name}</option>)}</select></td>
        <td className="pl-location-cell local"><select className="pl-cell-select" value={row.localBodyName} disabled={!row.upazilaThana} onFocus={()=>void ensureLocal(row.division,row.district,row.upazilaThana)} onChange={e=>changeLocal(project.projectId,e.target.value)}><option value="">—</option>{localSelectOptions.map(o=><option key={`${o.name}-${"type" in o?o.type:"current"}`} value={o.name}>{o.name}</option>)}</select></td>
        <td className="pl-location-cell ward"><input className="pl-cell-input" value={row.wardNo} onChange={e=>markChanged(project.projectId,{wardNo:e.target.value.replace(/[^0-9A-Za-z/-]/g,"")})} placeholder="Ward"/></td>
      </tr>;})}
      {!visibleProjects.length&&<tr><td className="pl-empty" colSpan={9}>No projects match this search.</td></tr>}
    </tbody></table></div><div className="pl-help">Division → Zila → Upazila → Union/Municipality choices are linked. Open a dropdown to load the valid next-level choices. Hidden village/area and road/holding data are preserved when you save.</div></section>
  </div></>;
}
