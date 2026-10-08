"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useMemo, useRef, useState } from "react";
import PublicHeader from "@/components/public-header";
import { officeLocations, type OfficeLocation } from "@/lib/office-locations";
import type { PublicProjectSeo } from "@/lib/public-projects-server";

declare global { interface Window { L?: any; } }

type MapMode = "map" | "satellite";

const DEFAULT_CENTER: [number, number] = [23.0159, 91.3976];
const STREET_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const SATELLITE_TILE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

const css = `
.project-map-page{min-height:100vh;background:#080d12;color:#f4f6f7}
.project-map-wrap{width:min(100% - 36px,1380px);margin:auto}
.project-map-hero{padding:48px 0 26px;background:radial-gradient(circle at 80% 10%,rgba(214,31,38,.12),transparent 34%),linear-gradient(180deg,#0d151d,#080d12);border-bottom:1px solid rgba(255,255,255,.08)}
.project-map-hero-grid{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(280px,.7fr);gap:40px;align-items:end}
.project-map-kicker{color:#ef6c66;font-size:10px;font-weight:900;letter-spacing:.16em}
.project-map-hero h1{max-width:850px;margin:11px 0;font-family:Georgia,"Times New Roman",serif;font-size:clamp(40px,5.6vw,68px);font-weight:400;line-height:.96;letter-spacing:-.04em}
.project-map-hero p{max-width:760px;margin:0;color:#9da8b1;font-size:12px;line-height:1.75}
.project-map-stats{display:grid;grid-template-columns:repeat(2,1fr);border:1px solid rgba(255,255,255,.1);border-radius:14px;overflow:hidden;background:rgba(255,255,255,.025)}
.project-map-stat{padding:15px}
.project-map-stat:nth-child(odd){border-right:1px solid rgba(255,255,255,.08)}
.project-map-stat:nth-child(-n+2){border-bottom:1px solid rgba(255,255,255,.08)}
.project-map-stat strong{display:block;font-size:23px}
.project-map-stat span{display:block;margin-top:4px;color:#77838d;font-size:8px;font-weight:900;letter-spacing:.1em;text-transform:uppercase}
.project-map-toolbar{padding:13px 0;border-bottom:1px solid rgba(255,255,255,.08);background:rgba(8,13,18,.96);position:sticky;top:84px;z-index:50;backdrop-filter:blur(14px)}
.project-map-controls{display:grid;grid-template-columns:minmax(200px,1.2fr) repeat(4,minmax(130px,.7fr));gap:8px;align-items:center}
.project-map-controls.second{margin-top:8px;grid-template-columns:repeat(4,minmax(130px,1fr)) auto}
.project-map-search,.project-map-select{height:40px;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:#111922;color:#f5f5f5;outline:none;font-size:10px}
.project-map-search{padding:0 12px}
.project-map-select{padding:0 29px 0 10px}
.project-map-search:focus,.project-map-select:focus{border-color:#d61f26;box-shadow:0 0 0 3px rgba(214,31,38,.1)}
.project-map-reset{height:40px;padding:0 13px;border:1px solid rgba(214,31,38,.5);border-radius:8px;background:transparent;color:#fff;font-size:9px;font-weight:900;cursor:pointer;white-space:nowrap}
.project-map-reset:hover{background:#d61f26}
.project-map-main{padding:22px 0 60px}
.project-map-shell{display:grid;grid-template-columns:minmax(0,1.62fr) minmax(320px,.62fr);height:clamp(590px,72vh,800px);min-height:590px;border:1px solid rgba(255,255,255,.1);border-radius:18px;overflow:hidden;background:#0e151c}
.project-map-canvas-wrap{position:relative;min-width:0;min-height:0;background:#101821}
.project-map-canvas{position:absolute;inset:0;z-index:1}
.project-map-loading,.project-map-error{position:absolute;left:16px;top:16px;z-index:500;padding:9px 11px;border:1px solid rgba(255,255,255,.13);border-radius:8px;background:rgba(8,13,18,.9);color:#bec6cc;font-size:9px}
.project-map-error{right:16px;border-color:rgba(214,31,38,.5);color:#f0c8c9}
.project-map-style-switch{position:absolute;right:16px;top:16px;z-index:560;display:flex;padding:4px;border:1px solid rgba(255,255,255,.14);border-radius:10px;background:rgba(8,13,18,.92);backdrop-filter:blur(12px);box-shadow:0 10px 30px rgba(0,0,0,.25)}
.project-map-style-switch button{height:30px;min-width:70px;padding:0 11px;border:0;border-radius:7px;background:transparent;color:#9da8b1;font-size:8px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;cursor:pointer}
.project-map-style-switch button.active{background:#d61f26;color:#fff;box-shadow:0 5px 15px rgba(214,31,38,.28)}
.project-map-legend{position:absolute;right:16px;top:64px;z-index:550;display:grid;gap:7px;padding:9px 10px;border:1px solid rgba(255,255,255,.13);border-radius:9px;background:rgba(8,13,18,.88);backdrop-filter:blur(10px);color:#c2c9ce;font-size:8px;font-weight:800}
.project-map-legend span{display:flex;align-items:center;gap:7px;white-space:nowrap}
.project-map-legend-project{width:10px;height:10px;border:2px solid #fff;border-radius:50%;background:#d61f26;box-sizing:border-box}
.project-map-legend-office{width:15px;height:15px;display:grid!important;place-items:center!important;border:1px solid #efb733;border-radius:4px;background:#0b1117;color:#efb733;font-size:9px;line-height:1}
.project-map-side{min-width:0;min-height:0;display:flex;flex-direction:column;overflow:hidden;border-left:1px solid rgba(255,255,255,.09);background:#0c1218}
.project-map-side-head{flex:0 0 auto;padding:15px 16px;border-bottom:1px solid rgba(255,255,255,.08)}
.project-map-side-head strong{display:block;font-size:13px}
.project-map-side-head span{display:block;margin-top:4px;color:#78848d;font-size:9px}
.project-map-offices{flex:0 0 auto;padding:10px;border-bottom:1px solid rgba(255,255,255,.08);background:rgba(239,183,51,.025)}
.project-map-offices-label{display:block;margin:2px 3px 7px;color:#c89422;font-size:7px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}
.project-map-office-card{width:100%;display:grid;grid-template-columns:38px minmax(0,1fr);gap:10px;align-items:center;padding:9px;border:1px solid rgba(239,183,51,.13);border-radius:9px;background:rgba(255,255,255,.015);color:inherit;text-align:left;cursor:pointer}
.project-map-office-card:hover,.project-map-office-card.active{border-color:rgba(239,183,51,.52);background:rgba(239,183,51,.07)}
.project-map-office-card-icon{width:38px;height:38px;display:grid;place-items:center;border:1px solid #efb733;border-radius:9px;background:#0b1117;color:#efb733;font-size:17px}
.project-map-office-card strong{display:block;font-size:10px}
.project-map-office-card p{margin:3px 0 0;color:#89949c;font-size:8px;line-height:1.45}
.project-map-list{flex:1 1 auto;min-height:0;overflow-y:auto!important;overflow-x:hidden;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;touch-action:pan-y;padding:10px;scrollbar-width:thin}
.project-map-card{width:100%;display:grid;grid-template-columns:72px minmax(0,1fr);gap:11px;padding:10px;border:1px solid transparent;border-radius:10px;background:transparent;color:inherit;text-align:left;cursor:pointer}
.project-map-card:hover,.project-map-card.active{border-color:rgba(214,31,38,.42);background:rgba(214,31,38,.055)}
.project-map-thumb{width:72px;height:72px;border-radius:8px;object-fit:cover;background:#131c24}
.project-map-thumb-fallback{display:grid;place-items:center;width:72px;height:72px;border-radius:8px;background:linear-gradient(145deg,#1b2731,#0c1217);color:rgba(255,255,255,.18);font-weight:900}
.project-map-card-id{color:#ef6c66;font-size:8px;font-weight:900;letter-spacing:.09em}
.project-map-card h3{margin:4px 0 5px;font-size:12px;line-height:1.25}
.project-map-card p{margin:0;color:#89949c;font-size:9px;line-height:1.5}
.project-map-card-meta{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px}
.project-map-card-meta span{padding:4px 6px;border-radius:5px;background:#17212a;color:#9ba6ae;font-size:7px;font-weight:800}
.project-map-empty{padding:28px 18px;text-align:center;color:#78848d;font-size:10px;line-height:1.65}
.project-map-detail{position:absolute;left:16px;bottom:16px;z-index:500;width:min(410px,calc(100% - 32px));padding:16px;border:1px solid rgba(255,255,255,.14);border-radius:13px;background:rgba(8,13,18,.94);backdrop-filter:blur(13px);box-shadow:0 18px 50px rgba(0,0,0,.3)}
.project-map-detail.office{border-color:rgba(239,183,51,.42)}
.project-map-detail-top{display:flex;justify-content:space-between;gap:12px}
.project-map-detail small{color:#ef6c66;font-size:8px;font-weight:900;letter-spacing:.11em}
.project-map-detail.office small{color:#efb733}
.project-map-detail h2{margin:5px 0 6px;font-size:20px;line-height:1.05}
.project-map-detail p{margin:0;color:#98a2a9;font-size:9px;line-height:1.55}
.project-map-detail-close{width:30px;height:30px;border:1px solid rgba(255,255,255,.12);border-radius:7px;background:#151d24;color:#fff;cursor:pointer}
.project-map-detail-meta{display:flex;flex-wrap:wrap;gap:6px;margin-top:11px}
.project-map-detail-meta span{padding:5px 7px;border:1px solid rgba(255,255,255,.09);border-radius:6px;color:#b0b9bf;font-size:8px}
.project-map-detail-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}
.project-map-detail-actions a{min-height:35px;display:inline-flex;align-items:center;justify-content:center;padding:0 11px;border-radius:7px;border:1px solid #d61f26;background:#d61f26;color:#fff;font-size:9px;font-weight:900;text-decoration:none}
.project-map-detail.office .project-map-detail-actions a{border-color:#d69b1f;background:#d69b1f;color:#101820}
.project-map-detail.office .project-map-detail-actions a.secondary{background:transparent;color:#efb733}
.lv-office-marker-wrap{background:transparent!important;border:0!important}
.lv-office-pin{position:relative;width:42px;height:42px;display:grid;place-items:center;border:2px solid #efb733;border-radius:11px;background:#0b1117;color:#efb733;box-shadow:0 10px 25px rgba(0,0,0,.42),0 0 0 4px rgba(239,183,51,.12)}
.lv-office-pin:after{content:"";position:absolute;left:50%;bottom:-7px;width:12px;height:12px;border-right:2px solid #efb733;border-bottom:2px solid #efb733;background:#0b1117;transform:translateX(-50%) rotate(45deg);border-radius:1px}
.lv-office-pin svg{position:relative;z-index:2;width:23px;height:23px}
.leaflet-container{background:#101821;font-family:inherit}
.leaflet-control-zoom a{background:#101820!important;color:#fff!important;border-color:rgba(255,255,255,.12)!important}
.leaflet-control-attribution{background:rgba(8,13,18,.76)!important;color:#b9c0c4!important}
.leaflet-control-attribution a{color:#e1e5e8!important}
.leaflet-tooltip{background:#101820!important;border:1px solid rgba(255,255,255,.16)!important;color:#fff!important;box-shadow:0 8px 24px rgba(0,0,0,.3)!important;font-size:10px!important}
.leaflet-tooltip:before{display:none!important}
@media(max-width:1120px){.project-map-controls{grid-template-columns:1fr 1fr 1fr}.project-map-search{grid-column:1/-1}.project-map-controls.second{grid-template-columns:1fr 1fr 1fr}.project-map-reset{grid-column:auto}}
@media(max-width:900px){.project-map-toolbar{top:74px}.project-map-hero-grid{grid-template-columns:1fr}.project-map-stats{max-width:500px}.project-map-shell{grid-template-columns:1fr;height:auto;min-height:0}.project-map-canvas-wrap{height:520px}.project-map-side{border-left:0;border-top:1px solid rgba(255,255,255,.09);height:min(500px,65vh);max-height:none}.project-map-list{max-height:none}}
@media(max-width:620px){.project-map-wrap{width:min(100% - 24px,1380px)}.project-map-toolbar{top:66px}.project-map-controls,.project-map-controls.second{grid-template-columns:1fr 1fr}.project-map-search{grid-column:1/-1}.project-map-reset{grid-column:1/-1}.project-map-canvas-wrap{height:470px}.project-map-detail{left:10px;bottom:10px;width:calc(100% - 20px)}.project-map-card{grid-template-columns:62px 1fr}.project-map-thumb,.project-map-thumb-fallback{width:62px;height:62px}.project-map-style-switch{right:10px;top:10px}.project-map-legend{right:10px;top:58px}}
@media(max-width:420px){.project-map-controls,.project-map-controls.second{grid-template-columns:1fr}.project-map-search,.project-map-reset{grid-column:auto}.project-map-style-switch button{min-width:58px}.project-map-legend{font-size:7px}}
`;

