const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = (path) => fs.readFileSync(path, "utf8");
const palette = read("app/private-theme.css");
const projects = read("app/admin/projects/page.tsx");
const project = read("app/admin/projects/[projectId]/page.tsx");
const layout = read("app/admin/projects/layout.tsx");
const locations = read("app/admin/projects/locations/page.tsx");
const newProject = read("app/admin/projects/new/page.tsx");
const legacy = read("app/admin/projects/legacy/page.tsx");
const missing = read("app/admin/projects/missing-serials/page.tsx");
const context = read("components/project-context-bar.tsx");
const projectStyles = palette.slice(palette.indexOf("/* Projects / Project Register: explicit control-background"));

test("selected project-list filter uses solid-red semantics instead of red text for a soft tab", () => {
  assert.match(projects, /data-lv-button=\{stageFilter===item\?"primary":"secondary"\}/);
  assert.doesNotMatch(projects, /data-lv-button=\{stageFilter===item\?"tab-active"/);
  assert.match(projects, /className="project-id project-id-link" data-lv-button="primary"/);
  assert.match(projects, /className="wa-check" data-lv-button="secondary"/);
  assert.match(projects, /className="team-button" data-lv-button="secondary"/);
});

test("project-detail tabs distinguish selected red, neutral references, and edit/save actions", () => {
  assert.match(project, /className="pc-tab-link" data-lv-button="secondary"/);
  assert.match(project, /data-lv-button=\{tab===key\?"primary":"secondary"\}/);
  assert.equal((project.match(/className="btn btn-dark" data-lv-button="primary"/g)||[]).length,2);
  assert.match(project, /className="btn pc-danger" data-lv-button="danger"/);
  assert.match(project, /className="btn btn-small" data-lv-button="secondary"/);
  assert.match(project, /data-lv-button="secondary" disabled=\{!selected\|\|uploadingFolder===folderName\}/);
  assert.match(context, /className="pcb-btn primary" data-lv-button="primary"/);
  assert.match(layout, /className="projects-section-link primary" data-lv-button="primary"/);
});

test("other project-list pages use the same contrast-safe primary semantics", () => {
  assert.match(locations, /className="pl-btn primary" data-lv-button="primary"/);
  assert.match(locations, /data-lv-button=\{view==="pending"\?"primary":"secondary"\}/);
  assert.match(locations, /data-lv-button=\{view==="completed"\?"primary":"secondary"\}/);
  assert.match(locations, /className="pl-map-btn" data-lv-button="secondary"/);
  assert.match(newProject, /className="new-project-btn primary submit" data-lv-button="primary"/);
  assert.match(newProject, /className="new-project-btn primary" data-lv-button="primary"/);
  assert.match(legacy, /className="legacy-btn primary submit" data-lv-button="primary"/);
  assert.match(missing, /className="missing-btn primary" data-lv-button="primary"/);
});

test("Projects shared CSS contains coupled red/background/white text-fill rules", () => {
  assert.ok(projectStyles.startsWith("/* Projects / Project Register:"));
  for(const selector of [
    ".filter-btn.active", ".project-id.project-id-link", ".projects-section-link.primary",
    ".btn.btn-dark", ".pc-tabs button.active", ".project-workspace-switcher a.active",
    ".pl-tab.active", ".pl-btn.primary", ".legacy-btn.primary",
    ".new-project-btn.primary", ".missing-btn.primary", ".pcb-btn.primary"
  ]) assert.ok(projectStyles.includes(selector),"Missing project control "+selector);
  assert.match(projectStyles, /background:\s*var\(--lv-brand-primary\)\s*!important/);
  assert.match(projectStyles, /color:\s*#fff\s*!important/);
  assert.match(projectStyles, /-webkit-text-fill-color:\s*#fff\s*!important/);
  assert.match(projectStyles, /\.pc-tabs \.pc-tab-link\[data-lv-button="secondary"\]/);
  assert.match(projectStyles, /\.service-upload button\[data-lv-button="secondary"\]/);
  assert.match(projectStyles, /\.pl-map-btn\[data-lv-button="secondary"\]/);
  assert.match(projectStyles, /\.new-project-page \.id-mode b/);
  assert.match(projectStyles, /\.projects-register :is\(\.wa-toggle\.off/);
});

test("old switcher typography no longer overrides text inside selected red project link", () => {
  assert.doesNotMatch(palette, /\.portal-admin \.project-workspace-switcher :is\(strong,span\)/);
  assert.match(palette, /\.portal-admin \.project-workspace-switcher \.project-workspace-switcher-copy :is\(strong,span\)/);
  assert.match(projectStyles, /\.project-workspace-switcher a\.active :is\(span,strong,b,small,i,svg\)/);
  assert.match(projectStyles, /\.projects-register a\.project-id\.project-id-link\[data-lv-button="primary"\]/);
  assert.doesNotMatch(projectStyles, /\.reference-link.*\{\s*color:\s*#fff/);
});

test("brand solid red and hover remain WCAG AA with white labels", () => {
  const hex = ["#d61f26","#ad171d"];
  const lum = value => [1,3,5].map(i => parseInt(value.slice(i,i+2),16)/255).map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4).reduce((v,x,i)=>v+x*[.2126,.7152,.0722][i],0);
  for(const bg of hex) assert.ok(1.05/(lum(bg)+.05)>=4.5, "white-on-red contrast failed: "+bg);
});
