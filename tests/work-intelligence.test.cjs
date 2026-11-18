const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),ts=require("typescript");
const mod={exports:{}};new Function("exports","module",ts.transpileModule(fs.readFileSync(path.join(__dirname,"..","lib","work-intelligence.ts"),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(mod.exports,mod);
const {buildIntelligence,weeklyCsv}=mod.exports;
const now=Date.parse("2026-11-19T06:00:00+06:00");
const base={todoCode:"TODO-A",title:"Test work",status:"In Progress",priority:"Normal",assignedEmployeeId:"1",projectCode:"LV-001",dueDate:"2026-11-19"};
function make(items,extra={}){return {items,employees:[{id:"1",code:"EMP-1",name:"=unsafe()",status:"Active"}],totalTasks:items.length,truncated:false,refreshedAt:new Date(now).toISOString(),...extra};}
test("capacity separates actionable, waiting, blocked, delivery and unknown effort",()=>{
 const r=buildIntelligence(make([{...base,estimatedMinutes:3000},{...base,todoCode:"B",reviewState:"submitted",estimatedMinutes:800},{...base,todoCode:"C",dependencyBlocker:"blocked",estimatedMinutes:300},{...base,todoCode:"D",deliveryStep:true,estimatedMinutes:120},{...base,todoCode:"E"}]),now,40);
 assert.equal(r.workload[0].knownMinutes,3000);assert.equal(r.workload[0].unknown,1);assert.equal(r.workload[0].overMinutes,600);assert.equal(r.metrics.review,1);assert.equal(r.metrics.blocked,1);assert.equal(r.metrics.overCapacity,1);
});
test("Dhaka week, missing active owner and deduplicated project risk",()=>{
 const r=buildIntelligence(make([{...base,dueDate:"2026-11-15",dependencyBlocker:"blocked",assignedEmployeeId:"inactive"},{...base,todoCode:"B",status:"Done",createdAt:"2026-11-12T00:00:00+06:00",completedAt:"2026-11-18T23:59:00+06:00",dueDate:"2026-11-18"}]),now,40);
 assert.equal(r.week.from,"2026-11-12");assert.equal(r.week.to,"2026-11-18");assert.equal(r.week.completed,1);assert.equal(r.week.onTime,1);assert.equal(r.metrics.unassigned,1);assert.equal(r.metrics.critical,1);assert.equal(r.bottlenecks[0].risk,1);
});
test("export escapes formula strings and reports partial coverage",()=>{
 const output=weeklyCsv(buildIntelligence(make([base],{truncated:true}),now,40));assert.match(output,/"'=unsafe\(\)"/);assert.match(output,/"Partial"/);
});
