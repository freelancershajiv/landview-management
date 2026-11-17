const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const read=p=>fs.readFileSync(p,"utf8");

test("homepage has a top-level banner, main and contentinfo landmark in semantic order",()=>{
  const home=read("components/public-home.tsx");
  const start=home.indexOf('return <div className="public-home-v2">');
  assert.ok(start>0,"outer wrapper is a div, not main");
  const page=home.slice(start);
  const header=page.indexOf("<PublicHeader/>");
  const mainOpen=page.indexOf('<main id="main-content" tabIndex={-1}>');
  const mainClose=page.indexOf("</main>");
  const footer=page.indexOf("<Footer content={content}/>");
  assert.ok(header>-1 && header<mainOpen);
  assert.ok(mainOpen<header+120);
  assert.ok(mainClose>mainOpen && mainClose<footer);
  assert.match(page,/<\/main><Footer content=\{content\}\/><\/div>/);
  assert.match(home,/<footer className="ph-footer">/);
  assert.doesNotMatch(home,/return <main className="public-home-v2"><PublicHeader\/>/);
});

test("keyboard users have a visible skip link to the main content",()=>{
  const home=read("components/public-home.tsx");
  const css=read("app/public-home-v2.css");
  assert.match(home,/<a className="ph-skip-link" href="#main-content">Skip to main content<\/a>/);
  assert.match(home,/<main id="main-content" tabIndex=\{-1\}>/);
  assert.match(css,/\.ph-skip-link:focus-visible \{ transform: translateY\(0\); \}/);
});

test("primary and footer navigation landmarks have distinct accessible labels",()=>{
  const publicHeader=read("components/public-header.tsx");
  const home=read("components/public-home.tsx");
  assert.match(publicHeader,/<nav aria-label="Primary navigation" id="public-navigation"/);
  assert.match(home,/<nav className="ph-footer-links" aria-label="Footer navigation">/);
  assert.match(home,/<\/nav><div className="ph-footer-copy">/);
});

test("V6.1 image optimizations and private cache protections survive",()=>{
  const home=read("components/public-home.tsx");
  assert.match(home,/fetchPriority="high"/);
  assert.match(home,/responsivePublicImageSet/);
  const next=read("next.config.ts");
  assert.match(next,/Cache-Control", value: "private, no-store, max-age=0"/);
});