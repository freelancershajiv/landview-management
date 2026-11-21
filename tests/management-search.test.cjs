const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const { NextRequest } = require("next/server");

function load(file, modules = {}) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, { exports, require: (name) => modules[name] ?? require(name) });
  return exports;
}

function route(role, permissions) {
  const queried = [];
  const { GET } = load("app/api/admin/management-search/route.ts", {
    "@/lib/local-session": { roleOf: (user) => user.role, requireLocalSession: async () => role ? { role } : null },
    "@/lib/workspace-permission-access": { permissionAccess: async () => ({ all: role === "admin", permissions }) },
    "@/lib/work-task-links": load("lib/work-task-links.ts"),
    "@/lib/billing-receivable-authority": { receivableInvoiceIsActive: (row) => row.status !== "Void" },
    "@/lib/supabase-data": { selectRows: async (table) => {
      queried.push(table);
      if (table === "projects") return [{ project_code: "LV-072", client_name_snapshot: "Example Client" }];
      if (table === "proposals") return [{ proposal_code: "PROP-2026-0010" }];
      return [{ id: "inv", invoice_code: "INV-072", status: "Issued" }];
    } },
  });
  return {
    queried,
    get: (q) => GET(new NextRequest(`https://app.landview.com.bd/api/admin/management-search?q=${encodeURIComponent(q)}`)),
  };
}

test("management search returns project, proposal and filtered Invoice Center links", async () => {
  const { get } = route("admin", {});
  for (const [query, href] of [
    ["LV-72", "/admin/projects/LV-072"],
    ["example client", "/admin/projects/LV-072"],
    ["prop-2026-0010", "/admin/proposals/PROP-2026-0010"],
    ["INV-072", "/admin/billing/invoice-center?q=INV-072"],
  ]) {
    const { data } = await (await get(query)).json();
    assert.ok(data.some((hit) => hit.href === href), query);
  }
});

test("revoked access prevents record queries and employees cannot search management records", async () => {
  const manager = route("manager", { "projects.view": false, "proposals.view": true, "finance.view": false });
  await manager.get("LV-072");
  const { data } = await (await manager.get("PROP-2026-0010")).json();
  assert.deepEqual(manager.queried, ["proposals"]);
  assert.equal(data[0].kind, "Proposal");
  const employee = route("employee", {});
  assert.equal((await employee.get("LV-072")).status, 403);
  assert.deepEqual(employee.queried, []);
  assert.equal((await route(null, {}).get("LV-072")).status, 401);
});
