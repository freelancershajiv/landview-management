const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = (path) => fs.readFileSync(path, "utf8");

test("camera stays blocked generally and is allowed only on fieldwork routes", () => {
  const config = read("next.config.ts");
  assert.match(config, /camera=\(\), microphone=\(\), geolocation=\(self\)/);
  assert.match(config, /camera=\(self\), microphone=\(\), geolocation=\(self\)/);
  assert.match(config, /source: "\/admin\/site-visits\/:path\*"/);
  assert.match(config, /source: "\/employee\/:path\*"/);
});

test("private HTML and sensitive APIs opt out of browser and proxy storage", () => {
  const config = read("next.config.ts");
  assert.match(config, /Cache-Control", value: "private, no-store, max-age=0"/);
  assert.match(config, /"\/api\/admin\/:path\*"/);
  assert.match(config, /"\/api\/site-visits\/:path\*"/);
  assert.match(config, /"\/api\/project-management\/:path\*"/);
  assert.match(config, /source\.startsWith\("\/api\/"\) \? privateRobotsHeaders/);
  assert.doesNotMatch(config, /"\/api\/public\/:path\*"\s*,/);
  assert.match(config, /"frame-ancestors 'none'"/);
});

test("public-only JavaScript is route split from the management application", () => {
  const layout = read("app/layout.tsx");
  const loader = read("components/route-experience-loader.tsx");
  assert.match(layout, /<RouteExperienceLoader \/>/);
  assert.match(loader, /pathname === "\/admin" \|\| pathname\.startsWith\("\/admin\/"\)/);
  assert.match(loader, /dynamic\(\(\) => import\("@\/components\/public-lead-actions"\)\)/);
  assert.match(loader, /dynamic\(\(\) => import\("@\/components\/visitor-analytics"\)\)/);
  assert.match(loader, /dynamic\(\(\) => import\("@\/components\/website-lead-notifier"\)\)/);
  assert.match(loader, /isPublic \? \(/);
  assert.match(loader, /isAdmin \? <WebsiteLeadNotifier \/>/);
});
