const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = path => fs.readFileSync(path,"utf8");

test("homepage renders limited public data on server and caches only published data", () => {
  const page = read("app/page.tsx");
  const loader = read("lib/public-home-initial.ts");
  const home = read("components/public-home.tsx");
  assert.match(page,/await getPublicHomeInitialData\(\)/);
  assert.match(page,/<PublicHome \{\.\.\.\(snapshot \|\| \{\}\)\} \/>/);
  assert.match(loader,/unstable_cache\(/);
  assert.match(loader,/revalidate: 60/);
  assert.match(loader,/\.slice\(0, 6\)/);
  assert.match(loader,/getPublicProjectsForSeo\(\)/);
  assert.match(loader,/getPublicTeamForSeo\(\)/);
  assert.match(loader,/getWebsiteContent\(\)/);
  assert.doesNotMatch(loader,/\/api\/admin|project-management|selectRows\("invoices"/);
  assert.match(home,/if\(initialProjects&&initialTeam&&initialContent\)return/);
  assert.match(home,/summary=\{initialSummary\}/);
});

test("hero is a high priority discoverable image and lower photos lazy-load", () => {
  const home = read("components/public-home.tsx");
  const css = read("app/public-home-v2.css");
  assert.match(home,/className="ph-hero-image"[^>]+loading="eager" fetchPriority="high"/);
  assert.match(home,/className="ph-project-cover"[^>]+loading="lazy" decoding="async"/);
  assert.match(home,/alt=\{member\.name\|\|"LAND VIEW team member"\} loading="lazy"/);
  assert.match(css,/\.ph-hero-image\s*\{/);
  assert.match(css,/\.ph-project-cover\s*\{/);
});

test("obsolete public enhancer is no longer a network/DOM observer on home", () => {
  const loader = read("components/route-experience-loader.tsx");
  const layout = read("app/layout.tsx");
  assert.doesNotMatch(loader,/PublicHomeProjectEnhancer/);
  assert.match(loader,/showPrivateLoader \? <BrandLoader \/>/);
  assert.doesNotMatch(layout,/<BrandLoader \/>/);
  assert.match(layout,/<RouteExperienceLoader \/>/);
});

test("private and financial cache safeguards are unchanged", () => {
  const cfg = read("next.config.ts");
  assert.match(cfg,/Cache-Control", value: "private, no-store, max-age=0"/);
  assert.match(cfg,/camera=\(self\)/);
  assert.doesNotMatch(cfg,/Cache-Control", value: "public/);
});
