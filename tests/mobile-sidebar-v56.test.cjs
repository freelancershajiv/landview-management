const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = (path) => fs.readFileSync(path, "utf8");

const admin = read("components/management-shell-v5.tsx");
const adminMobile = read("app/admin/admin-mobile-v5.css");
const role = read("components/role-portal-shell.tsx");

test("Management uses a compact mobile drawer header, a real close button and no duplicate branding", () => {
  assert.match(admin, /className="lv-mobile-drawer-head"/);
  assert.match(admin, /ref=\{drawerCloseRef\}/);
  assert.match(admin, /aria-label="Close management navigation"/);
  assert.match(adminMobile, /\.primary-nav \.sidebar-brand \{\s*display:none !important/);
  assert.match(adminMobile, /\.primary-nav \.sidebar-footer \{\s*display:none !important/);
});

test("Management navigation and account controls share one scroll container", () => {
  const scrollStart = admin.indexOf('<div className="primary-nav-inner">');
  const account = admin.indexOf('<div className="admin-mobile-account">', scrollStart);
  const footer = admin.indexOf('<div className="sidebar-footer">', account);
  assert.ok(scrollStart > 0 && account > scrollStart && footer > account);
  assert.match(admin, /<details className="lv-mobile-drawer-account">/);
  assert.match(admin, /<summary><span>Account & security<\/span>/);
  assert.match(admin, /className="lv-mobile-drawer-account-actions"/);
  assert.match(adminMobile, /\.primary-nav \.primary-nav-inner,[\s\S]*?overflow-y:auto !important/);
  assert.match(adminMobile, /\.primary-nav \.admin-mobile-account \{[\s\S]*?max-height:none !important;overflow:visible !important/);
  // All privileged controls must still exist behind the expandable section.
  for (const value of ["My Account", "Switch to EMP-0002 workspace", "Trust this device", "PIN lock", "Sign out"])
    assert.ok(admin.includes(value), "Security action missing: " + value);
});

test("Management mobile width is consistent across widths and desktop stays unchanged", () => {
  assert.match(adminMobile, /V5\.6: one quiet Management drawer/);
  assert.match(adminMobile, /width:min\(86vw,320px\) !important/);
  assert.match(adminMobile, /@media screen and \(max-width:520px\)/);
  assert.match(adminMobile, /width:min\(88vw,320px\) !important/);
  assert.match(adminMobile, /border-radius:0 16px 16px 0 !important/);
  assert.match(adminMobile, /@media screen and \(min-width:901px\)/);
  assert.match(admin, /@media screen and \(min-width:901px\)\{[\s\S]*?\.primary-nav-inner\{position:relative/);
  assert.match(adminMobile, /@media \(prefers-reduced-motion:reduce\) and \(max-width:900px\)/);
  assert.equal(adminMobile.split("{").length, adminMobile.split("}").length, "CSS blocks unbalanced");
});

test("Management drawer traps keyboard focus and returns focus to menu when closed", () => {
  assert.match(admin, /drawerCloseRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(admin, /event\.key === "Tab"/);
  assert.match(admin, /event\.shiftKey && document\.activeElement === first/);
  assert.match(admin, /!event\.shiftKey && document\.activeElement === last/);
  assert.match(admin, /event\.key === "Escape"/);
  assert.match(admin, /menuButtonRef\.current\?\.focus\(\)/);
  assert.match(admin, /aria-controls="admin-mobile-navigation"/);
  assert.match(adminMobile, /\.lv-mobile-drawer-account>summary/);
  assert.match(adminMobile, /:focus-visible/);
});

test("Employee and Client mobile sidebars have accessible close buttons and a compact header", () => {
  for (const [name,selector] of [
    ["employee", "employee-mobile-drawer-head"],
    ["client", "lv-client-mobile-drawer-head"]
  ]) {
    assert.match(role, new RegExp('className="' + selector + '"'));
    assert.match(role, new RegExp('aria-label="Close ' + name + ' navigation"'));
  }
  assert.match(role, /const drawerCloseRef = useRef<HTMLButtonElement>\(null\)/);
  assert.match(role, /drawerCloseRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(role, /event\.key !== "Tab"/);
  assert.match(role, /items\[items\.length - 1\]\.focus\(\)/);
  assert.match(role, /function closeMobileNavigation\(\)/);
  assert.match(role, /setMobileOpen\(false\);\s*document\.querySelector<HTMLButtonElement>/);
  assert.match(role, /aria-expanded=\{mobileOpen\}/);
  assert.match(role, /desktop\.addEventListener\("change", onResize\)/);
});

test("Mobile Employee/Client drawer design is compact without changing desktop navigation", () => {
  assert.match(role, /@media screen and \(max-width:980px\)\{[\s\S]*?\.lv-client-shell \.lv-client-side,\.lv-client-shell \.lv-client-side\.open/);
  assert.match(role, /\.lv-client-shell \.lv-client-brand,\.lv-client-shell \.lv-client-foot\{display:none!important\}/);
  assert.match(role, /\.lv-client-shell \.lv-client-help a\{height:44px!important/);
  assert.match(role, /\.lv-client-shell \.lv-client-nav\{[\s\S]*?overflow-y:auto!important/);
  assert.match(role, /@media screen and \(max-width:900px\)\{[\s\S]*?\.portal-employee \.employee-sidebar\.open/);
  assert.match(role, /\.portal-employee \.employee-brand\{display:none!important\}/);
  assert.match(role, /\.portal-employee \.employee-nav\{[\s\S]*?overflow-y:auto!important/);
  assert.match(role, /\.portal-employee \.employee-sidebar-footer\{[\s\S]*?safe-area-inset-bottom/);
});

test("No payments, project permissions, or account security handlers are replaced", () => {
  for (const name of ["visibleSidebar", "canSee", "routeAllowed", "logout", "setupOrLockQuickPin", "toggleTrustedDevice", "switchToEmployeeMode"])
    assert.ok(admin.includes(name), "Admin handler missing: " + name);
  for (const name of ["goEmployeeSection", "returnToAdmin", "changePassword", "clientNav", "employeeNav"])
    assert.ok(role.includes(name), "Role handler missing: " + name);
  assert.doesNotMatch(adminMobile, /@media print/);
});
