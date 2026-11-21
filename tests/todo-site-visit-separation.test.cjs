const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),ts=require("typescript");
function source(p){return fs.readFileSync(path.join(__dirname,"..",p),"utf8")}
const mod={exports:{}};new Function("exports","module",ts.transpileModule(source("lib/todo-scope.ts"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(mod.exports,mod);
const {isSiteVisitWork,isProjectWorkTodo,assertProjectWorkTitle}=mod.exports;
test("regular site visits and startup supervision are excluded, even from legacy rows",()=>{
  for(const title of ["Site Visit · LV-157","Start Site Supervision — LV-219","Resolve site issue — LV-134","Schedule site visit — LV-157","Site inspection — LV-133"]){
    assert.equal(isSiteVisitWork({title,work_area:"projects"}),true,title);
    assert.equal(isProjectWorkTodo({title}),false,title);
    assert.throws(()=>assertProjectWorkTitle(title),/Site Visits/);
  }
  assert.equal(isProjectWorkTodo({title:"Ordinary project work",work_area:"site_visits"}),false);
});
test("billed soil test and digital survey field work remain project To Dos",()=>{
  for(const title of ["Soil Test: Complete field work / inspection","Digital Survey: Schedule field work","Architectural Design: Prepare initial design","Project design review"]){
    assert.equal(isProjectWorkTodo({title,work_area:"projects"}),true,title);
    assert.doesNotThrow(()=>assertProjectWorkTitle(title));
  }
});
test("all independent To Do views, reporting, workload and actions exclude Site Visits",()=>{
  for(const filename of ["lib/todo-data.ts","app/api/admin/todo/dashboard/route.ts","lib/todo-reporting.ts","lib/todo-workload.ts","app/api/admin/todo/route.ts","app/api/admin/todo/bulk/route.ts"]){
    assert.match(source(filename),/isProjectWorkTodo/);
  }
  assert.match(source("lib/todo-data.ts"),/rows\.filter\(isProjectWorkTodo\)/);
  assert.match(source("lib/todo-workload.ts"),/if\(!isProjectWorkTodo\(todo\)\|\|/);
});
test("site visit automation has no candidate generator and active service startup skips supervision",()=>{
  const s=source("lib/todo-automation.ts");
  assert.doesNotMatch(s,/enabled\.get\("site_issue"\)/);
  assert.doesNotMatch(s,/fetch\("site_visits"/);
  assert.match(s,/supervision\|visits\?/);
  assert.match(s,/rule_key!=="site_issue"/);
});
test("schema migration is non-destructive and reclassifies only the three confirmed old To Dos",()=>{
  const s=source("supabase/release/todo-site-visits-separation.sql");
  for(const id of ["TODO-EBEEC91244","TODO-C97A96C6E4","TODO-46606DD1B3"])assert.ok(s.includes(id));
  assert.match(s,/work_area/);assert.match(s,/rule_key='site_issue'/);
  assert.doesNotMatch(s,/\bdelete\s+from\s+(?:public\.)?todo_items/i);
});
