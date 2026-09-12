const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const ts=require('typescript');
const {NextRequest}=require('next/server');
const moduleProxy={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('proxy.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:moduleProxy,exports:moduleProxy.exports,require,URL,process:{env:{}}});
function route(path,host='www.landview.com.bd',token=''){
 return moduleProxy.exports.proxy(new NextRequest(`https://${host}${path}`,{headers:{host,...(token?{cookie:`landview_session=${token}`}:{})}}));
}
test('app public service URLs redirect to canonical website while sessions stay on app',()=>{
 const publicPage=route('/services/structural-design?from=app','app.landview.com.bd');
 assert.equal(publicPage.status,308);
 assert.equal(publicPage.headers.get('location'),'https://www.landview.com.bd/services/structural-design?from=app');
 assert.equal(route('/client','www.landview.com.bd').headers.get('location'),'https://app.landview.com.bd/client');
 assert.match(route('/client','app.landview.com.bd').headers.get('location'),/\/login\?next=%2Fclient$/);
});
test('portals and verification records are noindex but marketing pages remain indexable',()=>{
 for(const path of ['/client','/admin','/employee','/login','/certificate/verify/abc','/verify/abc']) {
  assert.equal(route(path,'app.landview.com.bd','test').headers.get('x-robots-tag'),'noindex, nofollow');
 }
 for(const path of ['/','/services','/contact','/projects','/team']) assert.equal(route(path).headers.get('x-robots-tag'),null);
});

test('published portfolio records render in initial HTML without a browser fetch',()=>{
 const React=require('react');
 const {renderToStaticMarkup}=require('react-dom/server');
 const project={projectId:'LV-PUBLIC',title:'Published Feni residence',description:'A coordinated building project',category:'Residential'};
 for(const [filename,props] of [['public-project-list',{initialProjects:[project]}],['public-project-detail',{initialProject:project}]]){
  const m={exports:{}};
  const customRequire=name=>name==='@/components/public-header'?{default:()=>null}:name==='next/navigation'?{useParams:()=>({projectId:'LV-PUBLIC'})}:require(name);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(`components/${filename}.tsx`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module:m,exports:m.exports,require:customRequire,URL,console});
  const html=renderToStaticMarkup(React.createElement(m.exports.default,props));
  assert.match(html,/Published Feni residence/);
  assert.doesNotMatch(html,/Loading project/);
 }
});
