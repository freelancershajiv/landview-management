const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = path => fs.readFileSync(path, "utf8");

test("project creation and reclassification protect writes with a session, management role and origin", () => {
  for (const path of ["app/api/projects/new/route.ts","app/api/projects/reclassify/route.ts","app/api/projects/locations/route.ts"]) {
    const src = read(path);
    assert.match(src,/requireLocalSession\(request\)/, path);
    assert.match(src,/MANAGE_ROLES\.has\(roleOf\(user\)\)/,path);
    const post = src.split("export async function POST")[1] || "";
    assert.match(post,/sameOrigin\(request\)/,path);
    assert.match(post,/MANAGE_ROLES\.has\(roleOf\(user\)\)/,path);
  }
});

test("employee location and workspace endpoints reject other roles", () => {
  const workspace = read("app/api/employee-workspace/route.ts");
  assert.match(workspace,/requireLocalSession\(request\)/);
  assert.match(workspace,/roleOf\(user\)!=="employee"/);
  const location = read("app/api/employee/location-check/route.ts");
  assert.match(location,/roleOf\(user\) !== "employee"/);
  assert.match(location,/if \(!sameOrigin\(request\)\)/);
  const manager = read("app/api/admin/employee-location-check/route.ts");
  assert.match(manager,/MANAGE_ROLES\.has\(roleOf\(user\)\)/);
  assert.match(manager,/if \(!sameOrigin\(request\)\)/);
});

test("site-visit media processing is admin capability-gated, not merely UI-hidden", () => {
  const src=read("app/api/admin/site-visits/media-queue/route.ts");
  assert.match(src,/requireApiCapability\(request, "siteVisits\.media\.view"\)/);
  assert.match(src,/requireApiCapability\(request, "siteVisits\.media\.process"\)/);
  assert.match(src,/requireApiCapability\(request, "siteVisits\.media\.retry"\)/);
  assert.match(src,/if \(!validOrigin\(request\)\)/);
});

test("project reference image mutations require management roles and same-origin", () => {
  const src=read("app/api/admin/project-reference-images/route.ts");
  assert.match(src,/requireLocalSession\(request\)/);
  assert.match(src,/\["admin","manager"\]\.includes\(role\)/);
  for(const method of ["POST","DELETE"]){
    const handler=src.split("export async function "+method)[1]?.split("export async function ")[0]||"";
    assert.match(handler,/sameOrigin\(request\)/,method);
    assert.match(handler,/actor\(request,true\)/,method);
  }
});

test("employee WhatsApp control resolves employee identity from authenticated session", () => {
  const src=read("app/api/employee-whatsapp/route.ts");
  assert.match(src,/readSignedWorkspaceUser\(/);
  assert.match(src,/if \(!user\) user = await requireLocalSession\(request\)/);
  assert.match(src,/role !== "employee" && role !== "manager"/);
  assert.match(src,/employeeId \}/);
  const post=src.split("export async function POST")[1]||"";
  assert.match(post,/sameOrigin\(request\)/);
  assert.match(post,/await currentEmployee\(request\)/);
  assert.doesNotMatch(post,/body\?\.employeeId/);
});
