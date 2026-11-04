const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");
const api = source("app/api/admin/workflow/overview/route.ts");
const ui = source("app/admin/project-operations/overview/page.tsx");
const nav = source("app/admin/project-operations/layout.tsx");

test("Workflow route is manager-only and keeps per-request data private", () => {
  assert.match(api, /await management\(request\)/);
  assert.match(api, /\["admin", "manager"\]/);
  assert.match(api, /Cache-Control": "private, no-store/);
  assert.match(api, /if \(!sameOrigin\(request\)\)/);
});

test("Stage progress includes live To Do and service updates without mutating To Do", () => {
  assert.match(api, /selectRows\("todo_items"/);
  assert.match(api, /selectRows\("project_service_workflows"/);
  assert.match(api, /selectRows\("tasks"/);
  assert.match(api, /selectRows\("project_lifecycle_transitions"/);
  assert.match(api, /selectRows\("app_audit_log"/);
  assert.doesNotMatch(api, /updateRows\("todo_items"/);
  assert.match(ui, /Live read-only link; To Do completion never silently advances Workflow/);
});

test("Stages preserve Design, Approval and Supervision order", () => {
  assert.match(api, /const STAGES = \["Design Stage", "Approval Stage", "Supervision \/ Construction Stage"\]/);
  assert.match(api, /return "Unstaged"/);
  assert.match(api, /function stageOfService/);
});

test("Manager task mutations enforce blockers, dependencies and audit history", () => {
  assert.match(api, /Clear the task blocker before completion/);
  assert.match(api, /Complete the required dependency before this task/);
  assert.match(api, /Dependency cycle is not permitted/);
  assert.match(api, /Dependency must be from the same project/);
  assert.match(api, /recordAuditEvent\(/);
  assert.match(api, /if \(action === "setStatus"\)/);
  assert.match(api, /else if \(action === "assign"\)/);
  assert.match(api, /else if \(action === "dependency"\)/);
});

test("Workflow links to the dedicated overview without changing the To Do interface", () => {
  assert.match(nav, /href: "\/admin\/project-operations\/overview"/);
  assert.match(source("app/admin/workflow/page.tsx"), /redirect\("\/admin\/project-operations\/overview"\)/);
  assert.match(source("app/admin/project-operations/project-workflow/page.tsx"), /redirect\("\/admin\/project-operations\/overview"\)/);
  assert.match(ui, /href="\/admin\/todo"/);
});
