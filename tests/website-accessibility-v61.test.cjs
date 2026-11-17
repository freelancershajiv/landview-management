const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = (path) => fs.readFileSync(path, "utf8");

function luminance(hex) {
  const c=hex.replace("#","");
  const v=[0,2,4].map(i=>parseInt(c.slice(i,i+2),16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
  return .2126*v[0]+.7152*v[1]+.0722*v[2];
}
function contrast(a,b) {
  const x=luminance(a),y=luminance(b);
  return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
test("public accent and muted text pass WCAG AA on known dark surfaces",()=>{
  const css=read("app/public-home-v2.css");
  assert.match(css,/--ph-accent-text: #ff6b71/);
  for(const color of ["#ff6b71","#a6b3bd"])
    for(const background of ["#07101a","#0b151f","#101d28","#132430"])
      assert.ok(contrast(color,background)>=4.5,"Insufficient contrast on "+background);
  assert.doesNotMatch(css,/color:#63727e/);
  assert.doesNotMatch(css,/color:#59656e/);
  assert.match(read("app/brand-palette-original.css"),/--lv-brand-primary: #d61f26/);
});

test("mobile images use responsive Drive thumbnails without changing source provider",()=>{
  const home=read("components/public-home.tsx");
  assert.match(home,/function responsivePublicImageSet\(url:string,widths:readonly number\[\]\)/);
  assert.match(home,/parsed\.hostname!=="drive\.google\.com"/);
  assert.match(home,/variant\.searchParams\.set\("sz",/);
  assert.match(home,/srcSet=\{responsivePublicImageSet\(cover,\[480,800,1200,1600\]\)\}/);
  assert.match(home,/srcSet=\{responsivePublicImageSet\(cover,\[400,640,960,1280,1600\]\)\}/);
  assert.match(home,/srcSet=\{responsivePublicImageSet\(photo,\[120,180,240,360,600\]\)\}/);
  assert.match(home,/fetchPriority="high"/);
  assert.match(home,/className="ph-project-cover"[^>]+loading="lazy"/);
});

test("location consent is a labeled nonmodal region with keyboard operation",()=>{
  const visitor=read("components/visitor-analytics.tsx");
  const css=read("components/visitor-analytics.module.css");
  assert.match(visitor,/role="region" aria-labelledby="lv-location-title" aria-describedby="lv-location-copy"/);
  assert.match(visitor,/event\.key !== "Escape"/);
  assert.match(visitor,/panel\?\.contains\(document\.activeElement\)/);
  assert.match(visitor,/aria-live="polite"/);
  assert.doesNotMatch(visitor,/aria-modal="true"/);
  assert.match(css,/min-height: 44px/);
  assert.match(css,/:focus-visible/);
});
test("cache protections from Speed V6 remain unchanged",()=>{
  assert.match(read("lib/public-home-initial.ts"),/revalidate: 60/);
  assert.match(read("next.config.ts"),/Cache-Control", value: "private, no-store, max-age=0"/);
});
