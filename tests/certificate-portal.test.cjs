const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { NextRequest } = require('next/server');

// Exercise the actual Next route and Apps Script handlers with in-memory sheets.
// No production sessions, records or requests are used.
function fixture() {
  const rows = [];
  const certificates = [];
  const sessions = { client: {role:'client',name:'Test client',projectIds:['LV-1']}, admin: {role:'admin',userId:'TEST-ADMIN'}, other: {role:'client',projectIds:['LV-2']} };
  const gs = vm.createContext({
    console, normalizeRoleName: value => value.toLowerCase(),
    normalizeFinanceWorkflowProjectId_: value => String(value).toUpperCase(),
    getAllowedProjectIds: session => session.projectIds || [],
    isAdminRole: role => role === 'admin',
    requireSession: params => { if (!sessions[params.token]) throw Error('Session expired.'); return sessions[params.token]; },
    Utilities: {formatDate: () => '20260912-000000'}, Session: {getScriptTimeZone: () => 'Asia/Dhaka'},
    ensureCertificateRegistrySheet_: () => ({}), certificateRegistryRows_: () => certificates,
    certificateRegistryPublicRecord_: row => ({certificateId:row.Certificate_ID,reference:row.Reference,status:'Active'}),
  });
  vm.runInContext(fs.readFileSync('CertificatePortal.gs','utf8'),gs);
  gs.certPortalEnsureRequestSheet_ = () => ({});
  gs.certPortalRequestRows_ = () => rows.map((row,index) => ({...row,_row:index+2}));
  gs.certPortalWriteRequest_ = (_sheet,index,row) => { if(index) rows[index-2]={...row}; else rows.push({...row}); };
  const module = {exports:{}};
  let calls = 0;
  const sandbox = vm.createContext({module,exports:module.exports,require,console,URL,
    process:{env:{LAND_VIEW_API_URL:'https://backend.example/exec',LAND_VIEW_PROXY_SECRET:'test-only',NODE_ENV:'test'}},
    fetch: async (_url,options) => {
      calls++;
      const params = JSON.parse(options.body);
      if (params._clientPortal === '1' && params.clientOp === 'reviewRequest') {
        params._certificatePortal = '1'; params.certificatePortalOp = 'review';
      }
      assert.equal(params._certificatePortal,'1');
      assert.equal(params.action,'getPublicProjects');
      try { return {text:async()=>JSON.stringify(gs.certificatePortalFromGateway_(params))}; }
      catch(error) { return {text:async()=>JSON.stringify({success:false,error:error.message})}; }
    },
  });
  const code = ts.transpileModule(fs.readFileSync('app/api/certificate-portal/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  vm.runInContext(code,sandbox);
  const request = async (token,body,mode='',origin='http://localhost') => {
    const req = new NextRequest('http://localhost/api/certificate-portal'+mode,{method:body?'POST':'GET',headers:{cookie:`landview_session=${token}`,origin,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    const response = await module.exports[body?'POST':'GET'](req);
    return {status:response.status,...await response.json()};
  };
  return {request,rows,certificates,calls:()=>calls};
}

test('one request flows through client history, admin approval and issued certificate linkage',async()=>{
  const f=fixture();
  const payload={action:'request',projectId:'lv-1',category:'structural_design',subject:'Structural design confirmation',details:'For the project file'};
  const created=await f.request('client',payload);
  assert.equal(created.success,true);
  assert.equal(created.data.request.projectId,'LV-1');
  assert.equal(created.data.request.category,'structural_design');
  assert.equal(created.data.request.subject,payload.subject);
  assert.equal(created.data.request.details,payload.details);
  const requestId=created.data.request.requestId;
  assert.equal((await f.request('client',payload)).data.duplicate,true);
  assert.equal(f.rows.length,1);
  assert.equal((await f.request('client')).data.requests[0].requestId,requestId);
  assert.equal((await f.request('admin',null,'?mode=admin')).data.requests[0].requestId,requestId);
  const reviewed=await f.request('admin',{action:'review',requestId,decision:'approved',note:'Reviewed'});
  assert.equal(reviewed.data.request.status,'Approved');
  f.certificates.push({Certificate_ID:'CERT-TEST',Reference:'LV-1'});
  assert.equal((await f.request('admin',{action:'link-issued',requestId,certificateId:'CERT-TEST'})).data.request.status,'Issued');
  const mine=await f.request('client');
  assert.equal(mine.data.requests[0].certificateId,'CERT-TEST');
  assert.equal(mine.data.certificates[0].certificateId,'CERT-TEST');
  assert.equal(mine.data.requests[0].adminNote,'Reviewed');
  assert.deepEqual((await f.request('other')).data,{requests:[],certificates:[]});
});

test('project scope and admin review restrictions remain enforced',async()=>{
  const f=fixture();
  const denied=await f.request('client',{action:'request',projectId:'LV-2',category:'project',subject:'Test'});
  assert.equal(denied.success,false);
  assert.match(denied.error,/access denied/i);
  assert.equal(f.rows.length,0);
  const review=await f.request('client',{action:'review',requestId:'TEST',decision:'approved'});
  assert.equal(review.success,false);
  assert.match(review.error,/admin or manager/i);
});

test('cross-origin submission is rejected before the backend is called',async()=>{
  const f=fixture();
  const result=await f.request('client',{action:'request',category:'project'},'', 'https://other.example');
  assert.equal(result.status,403);
  assert.equal(f.calls(),0);
});

test('client certificate center renders one project-scoped form with all supported categories',()=>{
  const React=require('react');
  const {renderToStaticMarkup}=require('react-dom/server');
  const componentModule={exports:{}};
  const scope=vm.createContext({module:componentModule,exports:componentModule.exports,console,
    require:name=>name.endsWith('.css')?{default:new Proxy({}, {get:(_target,key)=>String(key)})}:require(name),
  });
  const code=ts.transpileModule(fs.readFileSync('components/client-certificate-center.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInContext(code,scope);
  const html=renderToStaticMarkup(React.createElement(componentModule.exports.default,{projects:[{projectId:'LV-1',projectName:'Test project'}],refreshKey:0,onSummary:()=>{}}));
  assert.equal((html.match(/<form\b/g)||[]).length,1);
  assert.match(html,/id="certificates"/);
  for(const category of ['project','structural_design','supervision','building']) assert.ok(html.includes(`value="${category}"`));
  assert.match(html,/value="LV-1"/);
  assert.match(html,/SUBJECT \/ PURPOSE/);
  assert.match(html,/DETAILS FOR LAND VIEW/);
  assert.match(html,/<fieldset disabled=""/); // Loading must not allow an unverified submission.
});
