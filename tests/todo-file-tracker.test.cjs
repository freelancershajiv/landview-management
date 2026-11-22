const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ui = fs.readFileSync("components/admin-todo-discipline-progress.tsx", "utf8");
const model = fs.readFileSync("lib/todo-file-tracker.ts", "utf8");
const endpoint = fs.readFileSync("app/api/admin/todo/dashboard/route.ts", "utf8");
const css = fs.readFileSync("components/admin-todo-discipline-progress.module.css", "utf8");

test("File tracker is read only and groups real tasks by workflow, not invented stages", () => {
  assert.match(model, /task\.workflowId\?\.trim\(\)/);
  assert.match(model, /manualService\(task\.title\)/);
  assert.match(model, /orderedSteps\(group\.tasks\)/);
  assert.match(model, /dependencyTodoCode/);
  assert.match(model, /workflowStatus:/);
  assert.match(model, /task\.status === "In Progress"/);
  assert.doesNotMatch(model, /fetch\(|insertRows\(|updateRows\(/);
});
test("Workflow status and step progress remain distinct, with no custody assumption", () => {
  assert.match(ui, /file\.workflowStatus \|\| "Not recorded"/);
  assert.match(ui, /buildFileProgress\(items\)/);
  assert.match(ui, /file\.current\.employeeName \|\| file\.current\.assignedTo/);
  assert.match(ui, /Track all \{file\.tasks\.length\} steps/);
  assert.match(ui, /stepState\(task\)/);
  assert.match(ui, /Assignment does not establish physical file custody/);
  assert.match(ui, /Final handover still requires verified payment/);
});
test("Existing API extends the payload without adding a query or changing task write semantics", () => {
  assert.match(endpoint, /dependencyTodoCode: text\(todo\.dependency_todo_code/);
  assert.match(endpoint, /workflowStage: text\(todo\.workflow_stage/);
  assert.match(endpoint, /workflowStatus: workflow \? text\(workflow\.status/);
  assert.match(endpoint, /checklist: checklist\.get/);
  assert.match(endpoint, /visibleTasks=tasks\.filter\(isProjectWorkTodo\)/);
});
test("All desktop columns retain narrow-card file step affordances", () => {
  assert.match(css, /\.fileList\{/);
  assert.match(css, /\.stepDisclosure\{/);
  assert.match(css, /\.stepButton:focus-visible/);
  assert.match(css, /\.stepCurrent \.stepButton/);
  assert.match(css, /@media\(min-width:1280px\)/);
});