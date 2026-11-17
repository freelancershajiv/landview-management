const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = (file) => fs.readFileSync(file, "utf8");

test("Feni planning guide is indexable, self-canonical, and avoids unsupported promises", () => {
  const page=read("app/guides/building-design-feni/page.tsx");
  assert.match(page,/title: \{ absolute: "Building Design in Feni: Planning Checklist/);
  assert.match(page,/const canonical = "https:\/\/www\.landview\.com\.bd\/guides\/building-design-feni"/);
  assert.match(page,/alternates: \{ canonical \}/);
  assert.match(page,/robots: \{ index: true, follow: true \}/);
  assert.match(page,/responsible local authority/);
  assert.match(page,/Soil investigation coordination/);
  assert.match(page,/"@type": "BreadcrumbList"/);
  assert.match(page,/<PublicHeader \/>/);
  assert.match(page,/<main id="main-content"/);
  for(const service of ["architectural-design","structural-design","soil-test","plan-approval"])
    assert.ok(page.includes('href: "/services/'+service+'"'),"missing contextual link: "+service);
  assert.doesNotMatch(page,/guaranteed rank|guaranteed approval/gi);
});
test("sitemap includes canonical guide and robots protects private records", () => {
  const sitemap=read("app/sitemap.ts");
  const robots=read("app/robots.ts");
  assert.match(sitemap,/guides\/building-design-feni/);
  assert.match(robots,/https:\/\/www\.landview\.com\.bd\/sitemap\.xml/);
  assert.match(robots,/https:\/\/www\.landview\.com\.bd\/projects\/sitemap\.xml/);
  for(const privatePath of ["/admin","/client","/api","/employee"])
    assert.ok(robots.includes(privatePath));
});
test("guide is discoverable from Feni office and services", () => {
  assert.match(read("app/feni/page.tsx"),/href="\/guides\/building-design-feni"/);
  assert.match(read("app/services/page.tsx"),/href="\/guides\/building-design-feni"/);
});
test("no changes to private caching or V6.2 homepage landmarks",()=>{
  assert.match(read("components/public-home.tsx"),/Skip to main content/);
  assert.match(read("next.config.ts"),/Cache-Control", value: "private, no-store, max-age=0"/);
});
