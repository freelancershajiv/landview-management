const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname,"..","lib","work-task-links.ts"),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};
new Function("exports","module",code)(mod.exports,mod);
const {workScope,workScopeFromHash,workTaskHref,workRecordHref,workItemHref}=mod.exports;
test("project identifiers normalize without fuzzy matching",()=>{
  assert.deepEqual(workScope("project","LV-72"),{type:"Project",code:"LV-072"});
  assert.equal(workScope("project","LV-72 extra"),null);
  assert.equal(workScope("project","../../admin"),null);
});
test("context URLs round-trip and preserve draft title",()=>{
  const scope=workScope("proposal","PROP-2026-0010");
  const href=workTaskHref(scope,"Follow up & confirm","Source: proposal");
  assert.deepEqual(workScopeFromHash(href.split("#")[1]),scope);
  assert.equal(new URLSearchParams(href.split("#")[1]).get("title"),"Follow up & confirm");
  assert.equal(workRecordHref(scope),"/admin/proposals/PROP-2026-0010");
  assert.equal(workItemHref("TODO-ABC"),"/admin/todo#todo=TODO-ABC");
});
