import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const code=await readFile(new URL('../functions/api/[[route]].js',import.meta.url),'utf8');
const {onRequest,validateSettings}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
function request(route,{origin='https://storage.zynthec.com',token='Bearer test_token',body={}}={}){return {params:{route:[route]},request:new Request('https://storage.zynthec.com/api/'+route,{method:'POST',headers:{Origin:origin,Authorization:token,'Content-Type':'application/json'},body:JSON.stringify(body)})};}
test('reject unauthenticated and cross-site writes before GitHub',async()=>{
 const saved=globalThis.fetch;globalThis.fetch=()=>{throw new Error('Must not contact GitHub');};
 try{assert.equal((await onRequest(request('settings',{origin:'https://evil.example'}))).status,403);assert.equal((await onRequest(request('settings',{token:''}))).status,401);}finally{globalThis.fetch=saved;}
});
test('reject wrong GitHub owner',async()=>{const saved=globalThis.fetch;globalThis.fetch=async()=>Response.json({login:'someone-else'});try{assert.equal((await onRequest(request('session'))).status,403);}finally{globalThis.fetch=saved;}});
test('reject read-only repository access',async()=>{const saved=globalThis.fetch;globalThis.fetch=async url=>Response.json(url.endsWith('/user')?{login:'zynthec-dev'}:{permissions:{push:false}});try{assert.equal((await onRequest(request('session'))).status,403);}finally{globalThis.fetch=saved;}});
test('allowed owner can log in and settings use optimistic concurrency',async()=>{
 const saved=globalThis.fetch;const calls=[];globalThis.fetch=async(url,opts)=>{calls.push({url,opts});if(url.endsWith('/user'))return Response.json({login:'zynthec-dev'});if(url.endsWith('/contents/apps.json'))return Response.json({commit:{sha:'new'}});return Response.json({permissions:{push:true}});};
 try{assert.equal((await onRequest(request('session'))).status,200);assert.equal((await onRequest(request('settings',{body:{sha:'a'.repeat(40),settings:{'test.app':{enabled:false,name:'Test'}}}}))).status,200);const write=calls.find(c=>c.opts.method==='PUT');const body=JSON.parse(write.opts.body);assert.equal(body.sha,'a'.repeat(40));assert.equal(JSON.parse(Buffer.from(body.content,'base64'))['test.app'].enabled,false);}finally{globalThis.fetch=saved;}
});
test('settings reject source URLs, executable fields and prototype properties',()=>{
 for(const field of ['downloadURL','versions','constructor','__proto__'])assert.throws(()=>validateSettings({'test.app':JSON.parse(`{"${field}":"evil"}`)}));
 assert.throws(()=>validateSettings({'test.app':{category:'bad'}}));
 assert.throws(()=>validateSettings({'test.app':{enabled:'false'}}));
 assert.throws(()=>validateSettings({'test.app':{name:'  '}}));
});
test('upstream conflicts remain conflicts rather than overwriting',async()=>{const saved=globalThis.fetch;globalThis.fetch=async url=>url.endsWith('/user')?Response.json({login:'zynthec-dev'}):url.endsWith('/contents/apps.json')?Response.json({message:'conflict'},{status:409}):Response.json({permissions:{push:true}});try{assert.equal((await onRequest(request('settings',{body:{sha:'a'.repeat(40),settings:{}}}))).status,409);}finally{globalThis.fetch=saved;}});

test('private repository hidden from token produces actionable access error',async()=>{
 const saved=globalThis.fetch;
 globalThis.fetch=async url=>url.endsWith('/user')?Response.json({login:'zynthec-dev'}):Response.json({message:'Not Found'},{status:404});
 try {const response=await onRequest(request('session'));assert.equal(response.status,403);const data=await response.json();assert.match(data.error,/private Repository/);assert.match(data.error,/zynthec-apps-source/);} finally {globalThis.fetch=saved;}
});
test('upstream failures retain JSON diagnostics instead of generic 502',async()=>{
 const saved=globalThis.fetch;
 try {
  for(const status of [301,404,429,500,502,503]){
   globalThis.fetch=async()=>new Response('upstream html',{status});
   const response=await onRequest(request('session'));assert.equal(response.status,424);assert.match((await response.json()).error,new RegExp(String(status)));
  }
  globalThis.fetch=async()=>new Response('<html>invalid</html>');
  assert.match((await (await onRequest(request('session'))).json()).error,/JSON/);
  globalThis.fetch=async()=>{throw new Error('connection failed with sensitive details');};
  const response=await onRequest(request('session'));assert.equal(response.status,424);assert.doesNotMatch((await response.json()).error,/sensitive/);
 } finally {globalThis.fetch=saved;}
});
const middlewareCode=await readFile(new URL('../functions/_middleware.js',import.meta.url),'utf8');
const {onRequest:routeHost}=await import('data:text/javascript;base64,'+Buffer.from(middlewareCode).toString('base64'));
test('admin host routes preserve public feed and isolate API',async()=>{
 for(const [url,status,location] of [
  ['https://storage.zynthec.com/',302,'https://storage.zynthec.com/admin'],
  ['https://apps.zynthec.com/admin',302,'https://storage.zynthec.com/admin'],
  ['https://app.zynthec.com/admin',302,'https://storage.zynthec.com/admin'],
  ['https://apps.zynthec.com/api/session',403,null],
  ['https://storage.zynthec.com/api/session',200,null],
  ['https://storage.zynthec.com/admin',200,null],
  ['https://apps.zynthec.com/source.json',200,null],
  ['http://localhost:8788/api/session',200,null],
 ]){
  const response=await routeHost({request:new Request(url),next:async()=>new Response('next')});
  assert.equal(response.status,status,url);assert.equal(response.headers.get('location'),location,url);
 }
});
