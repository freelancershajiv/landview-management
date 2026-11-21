const test = require("node:test");
const assert = require("node:assert/strict");
const ts = require("typescript");
const fs = require("node:fs");
const vm = require("node:vm");
const { NextRequest } = require("next/server");

function load(file, dependencies = {}) {
  const exports = {};
  const { outputText } = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  vm.runInNewContext(outputText, { exports, URL, require: (name) => dependencies[name] ?? require(name) });
  return exports;
}

function client(projectIds) {
  const queries = [];
  const { GET } = load("app/api/client-access/route.ts", {
    "@/lib/local-session": { requireLocalSession: async () => ({ role: "client", projectIds }) },
    "@/lib/supabase-auth": {},
    "@/lib/supabase-data": {
      normalizeProjectCode: (value) => String(value ?? "").toUpperCase(),
      selectRows: async (table, options) => {
        queries.push([table, { ...options.filters }]);
        if (table === "projects") return [{ id: options.filters.project_code }];
        if (table === "client_document_register") return [{ document_name: "Land Deed", collection_status: "Pending" }];
        return [
          { id: "released", title: options.filters.project_id, service_workflow_id: "service", delivered_at: "2026-11-15", drive_file_url: "https://example.com/drawing.pdf" },
          { id: "undelivered", service_workflow_id: "service", drive_file_url: "https://example.com/unreleased.pdf" },
          { id: "invalid-url", service_workflow_id: "service", delivered_at: "2026-11-15", drive_file_url: "javascript:void(0)" },
        ];
      },
    },
    "@/lib/billing-receivable-authority": {
      loadReceivableAuthority: async ({ projectId }) => ({
        complete: true, bills: [], payments: [],
        projects: new Map([[projectId, { billed: 63000, paid: 55000, totalDue: projectId === "LV-072" ? 0 : 8000 }]]),
      }),
    },
    "@/lib/client-document-checklist": load("lib/client-document-checklist.ts"),
  });
  return {
    queries,
    read: (id) => GET(new NextRequest(`https://app.landview.com.bd/api/client-access?mode=project-readiness&projectId=${id}`)),
  };
}

test("single-project clients cannot load a different project's checklist, balance or files", async () => {
  const session = client("LV-072");
  assert.equal((await session.read("LV-243")).status, 403);
  assert.deepEqual(session.queries, []);
  const response = await session.read("LV-072");
  const { data } = await response.json();
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(data.finance.due, 0);
  assert.deepEqual(data.deliverables.map((file) => file.id), ["released"]);
  assert.ok(data.documentActions.some(({ name, status }) => name === "Ownership Registry Paper" && status === "Pending"));
  assert.deepEqual(session.queries.find(([table]) => table === "documents")[1], {
    project_id: "LV-072", client_visible: true, workflow_status: "Delivered",
  });
});

test("multi-project clients receive balances and files scoped to each selected project", async () => {
  const session = client("LV-072;LV-243");
  const a = (await (await session.read("LV-072")).json()).data;
  const b = (await (await session.read("LV-243")).json()).data;
  assert.equal(a.finance.due, 0);
  assert.equal(b.finance.due, 8000);
  assert.equal(a.deliverables[0].title, "LV-072");
  assert.equal(b.deliverables[0].title, "LV-243");
});
