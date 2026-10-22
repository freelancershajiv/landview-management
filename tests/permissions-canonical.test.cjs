const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function loadPermissions() {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync('lib/permissions.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, require });
  return exports;
}

const permissions = loadPermissions();

test('management keeps operational access but not protected municipality history', () => {
  assert.equal(permissions.hasCapability('manager', 'systemHealth.view'), true);
  assert.equal(permissions.hasCapability('manager', 'workflow.assign'), true);
  assert.equal(permissions.hasCapability('manager', 'municipalityAccounts.expenseAdd'), true);
  assert.equal(permissions.hasCapability('manager', 'municipalityAccounts.edit'), false);
  assert.equal(permissions.hasCapability('manager', 'municipalityAccounts.transfer'), false);
  assert.equal(permissions.hasCapability('manager', 'accounts.createEntry'), false);
});

test('employees can progress assigned work and submit own expenses without management finance access', () => {
  assert.equal(permissions.hasCapability('employee', 'workflow.edit'), true);
  assert.equal(permissions.hasCapability('employee', 'siteVisits.create'), true);
  assert.equal(permissions.hasCapability('employee', 'expenses.submit'), true);
  assert.equal(permissions.hasCapability('employee', 'expenses.viewAll'), false);
  assert.equal(permissions.hasCapability('employee', 'billing.view'), false);
  assert.equal(permissions.hasCapability('employee', 'certificates.view'), false);
});

test('legacy Access Control keys resolve through the canonical capability map', () => {
  assert.equal(permissions.capabilityForLegacyPermission('project_management.edit'), 'projectManagement.edit');
  assert.equal(permissions.capabilityForLegacyPermission('municipality.edit'), 'municipalityAccounts.edit');
  assert.equal(permissions.capabilityForLegacyPermission('expenses.submit'), 'expenses.submit');
  assert.equal(permissions.hasLegacyPermission('manager', 'municipality.edit'), false);
  assert.equal(permissions.hasLegacyPermission('manager', 'municipality.expense_add'), true);
  assert.equal(permissions.hasLegacyPermission('employee', 'workflow.edit'), true);
});
