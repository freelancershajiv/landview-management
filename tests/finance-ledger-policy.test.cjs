const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function loadPolicy() {
  const exports = {};
  const module = { exports };
  const code = ts.transpileModule(fs.readFileSync('lib/finance-ledger-policy.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, module, require, Date, Intl, Set, Number, String });
  return module.exports;
}

const policy = loadPolicy();
const base = { transaction_code: 'TXN-2026-001', transaction_date: '2026-10-25' };

test('pending operating expense reduces current balance but is not posted to main ledger', () => {
  const row = { ...base, transaction_type: 'Expense', debit: 2500, status: 'Pending Approval' };
  assert.equal(policy.includedInCurrentBalance(row), true);
  assert.equal(policy.includedInMainLedger(row), false);
});

test('posted expense affects both current balance and posted main ledger', () => {
  const row = { ...base, transaction_type: 'Expense', debit: 2500, status: 'Posted' };
  assert.equal(policy.includedInCurrentBalance(row), true);
  assert.equal(policy.includedInMainLedger(row), true);
});

test('rejected or draft expenses do not affect available cash', () => {
  for (const status of ['Rejected', 'Returned', 'Cancelled', 'Canceled', 'Void', 'Voided', 'Draft']) {
    const row = { ...base, transaction_type: 'Expense', debit: 2500, status };
    assert.equal(policy.includedInCurrentBalance(row), false, status);
    assert.equal(policy.includedInMainLedger(row), false, status);
  }
});

test('pending income does not increase cash before it is posted', () => {
  const pending = { ...base, transaction_type: 'Income', credit: 10000, status: 'Pending' };
  const posted = { ...pending, status: 'Posted' };
  assert.equal(policy.includedInCurrentBalance(pending), false);
  assert.equal(policy.includedInMainLedger(pending), false);
  assert.equal(policy.includedInCurrentBalance(posted), true);
  assert.equal(policy.includedInMainLedger(posted), true);
});

test('municipality file pass transactions stay outside main business cash', () => {
  const row = { ...base, finance_scope: 'municipality_file_pass', transaction_type: 'Expense', debit: 5000, status: 'Posted' };
  assert.equal(policy.isMunicipalityTransaction(row), true);
  assert.equal(policy.includedInCurrentBalance(row), false);
  assert.equal(policy.includedInMainLedger(row), false);
});

test('transfers and personal transactions are excluded from main business cash', () => {
  for (const transaction_type of ['Transfer', 'Personal Income', 'Personal Expense']) {
    const row = { ...base, transaction_type, amount: 1000, direction: transaction_type === 'Personal Income' ? 'CREDIT' : 'DEBIT', status: 'Posted' };
    assert.equal(policy.includedInCurrentBalance(row), false, transaction_type);
    assert.equal(policy.includedInMainLedger(row), false, transaction_type);
  }
});

test('historical canonical ledger rows remain effective regardless of workflow status', () => {
  const row = { transaction_code: 'TXN-HIST-2026-0001', transaction_date: '2026-01-15', transaction_type: 'Expense', debit: 1000, status: 'Draft' };
  assert.equal(policy.includedInCurrentBalance(row), true);
  assert.equal(policy.includedInMainLedger(row), true);
});

test('live-period boundaries are explicit and enforced', () => {
  const before = { ...base, transaction_date: '2026-08-31', transaction_type: 'Income', credit: 1000, status: 'Posted' };
  const first = { ...before, transaction_date: policy.LEDGER_LIVE_START };
  const last = { ...before, transaction_date: policy.LEDGER_END };
  const after = { ...before, transaction_date: '2027-01-01' };
  assert.equal(policy.includedInMainLedger(before), false);
  assert.equal(policy.includedInMainLedger(first), true);
  assert.equal(policy.includedInMainLedger(last), true);
  assert.equal(policy.includedInMainLedger(after), false);
});

test('amount fallback respects transaction type and direction', () => {
  const expense = policy.financeTransactionAmounts({ transaction_type: 'Expense', amount: '2,500' });
  const income = policy.financeTransactionAmounts({ transaction_type: 'Income', amount: '3,000' });
  assert.equal(expense.debit, 2500);
  assert.equal(expense.credit, 0);
  assert.equal(expense.transactionType, 'expense');
  assert.equal(income.debit, 0);
  assert.equal(income.credit, 3000);
  assert.equal(income.transactionType, 'income');
});
