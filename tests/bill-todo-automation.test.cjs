const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root,name),"utf8");

const sql = read("supabase/migrations/20261104185500_auto_bill_service_todos.sql");
const workflow = read("app/api/admin/workflow/overview/route.ts");
const board = read("components/admin-todo-board.tsx");
const edge = read("supabase/functions/landview-data/index.ts");

test("bill issuance generates service To Dos atomically after Workflow is created", () => {
  assert.match(sql,/create trigger zz_landview_generate_todos_on_bill_issue/);
  assert.match(sql,/after insert or update of status,amount,discount,description,billing_category,category/);
  assert.match(sql,/public\.landview_bill_service_label/);
  assert.match(sql,/public\.landview_issued_service_total/);
  assert.match(sql,/public\.landview_generate_service_todos/);
  assert.match(sql,/select w\.id into v_workflow_id from public\.project_service_workflows/);
  assert.match(sql,/lower\(trim\(coalesce\(new\.status,''\)\)\) not in \('issued','unpaid','partially paid','paid','open'\)/);
});

test("idempotent keys preserve manually edited and deleted To Dos", () => {
  assert.match(sql,/create unique index if not exists todo_items_automation_key_uq/);
  assert.match(sql,/service_todo_generation_log/);
  assert.match(sql,/if exists\(select 1 from public\.service_todo_generation_log/);
  assert.match(sql,/on conflict \(automation_key\) where automation_key is not null do nothing/);
  assert.match(sql,/-- Existing manual To Dos, prior delivered services, and historical bills are preserved/);
  assert.doesNotMatch(sql,/update public\.todo_items\s+set title/i);
});

test("service-specific steps have deadlines, dependencies, and review before release", () => {
  for(const name of ["Architectural Design","Structural Design","Electrical Design","Plumbing Design","Design Books","Site Supervision","Soil Test","Digital Survey","Fire Service Approval","Municipality Approval Contract"]) {
    assert.ok(sql.includes(name), name+" is covered");
  }
  assert.match(sql,/v_start\+t\.due_in_days/);
  assert.match(sql,/dependency_todo_code/);
  assert.match(sql,/is_delivery_step/);
  assert.match(sql,/Internal design review/);
  assert.match(sql,/FINAL DELIVERY requires verified full service payment/);
});

test("dependencies and full-payment delivery are enforced at the database layer", () => {
  assert.match(sql,/todo_items_validate_bill_automation before update/);
  assert.match(sql,/if parent_status is distinct from 'Done' then/);
  assert.match(sql,/perform public\.landview_assert_service_fully_paid/);
  assert.match(sql,/if new\.is_delivery_step then/);
  assert.match(sql,/An automatically generated bill task cannot be relinked/);
  assert.match(sql,/new\.automation_source is distinct from old\.automation_source/);
});

test("default owner rules do not override manually assigned or completed tasks", () => {
  assert.match(sql,/create table if not exists public\.service_todo_assignment_rules/);
  assert.match(sql,/where t\.automation_source='Bill Issued' and t\.service_key=new\.service_key/);
  assert.match(sql,/t\.assigned_employee_id is null and t\.status<>'Done'/);
  assert.match(workflow,/setServiceTodoDefault/);
  assert.match(workflow,/Choose an active employee/);
  assert.match(board,/Automatic from issued bill/);
  assert.match(edge,/"service_todo_assignment_rules"/);
});

test("only new issued bills generate To Dos; no historical mass backfill is present", () => {
  assert.doesNotMatch(sql,/perform public\.landview_generate_service_todos\(w\.id\).*from public\.project_service_workflows/is);
  assert.match(sql,/Never reactivate closed historical projects/);
  assert.match(sql,/workflow_id,assigned_employee_id,assigned_to,created_by,automation_key,automation_source/);
});
