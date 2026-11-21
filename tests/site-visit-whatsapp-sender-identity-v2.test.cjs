const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = p => fs.readFileSync(p,"utf8");

test("management Site Visits require a selected active employee before media and posting", () => {
  const src = read("app/api/admin/site-visits/route.ts");
  assert.match(src, /if \(!issueEmployeeCode\) return deny\("Select the employee whose WhatsApp account/);
  assert.match(src, /employee_code: issueEmployeeCode, status: "Active"/);
  assert.match(src, /const senderEmployeeCode = attributedEmployeeCode;/);
  assert.doesNotMatch(src, /attributedEmployeeCode \|\| "EMP-0002"/);
  assert.ok(src.indexOf("if (!issueEmployeeCode)") < src.indexOf("const stored: StoredPhoto[]"),"Validate sender before uploading media");
});

test("Site Visit retry cannot silently impersonate the default employee", () => {
  const src = read("app/api/site-visits/retry-whatsapp/route.ts");
  assert.match(src, /const senderEmployee = attributedEmployee;/);
  assert.match(src, /no fallback sender will be used/);
  assert.doesNotMatch(src, /employee_code: "EMP-0002"/);
  assert.match(src, /You can retry only your own Site Visit WhatsApp updates/);
  assert.match(src, /if \(!internal && !sameOrigin\(request\)\)/);
});

test("shared WhatsApp publisher blocks unassigned or mismatched sender identity", () => {
  const src = read("lib/whatsapp-site-visits.ts");
  assert.match(src, /if \(!assignedEmployeeId \|\| !requestedSenderId\)/);
  assert.match(src, /if \(assignedEmployeeId !== requestedSenderId\)/);
  assert.match(src, /Employee WhatsApp sender identity is missing|Site Visit WhatsApp sender identity is missing/);
  assert.match(src, /sendFromEmployeeWhatsApp\(token, groupInviteCode, payload\)/);
});
