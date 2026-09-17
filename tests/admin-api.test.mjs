import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const code=await readFile(new URL('../functions/api/[[route]].js',import.meta.url),'utf8');
const {onRequest,validateSettings}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
function request(route,{origin='https://sideload.zynthec.com',token='Bearer test_token',body={}}={}){return {params:{route:[route]},request:new Request('https://sideload.zynthec.com/api/'+route,{method:'POST',headers:{Origin:origin,Authorization:token,'Content-Type':'application/json'},body:JSON.stringify(body)})};}
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
