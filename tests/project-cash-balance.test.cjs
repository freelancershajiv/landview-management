const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const source = fs.readFileSync('app/api/project-management/route.ts', 'utf8');
const helpers = source.slice(source.indexOf('function isSattapur('), source.indexOf('async function projectSummaryFor('));
const code = ts.transpile(helpers, { target: ts.ScriptTarget.ES2020 });
const calculate = new Function('num', 'clean', code + ';return calculate;')(v=>Number(v||0), (v,max)=>String(v??'').trim().slice(0,max));
const row = (id, date, debit, credit, extra={}) => ({id, entry_date:date, debit, credit, ...extra});
test('available cash reconciles supplier funding, delivery and held cheques without double-counting deliveries',()=>{
  const entries=calculate([
    row('cash','2026-01-01',328366.71,0),
    row('supplier','2026-01-02',2929400,0,{paid_to:'Sattapur Brick Field'}),
    row('delivery','2026-01-03',0,2617650,{paid_to:'Sattapur Brick Field',category:'Bricks'}),
    row('hold','2026-01-04',50000,0,{category:'Cheque',memo:'CHEQUE_STATUS:ON_HOLD'}),
    row('expense','2026-01-05',0,8000),
  ]);
  assert.equal(entries.length,4);
  assert.equal(entries[1].supplier_allocation,2929400);
  assert.equal(entries[1].available_cash_balance,328366.71);
  assert.equal(entries[2].available_cash_balance,328366.71);
  assert.equal(entries.at(-1).available_cash_balance,320366.71);
  assert.equal(entries.filter(r=>r.entry_date==='2026-01-05')[0].available_cash_balance,320366.71);
});
test('cashed cheques count as cash; historic supplier exceptions remain ordinary entries',()=>{
  const entries=calculate([row('b','2025-11-23',100,0,{paid_to:'Sattapur Brick Field'}),row('a','2025-11-20',100,0,{paid_to:'Sattapur Brick Field'}),row('c','2026-01-01',50,0,{category:'Cheque',memo:'CHEQUE_STATUS:CASHED'})]);
  assert.equal(entries.at(-1).available_cash_balance,250);
  assert.ok(entries.every(r=>r.supplier_allocation===0&&r.cheque_on_hold===0));
});
test('same-day ordering is deterministic and fractional expenses retain two decimal precision',()=>{
  const entries=calculate([row('b','2026-01-01',0,.2),row('a','2026-01-01',.3,0)]);
  assert.deepEqual(entries.map(r=>r.id),['a','b']);
  assert.equal(entries.at(-1).available_cash_balance,.1);
});
