const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

const read = path => fs.readFileSync(path, "utf8");

function photoHarness(blobSizes = [800_000]) {
  let rounds = 0;
  let revocations = 0;
  class FakeFile {
    constructor(parts, name, options) {
      this.name = name;
      this.type = options.type;
      this.size = parts.reduce((sum, blob) => sum + blob.size, 0);
    }
  }
  class FakeImage {
    naturalWidth = 1600;
    naturalHeight = 1200;
    set src(_url) { this.onload(); }
  }
  const sandbox = {
    exports: {}, module: { exports: {} },
    navigator: { onLine: true },
    URL: {
      createObjectURL: () => "blob:photo",
      revokeObjectURL: () => { revocations += 1; },
    },
    Image: FakeImage,
    File: FakeFile,
    document: {
      createElement: kind => {
        assert.equal(kind, "canvas");
        return {
          width: 0,
          height: 0,
          getContext: () => ({
            fillStyle: "",
            fillRect() {},
            drawImage() {},
          }),
          toBlob: (callback, mime) => {
            const size = blobSizes[Math.min(rounds, blobSizes.length - 1)];
            rounds += 1;
            callback({ size, type: mime });
          },
        };
      },
    },
  };
  sandbox.exports = sandbox.module.exports;
  const js = ts.transpileModule(read("lib/site-visit-photo-preparation.ts"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(js, sandbox, { filename: "site-visit-photo-preparation.js" });
  return {
    ...sandbox.module.exports,
    sandbox,
    get rounds() { return rounds; },
    get revocations() { return revocations; },
  };
}

test("site and problem photos use a single shared browser compression module", () => {
  const admin = read("components/admin-site-visit-entry.tsx");
  const employee = read("components/employee-site-visit-center.tsx");
  for (const component of [admin, employee]) {
    assert.match(component, /prepareSiteVisitPhoto/);
    assert.match(component, /siteVisitNetworkError/);
    assert.doesNotMatch(component, /function compressImage\(/);
    assert.match(component, /submittingRef\.current = true/);
    assert.match(component, /submittingRef\.current = false/);
    assert.match(component, /aria-busy=\{saving\}/);
    assert.match(component, /uploadStage &&/);
    assert.match(component, /aria-live="polite"/);
    assert.match(component, /window\.addEventListener\("offline"/);
    assert.match(component, /navigator\.onLine === false/);
  }
});

test("untrusted non-photo formats are not accepted", () => {
  const helper = photoHarness();
  assert.equal(helper.isSiteVisitPhoto({name:"diagram.svg",type:"image/svg+xml"}), false);
  assert.equal(helper.isSiteVisitPhoto({name:"camera.heic",type:"image/heic"}), true);
  assert.equal(helper.isSiteVisitPhoto({name:"image.jpg",type:""}), true);
});

test("prepared photos are JPG under 4 MiB with object URLs always released", async () => {
  const helper = photoHarness();
  const file = await helper.prepareSiteVisitPhoto({
    name: "phone-camera.png",
    size: 5_000_000,
    type: "image/png",
  });
  assert.equal(file.name, "phone-camera.jpg");
  assert.equal(file.type, "image/jpeg");
  assert.ok(file.size <= helper.SITE_VISIT_MAX_PHOTO_BYTES);
  assert.equal(helper.rounds, 1);
  assert.equal(helper.revocations, 1);
});

test("oversized compression tries a lower quality without posting files", async () => {
  const helper = photoHarness([5_000_000, 600_000]);
  const file = await helper.prepareSiteVisitPhoto({ name: "evidence.jpg", size: 10_000_000, type: "image/jpeg" });
  assert.equal(helper.rounds, 2);
  assert.equal(helper.revocations, 1);
  assert.equal(file.size, 600_000);
});

test("mobile network failures do not cause automatic duplicate submissions", () => {
  const helper = photoHarness();
  assert.match(helper.siteVisitNetworkError(new Error("Failed to fetch"), true), /may already be saved/);
  assert.match(helper.siteVisitNetworkError(new Error("Failed to fetch"), true), /Check Recent Site Visits/);
  helper.sandbox.navigator.onLine = false;
  assert.match(helper.siteVisitNetworkError(new Error("Offline"), false), /Reconnect before submitting/);
  // Restore the simulated connection before checking a non-network response.
  helper.sandbox.navigator.onLine = true;
  assert.equal(helper.siteVisitNetworkError(new Error("Project not found."), true), "Project not found.");
  for (const name of ["components/admin-site-visit-entry.tsx", "components/employee-site-visit-center.tsx"]) {
    const content = read(name);
    assert.doesNotMatch(content, /setTimeout\([^;]*\bsubmit\(/);
    assert.match(content, /requestStarted = true;/);
  }
});

test("Employee offers separate camera/gallery and remove for each photo", () => {
  const employee = read("components/employee-site-visit-center.tsx");
  for (const id of ["visitCameraId", "visitGalleryId", "problemCameraId", "problemGalleryId"])
    assert.match(employee, new RegExp("id=\\{" + id + "\\}"));
  assert.equal((employee.match(/capture="environment"/g) || []).length, 2, "only camera inputs capture directly");
  assert.equal((employee.match(/className="sv-file-input"/g) || []).length, 4);
  assert.match(employee, /Remove site photo/);
  assert.match(employee, /Remove problem photo/);
  assert.match(employee, /disabled=\{saving \|\| offline \|\| !projectId \|\| !location\}/);
  assert.match(employee, /data-lv-button="primary"/);
  assert.match(employee, /data-lv-button="danger"/);
});

test("Admin keeps all 8 photo slots and does not auto-reload after saving", () => {
  const admin = read("components/admin-site-visit-entry.tsx");
  const history = read("components/site-visits-admin.tsx");
  const mediaQueue = read("components/site-visit-media-queue.tsx");
  assert.match(mediaQueue, /addEventListener\("landview:site-visit-created"/);
  assert.match(admin, /const MAX_TOTAL_PHOTOS = 8;/);
  assert.match(admin, /allFiles\.entries\(\)/);
  assert.match(admin, /landview:site-visit-created/);
  assert.match(history, /addEventListener\("landview:site-visit-created"/);
  assert.doesNotMatch(admin, /window\.location\.reload\(/);
  assert.match(admin, /disabled=\{saving \|\| loading \|\| offline\}/);
});

test("mobile photo controls use readable touch sizes in existing stylesheets", () => {
  const admin = read("app/admin/admin-mobile-v5.css");
  const employee = read("components/employee-site-visit-center.tsx");
  assert.match(admin, /V5\.4 Site Visit fieldwork/);
  assert.match(admin, /\.ase-photo-action \{[\s\S]*?min-height: 44px !important/);
  assert.match(employee, /\.sv-upload-choice\{[\s\S]*?min-height:44px/);
  assert.match(employee, /@media\(max-width:600px\)\{\.sv-uploads\{grid-template-columns:minmax\(0,1fr\)/);
});

test("photo preparation never stores sensitive media persistently or alters GPS and WhatsApp APIs", () => {
  const helper = read("lib/site-visit-photo-preparation.ts");
  assert.doesNotMatch(helper, /localStorage|indexedDB|sessionStorage|fetch\(/);
  const employee = read("components/employee-site-visit-center.tsx");
  assert.match(employee, /body\.append\("locationLatitude"/);
  assert.match(employee, /body\.append\("locationLongitude"/);
  assert.match(employee, /body\.append\("locationAccuracyM"/);
  assert.match(employee, /\/api\/site-visits\/retry-whatsapp/);
});
