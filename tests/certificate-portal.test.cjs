const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { NextRequest } = require('next/server');

// Exercise the actual Next route and Apps Script handlers with in-memory sheets.
// No production sessions, records or requests are used.
function fixture(options = {}) {
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
  vm.runInContext(fs.readFileSync('ClientPortal.gs','utf8'),gs);
  const headers = vm.runInContext('CLIENT_CERT_REQUEST_HEADERS_', gs);
  const record = values => Object.fromEntries(headers.map((header,i)=>[header,values[i]]));
  gs.getFinanceWorkbook_ = () => ({});
  gs.clientPortalFindProject_ = () => ({row:{}});
  gs.clientPortalClientName_ = (_row,fallback) => fallback;
  gs.clientPortalMobileFromProject_ = () => '';
  gs.clientCertificateRequests_ = () => rows.map((row,index)=>({...row,_row:index+2}));
  gs.ensureClientCertificateRequestSheet_ = () => ({
    getLastColumn:()=>headers.length,
    getRange:row=>({getDisplayValues:()=>[headers],setValues:([values])=>{rows[row-2]=record(values);}}),
    appendRow:values=>rows.push(record(values)),
  });
  gs.clientPortalWorkspace_ = params => {
    const session=gs.clientPortalSession_(params);
    if(options.malformed) return {success:true,data:{projects:[]}};
    return {success:true,data:{client:{name:session.name},projects:(session.projectIds||[]).map(projectId=>({projectId,
      certificateRequests:rows.filter(row=>row.Project_ID===projectId).map(gs.clientCertificatePublic_)}))}};
  };
  const operations=[];
  const module = {exports:{}};
  let calls = 0;
  const sandbox = vm.createContext({module,exports:module.exports,require,console,URL,
    process:{env:{LAND_VIEW_API_URL:'https://backend.example/exec',LAND_VIEW_PROXY_SECRET:'test-only',NODE_ENV:'test'}},
    fetch: async (_url,fetchOptions) => {
      calls++;
      const params = JSON.parse(fetchOptions.body);
      operations.push(params.clientOp || params.certificatePortalOp);
      assert.equal(params.action,'getPublicProjects');
      try {
        let result = params._clientPortal === '1' ? gs.clientPortalGateway_(params)
          : options.legacy ? {success:true,data:{projects:[]}} : gs.certificatePortalFromGateway_(params);
        if(options.ambiguous && params.clientOp==='requestCertificate') result={success:true,data:{}};
        if(options.nested) result={success:true,data:result};
        return {text:async()=>JSON.stringify(result)};
      }
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
  return {request,rows,certificates,operations,calls:()=>calls};
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
  const other=(await f.request('other')).data;
  assert.deepEqual(other.requests,[]);
  assert.deepEqual(other.certificates,[]);
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


test('legacy gateway restores scoped requests and admin review without claiming issued details',async()=>{
  const f=fixture({legacy:true});
  const mine=await f.request('client');
  assert.equal(mine.success,true);
  assert.equal(mine.data.certificatesAvailable,false);
  assert.deepEqual(mine.data.categories,['project','building']);
  const payload={action:'request',projectId:'LV-1',category:'building',subject:'Building completion',details:'Review please'};
  const created=await f.request('client',payload);
  assert.equal(created.success,true);
  assert.equal(created.data.request.certificateType,'building');
  assert.equal((await f.request('client',payload)).data.duplicate,true);
  assert.equal(f.rows.length,1);
  assert.equal((await f.request('client')).data.requests[0].category,'building');
  assert.deepEqual((await f.request('other')).data.requests,[]);
  assert.equal((await f.request('client',{...payload,projectId:'LV-2'})).success,false);
  assert.equal((await f.request('client',{...payload,category:'structural_design'})).status,400);
  const requestId=created.data.request.requestId;
  assert.equal((await f.request('admin',null,'?mode=admin')).data.requests[0].requestId,requestId);
  assert.equal((await f.request('admin',{action:'review',requestId,decision:'approved'})).data.request.status,'Approved');
  assert.equal((await f.request('client',{action:'review',requestId,decision:'approved'})).success,false);
});

test('malformed legacy responses block writes and ambiguous writes are never retried',async()=>{
  const payload={action:'request',projectId:'LV-1',category:'project',subject:'Test'};
  const broken=fixture({legacy:true,malformed:true});
  assert.equal((await broken.request('client')).status,502);
  assert.equal((await broken.request('client',payload)).success,false);
  assert.equal(broken.rows.length,0);
  const uncertain=fixture({legacy:true,ambiguous:true});
  assert.equal((await uncertain.request('client',payload)).success,false);
  assert.equal(uncertain.rows.length,1);
  assert.equal(uncertain.operations.filter(op=>op==='requestCertificate').length,1);
});

test('nested gateway envelopes are accepted and empty unified history stays unified',async()=>{
  const f=fixture({nested:true});
  assert.equal((await f.request('client')).data.backendMode,'unified');
  assert.equal((await f.request('admin',null,'?mode=admin')).data.backendMode,'unified');
  assert.deepEqual(f.operations,['mine','adminList']);
});
