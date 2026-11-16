const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = path => fs.readFileSync(path, "utf8");
const theme = read("app/private-theme.css");

test("every private portal loads the same theme as the final CSS import", () => {
  for (const role of ["admin","projectmanagement","employee","client"]) {
    const layout = read("app/" + role + "/layout.tsx");
    const imports = [...layout.matchAll(/^import\s+["']([^"']+\.css)["'];/gm)].map(m => m[1]);
    assert.equal(imports.at(-1), "../private-theme.css", role + " CSS import order");
    assert.equal(imports.filter(p => p === "../private-theme.css").length, 1);
    assert.ok(!imports.some(p => p.endsWith("/private-control-system.css")));
  }
  assert.match(theme, /^@import "\.\/private-control-system\.css";/m);
  assert.match(theme, /@media screen/);
  assert.doesNotMatch(theme, /@media print|@page|\bfetch\s*\(|localStorage/);
});

test("private theme has two palettes and opt-in shared primitives", () => {
  for (const part of [
    'html:not([data-theme="dark"])','html[data-theme="dark"]',
    '--lv-brand-primary:','--lv-brand-primary-hover:',
    '--lv-surface-panel:','--lv-control-bg:','--lv-success-solid:',
    '--lv-danger-solid:','--lv-warning-solid:',
    '.lv-ui-card','.lv-ui-heading','.lv-ui-label',
    '.lv-ui-input','.lv-ui-select','.lv-ui-textarea',
    '.lv-ui-table-wrap','.lv-ui-table','.lv-ui-badge','.lv-ui-actions',
    ':focus-visible','prefers-reduced-motion','max-width: 900px'
  ]) assert.ok(theme.includes(part), "missing " + part);
  assert.doesNotMatch(theme, /(?:^|\n)\s*\.primary\s*\{/);
});

function luminance(hex) {
  const h=hex.replace("#","");
  const s=[0,2,4].map(i => parseInt(h.slice(i,i+2),16)/255)
    .map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
  return s.reduce((a,x,i)=>a+x*[.2126,.7152,.0722][i],0);
}
function ratio(a,b) {
  const x=luminance(a),y=luminance(b);
  return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
test("private theme solid action color pairs meet WCAG AA", () => {
  for (const [name,fg,bg] of [
    ["primary","#ffffff","#d61f26"],
    ["primary hover","#ffffff","#ad171d"],
    ["success light","#ffffff","#2d7350"],
    ["success dark","#ffffff","#2f6f50"],
    ["danger light","#ffffff","#a92c33"],
    ["danger dark","#ffffff","#9c2930"],
    ["warning light","#ffffff","#755414"],
    ["warning dark","#ffffff","#6f5117"],
    ["body light","#26323e","#fbfcfd"],
    ["body dark","#dfe5e9","#11171d"]
  ]) assert.ok(ratio(fg,bg)>=4.5,name+" has insufficient contrast");
});
