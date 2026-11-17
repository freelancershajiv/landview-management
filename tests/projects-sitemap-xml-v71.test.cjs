const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const source = fs.readFileSync("app/projects/sitemap.ts", "utf8");

function getEscaper() {
  // Run the exact source helper through TypeScript's compiler, avoiding
  // imports of the live database-backed sitemap inside the unit test.
  const match = source.match(/export function escapeXmlSitemapText\(value: string\): string \{[\s\S]*?\n\}/);
  assert.ok(match, "source must expose the sitemap XML text escaping helper");
  const js = ts.transpileModule(match[0], { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(js, { module, exports: module.exports });
  return module.exports.escapeXmlSitemapText;
}

test("Google Drive image URL ampersands are escaped only in sitemap XML", () => {
  const escape = getEscaper();
  const original = "https://drive.google.com/thumbnail?id=FILE_ID&sz=w1600";
  const escaped = escape(original);
  assert.equal(escaped, "https://drive.google.com/thumbnail?id=FILE_ID&amp;sz=w1600");
  assert.equal(escaped.replace(/&amp;/g, "&"), original);
  assert.doesNotMatch(escaped, /&(?!amp;|lt;|gt;|quot;|apos;)/);
});

test("sitemap XML special characters are always safely represented", () => {
  const escape = getEscaper();
  assert.equal(escape("a&b<c>d\"e'f"), "a&amp;b&lt;c&gt;d&quot;e&apos;f");
  assert.equal(escape("https://example.com/image.jpg"), "https://example.com/image.jpg");
});

test("sitemap keeps published project URLs and image indexing without sensitive APIs", () => {
  assert.match(source, /getPublicProjectsForSeo\(\)/);
  assert.match(source, /encodeURIComponent\(String\(project.projectId\)\)/);
  assert.match(source, /images: image \? \[image\] : undefined/);
  assert.match(source, /escapeXmlSitemapText\(parsed.toString\(\)\)/);
  assert.match(source, /parsed.protocol !== "https:" && parsed.protocol !== "http:"/);
  assert.doesNotMatch(source, /selectRows\("invoices"|\/api\/admin/);
});

test("main sitemap and robots references stay unchanged", () => {
  const robots = fs.readFileSync("app/robots.ts", "utf8");
  const main = fs.readFileSync("app/sitemap.ts", "utf8");
  assert.match(robots, /https:\/\/www\.landview\.com\.bd\/projects\/sitemap\.xml/);
  assert.match(main, /guides\/building-design-feni/);
});