function text(value: unknown){return String(value ?? "").trim();}
function unique(values: unknown[]){return Array.from(new Set(values.map(text).filter(Boolean))).sort((a,b)=>a.localeCompare(b));}
function validMapProject(project: PublicProjectSeo){return project.mapEnabled===true&&Number.isFinite(Number(project.mapLatitude))&&Number.isFinite(Number(project.mapLongitude));}
function imageUrl(url?: string){const value=text(url);if(!value)return "";const match=value.match(/drive\.google\.com\/file\/d\/([^/?#]+)/i);if(match?.[1])return `https://drive.google.com/thumbnail?id=${encodeURIComponent(match[1])}&sz=w500`;return value;}
function locationLine(project: PublicProjectSeo){
  const structured=[project.wardNo?`Ward ${project.wardNo}`:"",project.localBodyName,project.upazilaThana,project.district,project.division].map(text).filter(Boolean);
  return structured.length?structured.join(" · "):text(project.location)||"Location not specified";
}
function searchText(project: PublicProjectSeo){return [project.projectId,project.title,project.category,project.location,project.division,project.district,project.upazilaThana,project.localBodyType,project.localBodyName,project.wardNo,project.villageArea,project.roadHolding,project.currentStage,project.area,project.stories,project.description,...(project.services||[])].map(text).filter(Boolean).join(" ").toLowerCase();}
function officeIcon(L:any){
  return L.divIcon({
    className:"lv-office-marker-wrap",
    iconSize:[42,50],
    iconAnchor:[21,48],
    tooltipAnchor:[0,-42],
    html:`<span class="lv-office-pin" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path fill="currentColor" d="M7 21V3h10v18h4v-9h-4v9h-3v-4h-4v4H7Zm3-14h4V5h-4v2Zm0 4h4V9h-4v2Zm0 4h4v-2h-4v2ZM3 21h4V9H3v12Zm2-8h2v-2H5v2Zm0 4h2v-2H5v2Zm12 4h4v-7h-4v7Zm0-4h2v-2h-2v2Z"/></svg></span>`,
  });
}
function createBaseLayer(L:any,mode:MapMode){
  if(mode==="satellite")return L.tileLayer(SATELLITE_TILE_URL,{maxZoom:19,attribution:"Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community"});
  return L.tileLayer(STREET_TILE_URL,{maxZoom:19,attribution:"&copy; OpenStreetMap contributors"});
}
function officePhone(value:string){return value.replace(/\s+/g,"");}

export default function PublicProjectMap({initialProjects}:{initialProjects:PublicProjectSeo[]}){
  const [projects,setProjects]=useState<PublicProjectSeo[]>(initialProjects);
  const mappedProjects=useMemo(()=>projects.filter(validMapProject),[projects]);
  const [query,setQuery]=useState("");
  const [division,setDivision]=useState("All");
  const [district,setDistrict]=useState("All");
  const [upazila,setUpazila]=useState("All");
  const [localBody,setLocalBody]=useState("All");
  const [ward,setWard]=useState("All");
  const [category,setCategory]=useState("All");
  const [stage,setStage]=useState("All");
  const [selectedId,setSelectedId]=useState("");
  const [selectedOfficeId,setSelectedOfficeId]=useState("");
  const [mapMode,setMapMode]=useState<MapMode>("map");
  const [scriptReady,setScriptReady]=useState(false);
  const [mapReady,setMapReady]=useState(false);
  const [mapError,setMapError]=useState("");
  const mapNode=useRef<HTMLDivElement|null>(null);
  const mapRef=useRef<any>(null);
  const layerRef=useRef<any>(null);
  const officeLayerRef=useRef<any>(null);
  const tileLayerRef=useRef<any>(null);
  const tileModeRef=useRef<MapMode>("map");
  const markerRef=useRef<Record<string,any>>({});
  const officeMarkerRef=useRef<Record<string,any>>({});

  const divisions=useMemo(()=>["All",...unique(mappedProjects.map(p=>p.division))],[mappedProjects]);
  const districtPool=useMemo(()=>mappedProjects.filter(p=>division==="All"||text(p.division)===division),[mappedProjects,division]);
  const districts=useMemo(()=>["All",...unique(districtPool.map(p=>p.district))],[districtPool]);
  const upazilaPool=useMemo(()=>districtPool.filter(p=>district==="All"||text(p.district)===district),[districtPool,district]);
  const upazilas=useMemo(()=>["All",...unique(upazilaPool.map(p=>p.upazilaThana))],[upazilaPool]);
  const localPool=useMemo(()=>upazilaPool.filter(p=>upazila==="All"||text(p.upazilaThana)===upazila),[upazilaPool,upazila]);
  const localBodies=useMemo(()=>["All",...unique(localPool.map(p=>p.localBodyName))],[localPool]);
  const wardPool=useMemo(()=>localPool.filter(p=>localBody==="All"||text(p.localBodyName)===localBody),[localPool,localBody]);
  const wards=useMemo(()=>["All",...unique(wardPool.map(p=>p.wardNo))],[wardPool]);
  const categories=useMemo(()=>["All",...unique(mappedProjects.map(p=>p.category))],[mappedProjects]);
  const stages=useMemo(()=>["All",...unique(mappedProjects.map(p=>p.currentStage))],[mappedProjects]);

  const filtered=useMemo(()=>{const term=query.trim().toLowerCase();return mappedProjects.filter(p=>(division==="All"||text(p.division)===division)&&(district==="All"||text(p.district)===district)&&(upazila==="All"||text(p.upazilaThana)===upazila)&&(localBody==="All"||text(p.localBodyName)===localBody)&&(ward==="All"||text(p.wardNo)===ward)&&(category==="All"||text(p.category)===category)&&(stage==="All"||text(p.currentStage)===stage)&&(!term||searchText(p).includes(term)));},[mappedProjects,query,division,district,upazila,localBody,ward,category,stage]);
  const selected=useMemo(()=>mappedProjects.find(p=>text(p.projectId)===selectedId)||null,[mappedProjects,selectedId]);
  const selectedOffice=useMemo(()=>officeLocations.find(office=>office.id===selectedOfficeId)||null,[selectedOfficeId]);
  const completedCount=mappedProjects.filter(p=>p.currentStage==="Completed").length;

  useEffect(()=>{let cancelled=false;async function refresh(){try{const response=await fetch(`/api/public/projects?mapRefresh=${Date.now()}`,{cache:"no-store"});const json=await response.json();if(!cancelled&&response.ok&&json?.success&&Array.isArray(json.data))setProjects(json.data);}catch{}}void refresh();const onPageShow=()=>void refresh();const onVisibility=()=>{if(document.visibilityState==="visible")void refresh();};window.addEventListener("pageshow",onPageShow);document.addEventListener("visibilitychange",onVisibility);return()=>{cancelled=true;window.removeEventListener("pageshow",onPageShow);document.removeEventListener("visibilitychange",onVisibility);};},[]);
  useEffect(()=>{if(typeof window!=="undefined"&&window.L)setScriptReady(true);},[]);

  useEffect(()=>{
    if(!scriptReady||!mapNode.current||mapRef.current||!window.L)return;
    try{
      const L=window.L;
      const map=L.map(mapNode.current,{zoomControl:true,preferCanvas:true}).setView(DEFAULT_CENTER,8);
      mapRef.current=map;
      tileLayerRef.current=createBaseLayer(L,"map").addTo(map);
      tileModeRef.current="map";
      layerRef.current=L.layerGroup().addTo(map);
      officeLayerRef.current=L.layerGroup().addTo(map);
      setMapReady(true);
      setTimeout(()=>map.invalidateSize(),80);
    }catch(error){console.error(error);setMapError("Interactive map could not initialize on this browser.");}
    return()=>{
      try{mapRef.current?.remove();}catch{}
      mapRef.current=null;
      layerRef.current=null;
      officeLayerRef.current=null;
      tileLayerRef.current=null;
      markerRef.current={};
      officeMarkerRef.current={};
      setMapReady(false);
    };
  },[scriptReady]);

  useEffect(()=>{
    if(!mapReady||!mapRef.current||!window.L||tileModeRef.current===mapMode)return;
    const L=window.L;
    const map=mapRef.current;
    try{if(tileLayerRef.current)map.removeLayer(tileLayerRef.current);}catch{}
    tileLayerRef.current=createBaseLayer(L,mapMode).addTo(map);
    tileModeRef.current=mapMode;
  },[mapMode,mapReady]);

  useEffect(()=>{
    if(!mapReady||!mapRef.current||!officeLayerRef.current||!window.L)return;
    const L=window.L;
    officeLayerRef.current.clearLayers();
    officeMarkerRef.current={};
    officeLocations.forEach((office:OfficeLocation)=>{
      const marker=L.marker([office.latitude,office.longitude],{icon:officeIcon(L),zIndexOffset:1000});
      marker.bindTooltip(`${office.shortName} · LAND VIEW Office`,{direction:"top",offset:[0,-7]});
      marker.on("click",()=>{setSelectedId("");setSelectedOfficeId(office.id);});
      marker.addTo(officeLayerRef.current);
      officeMarkerRef.current[office.id]=marker;
    });
  },[mapReady]);

  useEffect(()=>{
    if(!mapReady||!mapRef.current||!layerRef.current||!window.L)return;
    const L=window.L;
    const map=mapRef.current;
    layerRef.current.clearLayers();
    markerRef.current={};
    const bounds:any[]=[];
    filtered.forEach(p=>{
      const lat=Number(p.mapLatitude),lng=Number(p.mapLongitude);
      bounds.push([lat,lng]);
      const marker=L.circleMarker([lat,lng],{radius:9,color:"#fff",weight:2,fillColor:"#d61f26",fillOpacity:.95});
      marker.bindTooltip(`${text(p.projectId)} · ${text(p.title)||"LAND VIEW Project"}`,{direction:"top",offset:[0,-8]});
      marker.on("click",()=>{setSelectedOfficeId("");setSelectedId(text(p.projectId));});
      marker.addTo(layerRef.current);
      markerRef.current[text(p.projectId)]=marker;
    });
    if(!selectedId&&!selectedOfficeId){
      if(bounds.length===1)map.setView(bounds[0],14,{animate:true});
      else if(bounds.length>1)map.fitBounds(bounds,{padding:[45,45],maxZoom:13});
      else if(officeLocations.length===1)map.setView([officeLocations[0].latitude,officeLocations[0].longitude],13,{animate:true});
      else if(officeLocations.length>1)map.fitBounds(officeLocations.map(office=>[office.latitude,office.longitude]),{padding:[45,45],maxZoom:13});
      else map.setView(DEFAULT_CENTER,8);
    }
    setTimeout(()=>map.invalidateSize(),40);
  },[filtered,mapReady,selectedId,selectedOfficeId]);

  useEffect(()=>{
    if(!selected||!mapReady||!mapRef.current)return;
    const lat=Number(selected.mapLatitude),lng=Number(selected.mapLongitude);
    if(!Number.isFinite(lat)||!Number.isFinite(lng))return;
    const zoom=Math.max(Number(mapRef.current.getZoom?.()||0),15);
    mapRef.current.setView([lat,lng],zoom,{animate:true});
    markerRef.current[text(selected.projectId)]?.openTooltip?.();
  },[selected,mapReady]);

  useEffect(()=>{
    if(!selectedOffice||!mapReady||!mapRef.current)return;
    const zoom=Math.max(Number(mapRef.current.getZoom?.()||0),16);
    mapRef.current.setView([selectedOffice.latitude,selectedOffice.longitude],zoom,{animate:true});
    officeMarkerRef.current[selectedOffice.id]?.openTooltip?.();
  },[selectedOffice,mapReady]);

  useEffect(()=>{if(selectedId&&!filtered.some(p=>text(p.projectId)===selectedId))setSelectedId("");},[filtered,selectedId]);

  function resetFilters(){setQuery("");setDivision("All");setDistrict("All");setUpazila("All");setLocalBody("All");setWard("All");setCategory("All");setStage("All");setSelectedId("");setSelectedOfficeId("");}
  function selectDivision(value:string){setDivision(value);setDistrict("All");setUpazila("All");setLocalBody("All");setWard("All");setSelectedId("");}
  function selectDistrict(value:string){setDistrict(value);setUpazila("All");setLocalBody("All");setWard("All");setSelectedId("");}
  function selectUpazila(value:string){setUpazila(value);setLocalBody("All");setWard("All");setSelectedId("");}
  function selectLocal(value:string){setLocalBody(value);setWard("All");setSelectedId("");}
  function selectOffice(id:string){setSelectedId("");setSelectedOfficeId(id);}
  function selectProject(id:string){setSelectedOfficeId("");setSelectedId(id);}

  return <main className="public-site project-map-page">
    <style dangerouslySetInnerHTML={{__html:css}}/>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
    <Script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" strategy="afterInteractive" onLoad={()=>setScriptReady(true)}/>
    <PublicHeader/>

    <section className="project-map-hero"><div className="project-map-wrap project-map-hero-grid"><div><span className="project-map-kicker">LAND VIEW PROJECT & OFFICE DIRECTORY</span><h1>Explore our work by location.</h1><p>Search LAND VIEW projects across Bangladesh and locate our offices on the same interactive map. Office markers remain available independently of project filters, and you can switch between street and satellite imagery at any time.</p></div><div className="project-map-stats"><div className="project-map-stat"><strong>{mappedProjects.length}</strong><span>Mapped projects</span></div><div className="project-map-stat"><strong>{officeLocations.length}</strong><span>Office locations</span></div><div className="project-map-stat"><strong>{completedCount}</strong><span>Completed</span></div><div className="project-map-stat"><strong>{filtered.length}</strong><span>Current results</span></div></div></div></section>

    <section className="project-map-toolbar"><div className="project-map-wrap"><div className="project-map-controls"><input className="project-map-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search File ID, project, area or address…"/><select className="project-map-select" value={division} onChange={e=>selectDivision(e.target.value)}>{divisions.map(v=><option key={v} value={v}>{v==="All"?"All divisions":v}</option>)}</select><select className="project-map-select" value={district} onChange={e=>selectDistrict(e.target.value)} disabled={districts.length<=1}>{districts.map(v=><option key={v} value={v}>{v==="All"?"All districts / zila":v}</option>)}</select><select className="project-map-select" value={upazila} onChange={e=>selectUpazila(e.target.value)} disabled={upazilas.length<=1}>{upazilas.map(v=><option key={v} value={v}>{v==="All"?"All upazila / thana":v}</option>)}</select><select className="project-map-select" value={localBody} onChange={e=>selectLocal(e.target.value)} disabled={localBodies.length<=1}>{localBodies.map(v=><option key={v} value={v}>{v==="All"?"All union / municipality":v}</option>)}</select></div><div className="project-map-controls second"><select className="project-map-select" value={ward} onChange={e=>{setWard(e.target.value);setSelectedId("");}} disabled={wards.length<=1}>{wards.map(v=><option key={v} value={v}>{v==="All"?"All wards":`Ward ${v}`}</option>)}</select><select className="project-map-select" value={category} onChange={e=>{setCategory(e.target.value);setSelectedId("");}}>{categories.map(v=><option key={v} value={v}>{v==="All"?"All project types":v}</option>)}</select><select className="project-map-select" value={stage} onChange={e=>{setStage(e.target.value);setSelectedId("");}}>{stages.map(v=><option key={v} value={v}>{v==="All"?"All stages":v}</option>)}</select><select className="project-map-select" value="" disabled><option>Bangladesh</option></select><button className="project-map-reset" type="button" onClick={resetFilters}>Reset filters</button></div></div></section>

    <section className="project-map-main"><div className="project-map-wrap"><div className="project-map-shell"><div className="project-map-canvas-wrap">
      <div ref={mapNode} className="project-map-canvas"/>
      {!mapReady&&!mapError&&<div className="project-map-loading">Loading interactive map…</div>}
      {mapError&&<div className="project-map-error">{mapError}</div>}
      {mapReady&&<><div className="project-map-style-switch" aria-label="Map view"><button type="button" className={mapMode==="map"?"active":""} onClick={()=>setMapMode("map")}>Map</button><button type="button" className={mapMode==="satellite"?"active":""} onClick={()=>setMapMode("satellite")}>Satellite</button></div><div className="project-map-legend"><span><i className="project-map-legend-project"/>Projects</span><span><i className="project-map-legend-office">⌂</i>LAND VIEW Offices</span></div></>}

      {selected&&<div className="project-map-detail"><div className="project-map-detail-top"><div><small>{text(selected.projectId)}</small><h2>{text(selected.title)||"LAND VIEW Project"}</h2></div><button type="button" className="project-map-detail-close" onClick={()=>setSelectedId("")}>×</button></div><p>{locationLine(selected)}</p><div className="project-map-detail-meta">{selected.category&&<span>{selected.category}</span>}{selected.currentStage&&<span>{selected.currentStage}</span>}{selected.area&&<span>{selected.area}</span>}{selected.stories&&<span>{selected.stories} stories</span>}</div><div className="project-map-detail-actions"><Link href={`/projects/${encodeURIComponent(text(selected.projectId))}`}>View project</Link></div></div>}

      {selectedOffice&&<div className="project-map-detail office"><div className="project-map-detail-top"><div><small>LAND VIEW OFFICE · {selectedOffice.shortName.toUpperCase()}</small><h2>{selectedOffice.name}</h2></div><button type="button" className="project-map-detail-close" onClick={()=>setSelectedOfficeId("")}>×</button></div><p>{selectedOffice.address}</p><div className="project-map-detail-meta"><span>Engineering {selectedOffice.engineeringPhone}</span><span>Architecture {selectedOffice.architecturePhone}</span></div><div className="project-map-detail-actions"><a href={selectedOffice.mapUrl} target="_blank" rel="noopener noreferrer">Get directions</a><a className="secondary" href={`tel:${officePhone(selectedOffice.engineeringPhone)}`}>Call office</a></div></div>}
    </div>

    <aside className="project-map-side"><div className="project-map-side-head"><strong>{filtered.length} project{filtered.length===1?"":"s"} · {officeLocations.length} office{officeLocations.length===1?"":"s"}</strong><span>Select a project or LAND VIEW office to center it on the map. The project list remains independently scrollable.</span></div><div className="project-map-offices"><span className="project-map-offices-label">LAND VIEW Offices</span>{officeLocations.map(office=><button type="button" key={office.id} className={`project-map-office-card ${selectedOfficeId===office.id?"active":""}`} onClick={()=>selectOffice(office.id)}><span className="project-map-office-card-icon">⌂</span><span><strong>{office.shortName}</strong><p>{office.address}</p></span></button>)}</div><div className="project-map-list">{filtered.length?filtered.map(p=>{const id=text(p.projectId);const thumb=imageUrl(p.coverImageUrl);return <button type="button" key={id} className={`project-map-card ${selectedId===id?"active":""}`} onClick={()=>selectProject(id)}>{thumb?<img className="project-map-thumb" src={thumb} alt=""/>:<span className="project-map-thumb-fallback">LV</span>}<span><span className="project-map-card-id">{id}</span><h3>{text(p.title)||"LAND VIEW Project"}</h3><p>{locationLine(p)}</p><span className="project-map-card-meta">{p.category&&<span>{p.category}</span>}{p.currentStage&&<span>{p.currentStage}</span>}{p.wardNo&&<span>Ward {p.wardNo}</span>}</span></span></button>;}):<div className="project-map-empty">No mapped projects match these filters. LAND VIEW office locations remain available above.</div>}</div></aside>
    </div></div></section>
  </main>;
}
