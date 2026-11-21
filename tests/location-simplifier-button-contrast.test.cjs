const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = path => fs.readFileSync(path,"utf8");
const simplifier=read("components/project-location-simplifier.tsx");
const quick=read("components/project-locations-quick-panel.tsx");
const layout=read("app/admin/projects/new/layout.tsx");
const bridge=read("components/project-registration-location-bridge.tsx");
const adminContract=read("app/private-control-system.css");
const extract=s=>{
  const start=s.indexOf("const css = ");
  if(start<0)return "";
  const tail=s.slice(start+13);
  const end=tail.indexOf(String.fromCharCode(96)+";");
  return tail.slice(0,end);
};
const style=extract(simplifier), quickStyle=extract(quick);

test("New Project's injected Location Simplifier is the source of the GPS button",()=>{
  assert.match(layout,/ProjectRegistrationLocationBridge mode="new"/);
  assert.match(bridge,/ProjectLocationSimplifier/);
  assert.match(bridge,/title="Location Simplifier"/);
  assert.match(simplifier,/<button className="location-simplifier-btn primary" data-lv-button="primary" type="button" onClick=\{useCurrentLocation\}/);
  assert.match(simplifier,/aria-label="Use current GPS location"/);
  assert.match(simplifier,/<span className="location-simplifier-btn-label">\{locating \? "Getting GPS…" : "Use Current GPS"\}<\/span>/);
});

test("red GPS button and nested label have white CSS text fill in both themes",()=>{
  assert.match(style,/\.location-simplifier-btn\.primary\{[^}]*color:#fff;-webkit-text-fill-color:#fff\}/);
  assert.match(style,/\.location-simplifier-btn\.primary \.location-simplifier-btn-label\{color:#fff;-webkit-text-fill-color:#fff\}/);
  assert.match(style,/\.portal-admin \.location-simplifier button\.location-simplifier-btn\.primary\[data-lv-button="primary"\]/);
  assert.match(style,/-webkit-text-fill-color:\s*#fff !important;/);
  assert.match(style,/background:\s*var\(--lv-brand-primary\) !important;/);
  assert.match(style,/background:\s*var\(--lv-brand-primary-hover\) !important;/);
  assert.match(adminContract,/\[data-lv-button="primary"\]/);
  assert.doesNotMatch(simplifier, /"⌖ Use Current"/);
});

test("Find Pin, Open in Maps, fine tune, and structured address are neutral controls",()=>{
  assert.match(simplifier,/<button className="location-simplifier-btn" data-lv-button="secondary" type="button" onClick=\{\(\) => void resolvePin\(\)\}/);
  assert.match(simplifier,/<a className="location-simplifier-btn" data-lv-button="secondary" href=\{mapHref\}/);
  assert.match(simplifier,/<button className="location-advanced-toggle" data-lv-button="secondary" type="button" aria-expanded=\{advancedOpen\}/);
  assert.match(simplifier,/<button className="location-simplifier-btn" data-lv-button="secondary" type="button" onClick=\{applyAddress\}/);
  assert.doesNotMatch(style, /\.location-simplifier-btn:not\(\.primary\).*color:#fff/);
});

test("Quick Location Save button uses the same solid-red foreground contract",()=>{
  assert.match(quick,/<button className="plq-btn" data-lv-button="primary" type="button" disabled=\{!selected \|\| saving\}/);
  assert.match(quickStyle,/\.plq-btn\{[^}]*color:#fff;-webkit-text-fill-color:#fff/);
  assert.match(quickStyle,/\.portal-admin \.plq button\.plq-btn\[data-lv-button="primary"\]/);
  assert.match(quickStyle,/-webkit-text-fill-color:\s*#fff !important;/);
});

test("location capture and resolve behavior were not changed",()=>{
  for(const keep of [
    "onClick={useCurrentLocation}","onClick={() => void resolvePin()}",
    "onClick={applyAddress}","navigator.geolocation.getCurrentPosition",
    'fetch("/api/projects/locations/resolve"', "void resolvePin(pin)",
    "onCoordinatesChange?.(String(latitude), String(longitude))"
  ]) assert.ok(simplifier.includes(keep),"Missing existing location behavior: "+keep);
  assert.doesNotMatch(style, /fetch\s*\(|@media print|alter table|create table/i);
});

function luminance(hex){
  return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255)
    .map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4)
    .reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
}
test("white GPS labels meet WCAG AA against brand solid and hover red",()=>{
  for(const bg of ["#d61f26","#ad171d"]){
    const ratio=1.05/(luminance(bg)+.05);
    assert.ok(ratio>=4.5,bg+" contrast "+ratio.toFixed(2)+":1");
  }
});
