const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = path => fs.readFileSync(path, "utf8");

test("website editor routes keep manager read-only and enforce website.manage on writes", () => {
  const cases = [
    ["app/api/admin/website-curation/route.ts", ["PATCH"]],
    ["app/api/admin/website-content/route.ts", ["PUT"]],
    ["app/api/admin/website-testimonials/route.ts", ["POST","PATCH","DELETE"]],
  ];
  for (const [path, methods] of cases) {
    const src = read(path);
    assert.match(src, /import \{ hasCapability \} from "@\/lib\/permissions"/);
    assert.match(src, /if \(write && !hasCapability\(user, "website\.manage"\)\)/);
    const get = src.split("export async function GET")[1].split("export async function ")[0];
    assert.match(get, /manager\(request\)/, path + " must preserve manager read");
    for (const method of methods) {
      const segment = src.split("export async function " + method)[1]?.split("export async function ")[0] || "";
      assert.match(segment, /manager\(request, true\)/, path + " " + method + " must guard writes");
      assert.match(segment, /sameOrigin\(request\)/, path + " " + method + " must check request origin");
    }
  }
});

test("role-change API rejects foreign origins even on other Vercel deployments", () => {
  const src = read("app/api/admin/user-role/route.ts");
  assert.match(src, /new URL\(origin\)\.host === request\.nextUrl\.host/);
  assert.doesNotMatch(src, /host\.endsWith\("\.vercel\.app"\)/);
  assert.match(src, /roleOf\(actor\) !== "admin"/);
  assert.match(src, /if \(!originAllowed\(request\)\)/);
});
