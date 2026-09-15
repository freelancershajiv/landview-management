const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
const path = require('node:path');
const file = path.resolve('lib/certificate-content.ts');
const mod = new Module(file, module);
mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText, file);
const {certificateContent} = mod.exports;

test('legacy tenure is combined once and duties remain separate', () => {
  const result = certificateContent({description:'has been serving in the capacity of Project Operation Engineer at Land View Engineer & Architects since 1st February 2023 to 30th April 2026. During the tenure, responsibilities included: • Managing site activities. • Supervising construction.'});
  assert.equal(result.opening, 'continuation');
  assert.match(result.continuation, /30th April 2026\.$/);
  assert.ok(!result.lines.join(' ').includes('has been serving'));
  assert.equal(result.lines.filter(x=>x.startsWith('• ')).length, 2);
});
test('a complete certificate statement is preserved without a generated opening', () => {
  const description = 'This is to certify that Sojib Ahmed Tushar has served as Project Operation Engineer.\n\nWe wish his success.';
  const result = certificateContent({description});
  assert.equal(result.opening, 'complete');
  assert.equal(result.lines.join('\n'), description);
});
test('duties-only statements retain a generated identity opening', () => {
  const result = certificateContent({description:'During the tenure, responsibilities included:\n• Site management.\n• Quality-control documentation.'});
  assert.equal(result.opening, 'generated');
  assert.equal(result.lines.length, 3);
  assert.match(result.lines[2], /Quality-control/);
});

const crypto = require('node:crypto');
const signingFile = path.resolve('lib/certificate-verification.ts');
const signingModule = new Module(signingFile, module);
signingModule._compile(ts.transpileModule(fs.readFileSync(signingFile, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText, signingFile);
const {signCertificate, verifyCertificate} = signingModule.exports;
process.env.LAND_VIEW_VERIFICATION_SECRET = 'certificate-test-only-secret';
const payload = {id:'LVC-EMP-20260914-ABC123',t:'employee',n:'Example Employee',a:'Feni',p:'Engineer',s:'Experience Certificate',r:'EMP-TEST',d:'',i:'2026-09-14T06:00:00Z'};
test('new signed certificates preserve a full statement and paragraph breaks', () => {
  const d = ('Site management and construction supervision. '.repeat(25))+'\n\n• Quality documentation.\n\nWe wish continued success.';
  const token = signCertificate({...payload,d});
  assert.ok(token.startsWith('z_'));
  assert.equal(verifyCertificate(token).d, d);
  assert.ok(token.length < 1000);
  assert.equal(verifyCertificate(token.slice(0,-1)+'!'), null);
});
test('previously issued uncompressed QR tokens remain valid', () => {
  const body = Buffer.from(JSON.stringify({v:1,...payload,d:'Legacy certificate.'})).toString('base64url');
  const signature = crypto.createHmac('sha256',process.env.LAND_VIEW_VERIFICATION_SECRET).update(body).digest('base64url');
  assert.equal(verifyCertificate(body+'.'+signature).d, 'Legacy certificate.');
});
test('overlong statements are rejected rather than silently truncated', () => {
  assert.throws(()=>signCertificate({...payload,d:'x'.repeat(3001)}), /3,000/);
  const vm = require('node:vm');
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync('CertificateRegistry.gs','utf8'), context);
  const statement = 'A'.repeat(1100)+'\n\nClosing statement.';
  assert.equal(context.certificateRegistryDescription_(statement), statement);
  assert.throws(()=>context.certificateRegistryDescription_('x'.repeat(3001)), /3,000/);
});
