export class APIError extends Error {constructor(message,status=400){super(message);this.status=status;}}
export const RIGHTS=['apps.upload','apps.update','apps.remove','users.manage'];
const enc=new TextEncoder();
const hex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
const bytes=h=>Uint8Array.from(h.match(/../g)||[],x=>parseInt(x,16));
export const random=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
export const digest=async s=>hex(await crypto.subtle.digest('SHA-256',enc.encode(s)));
export const now=()=>Math.floor(Date.now()/1000);
export const json=(data,status=200,headers={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
export function publicUser(u){return {id:u.id,email:u.email,name:u.name,owner:!!u.owner,active:!!u.active,permissions:u.owner?RIGHTS:JSON.parse(u.permissions),pending:!u.owner&&!u.password_hash};}
export function requireRight(user,right){if(!user.owner&&!JSON.parse(user.permissions).includes(right))throw new APIError('Dir fehlt die Berechtigung für diese Aktion.',403);}
export async function body(request){const reader=request.body?.getReader();if(!reader)return {};let text='',size=0;const decoder=new TextDecoder();while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>100000){await reader.cancel();throw new APIError('Anfrage zu groß.',413);}text+=decoder.decode(r.value,{stream:true});}return JSON.parse(text+decoder.decode());}
export function email(value){const e=String(value||'').trim().toLowerCase();if(e.length>254||!/^\S+@\S+\.\S+$/.test(e))throw new APIError('Bitte eine gültige E-Mail-Adresse eingeben.');return e;}
export function permissions(value){if(!Array.isArray(value)||value.some(x=>!RIGHTS.includes(x)))throw new APIError('Ungültige Rechte.');return JSON.stringify([...new Set(value)]);}
export async function passwordHash(password,salt,secret){
 if(typeof password!=='string'||password.length<12||password.length>256)throw new APIError('Das Passwort muss 12 bis 256 Zeichen lang sein.');
 const pepper=await crypto.subtle.importKey('raw',bytes(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const material=await crypto.subtle.sign('HMAC',pepper,enc.encode(password));
 const key=await crypto.subtle.importKey('raw',material,'PBKDF2',false,['deriveBits']);
 return hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:bytes(salt),iterations:100000,hash:'SHA-256'},key,256));
}
export async function equal(a,b){const key=await crypto.subtle.importKey('raw',new Uint8Array(32),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);return crypto.subtle.verify('HMAC',key,await crypto.subtle.sign('HMAC',key,enc.encode(a)),enc.encode(b));}
export async function limit(db,key,max){const until=now()+900;const r=await db.prepare('INSERT INTO admin_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires<? THEN 1 ELSE count+1 END,expires=CASE WHEN expires<? THEN excluded.expires ELSE expires END RETURNING count').bind(key,until,now(),now()).first();if(r.count>max)throw new APIError('Zu viele Versuche. Bitte in 15 Minuten erneut versuchen.',429);}
export async function audit(db,user,action,target=''){await db.prepare('INSERT INTO admin_audit(user_id,action,target,created_at) VALUES(?,?,?,?)').bind(user?.id||null,action,target,now()).run();}
export async function session(request,db){const token=request.headers.get('cookie')?.match(/(?:^|;\s*)__Host-zynthec_session=([a-f0-9]{64})(?:;|$)/)?.[1];if(!token)throw new APIError('Bitte anmelden.',401);const u=await db.prepare('SELECT u.* FROM admin_sessions s JOIN admin_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires>? AND u.active=1').bind(await digest(token),now()).first();if(!u)throw new APIError('Die Sitzung ist abgelaufen. Bitte erneut anmelden.',401);return u;}
const cookie=(token,age)=>`__Host-zynthec_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
export async function authRoute(route,request,env){
 const db=env.ADMIN_DB;if(!db||!env.AUTH_KEY)throw new APIError('Die Account-Verwaltung ist noch nicht eingerichtet.',503);
 if(route==='github-login'){
  await limit(db,'github-ip:'+await digest(request.headers.get('CF-Connecting-IP')||'local'),15);
  const data=await body(request);
  if(typeof data.token!=='string'||data.token.length>300||!/^Bearer [A-Za-z0-9_]+$/.test('Bearer '+data.token))throw new APIError('Ungültiger GitHub-Zugangsschlüssel.',401);
  const headers={Authorization:'Bearer '+data.token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'zynthec-admin'};
  async function github(path){
   let response;try{response=await fetch('https://api.github.com'+path,{headers,redirect:'manual',signal:AbortSignal.timeout(20000)});}catch{throw new APIError('GitHub ist derzeit nicht erreichbar.',424);}
   if(response.status===401)throw new APIError('GitHub-Schlüssel ungültig oder abgelaufen.',401);
   if(response.status===404)throw new APIError('Der Schlüssel hat keinen Zugriff auf zynthec-dev/zynthec-apps-source. Bitte die Repository-Freigabe prüfen.',403);
   if(!response.ok)throw new APIError(`GitHub-Zugriff fehlgeschlagen (HTTP ${response.status}).`,424);
   return response.json();
  }
  const profile=await github('/user');
  if(profile.login!=='zynthec-dev')throw new APIError('Der GitHub-Zugang ist ausschließlich für zynthec-dev freigegeben.',403);
  const repo=await github('/repos/zynthec-dev/zynthec-apps-source');
  if(repo.full_name!=='zynthec-dev/zynthec-apps-source'||!repo.permissions?.push)throw new APIError('Schreibzugriff auf das Source-Repository fehlt.',403);
  const id='github:zynthec-dev',token=random();
  await db.batch([
   db.prepare("INSERT INTO admin_users(id,email,name,owner,permissions,created_at) VALUES(?,?,?,1,?,?) ON CONFLICT(id) DO UPDATE SET active=1").bind(id,'github:zynthec-dev','zynthec',JSON.stringify(RIGHTS),now()),
   db.prepare("INSERT INTO admin_settings(key,value) VALUES('github',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(await encrypt(env.AUTH_KEY,data.token)),
   db.prepare('DELETE FROM admin_sessions WHERE expires<?').bind(now()),
   db.prepare('INSERT INTO admin_sessions(token_hash,user_id,expires) VALUES(?,?,?)').bind(await digest(token),id,now()+28800)
  ]);
  const user=await db.prepare('SELECT * FROM admin_users WHERE id=?').bind(id).first();
  await audit(db,user,'session.github');return json({user:publicUser(user)},200,{'Set-Cookie':cookie(token,28800)});
 }
 if(['login','activate'].includes(route)){
  await limit(db,'ip:'+await digest(request.headers.get('CF-Connecting-IP')||'local'),30);
  const data=await body(request);
  if(route==='activate'){
   if(!/^[a-f0-9]{64}$/.test(data.invite||''))throw new APIError('Einrichtungslink ungültig oder abgelaufen.');
   const salt=random();const hash=await passwordHash(data.password,salt,env.AUTH_KEY);
   const u=await db.prepare('UPDATE admin_users SET password_hash=?,salt=?,invite_hash=NULL,invite_expires=NULL WHERE invite_hash=? AND invite_expires>? AND active=1 RETURNING *').bind(hash,salt,await digest(data.invite),now()).first();
   if(!u)throw new APIError('Einrichtungslink ungültig oder abgelaufen.');
   await db.prepare('DELETE FROM admin_sessions WHERE user_id=?').bind(u.id).run();await audit(db,u,'account.activate');return json({ok:true});
  }
  const address=email(data.email);await limit(db,'email:'+await digest(address),10);
  const u=await db.prepare('SELECT * FROM admin_users WHERE email=?').bind(address).first();
  let hash;try{hash=await passwordHash(data.password,u?.salt||'00'.repeat(32),env.AUTH_KEY);}catch{throw new APIError('E-Mail oder Passwort ungültig.',401);}
  if(!await equal(hash,u?.password_hash||'0'.repeat(64))||!u?.active)throw new APIError('E-Mail oder Passwort ungültig.',401);
  const token=random();await db.batch([db.prepare('DELETE FROM admin_sessions WHERE expires<?').bind(now()),db.prepare('INSERT INTO admin_sessions(token_hash,user_id,expires) VALUES(?,?,?)').bind(await digest(token),u.id,now()+28800)]);
  await audit(db,u,'session.login');return json({user:publicUser(u)},200,{'Set-Cookie':cookie(token,28800)});
 }
 if(route==='logout'){const token=request.headers.get('cookie')?.match(/__Host-zynthec_session=([a-f0-9]{64})/)?.[1];if(token)await db.prepare('DELETE FROM admin_sessions WHERE token_hash=?').bind(await digest(token)).run();return json({ok:true},200,{'Set-Cookie':cookie('',0)});}
 const user=await session(request,db);
 if(route==='session')return json({user:publicUser(user)});
 if(route==='password'){
  if(user.owner)throw new APIError('Der Hauptadmin verwendet ausschließlich den GitHub-Zugang.',403);
  const data=await body(request);if(!await equal(await passwordHash(data.currentPassword,user.salt,env.AUTH_KEY),user.password_hash))throw new APIError('Aktuelles Passwort ungültig.',403);
  const salt=random(),hash=await passwordHash(data.password,salt,env.AUTH_KEY);
  await db.batch([db.prepare('UPDATE admin_users SET password_hash=?,salt=? WHERE id=?').bind(hash,salt,user.id),db.prepare('DELETE FROM admin_sessions WHERE user_id=?').bind(user.id)]);await audit(db,user,'account.password');return json({ok:true},200,{'Set-Cookie':cookie('',0)});
 }
 if(route==='users'){requireRight(user,'users.manage');const rows=await db.prepare('SELECT * FROM admin_users ORDER BY owner DESC,email').all();return json({users:rows.results.map(publicUser)});}
 if(['users/create','users/update','users/reset'].includes(route)){
  requireRight(user,'users.manage');const data=await body(request);
  if(route==='users/create'){
   const address=email(data.email),name=String(data.name||address).trim().slice(0,100),rights=permissions(data.permissions);
   if(await db.prepare('SELECT id FROM admin_users WHERE email=?').bind(address).first())throw new APIError('Dieser Account existiert bereits.',409);
   const id=crypto.randomUUID(),token=random();await db.prepare('INSERT INTO admin_users(id,email,name,permissions,invite_hash,invite_expires,created_at) VALUES(?,?,?,?,?,?,?)').bind(id,address,name,rights,await digest(token),now()+86400,now()).run();await audit(db,user,'users.create',id);return json({invite:`https://storage.zynthec.com/admin#invite=${token}`});
  }
  const target=await db.prepare('SELECT * FROM admin_users WHERE id=?').bind(String(data.id||'')).first();
  if(!target)throw new APIError('Account nicht gefunden.',404);
  if(target.owner||target.id===user.id)throw new APIError('Der Hauptadmin und dein eigener Account können hier nicht geändert werden.',403);
  if(route==='users/reset'){
   const token=random();await db.batch([db.prepare('UPDATE admin_users SET invite_hash=?,invite_expires=? WHERE id=?').bind(await digest(token),now()+3600,target.id),db.prepare('DELETE FROM admin_sessions WHERE user_id=?').bind(target.id)]);await audit(db,user,'users.reset',target.id);return json({invite:`https://storage.zynthec.com/admin#invite=${token}`});
  }
  const rights=permissions(data.permissions);if(typeof data.active!=='boolean')throw new APIError('Ungültiger Account-Status.');
  await db.batch([db.prepare('UPDATE admin_users SET permissions=?,active=? WHERE id=?').bind(rights,data.active?1:0,target.id),db.prepare('DELETE FROM admin_sessions WHERE user_id=?').bind(target.id)]);await audit(db,user,'users.update',target.id);return json({ok:true});
 }
 if(route==='audit'){requireRight(user,'users.manage');return json(await db.prepare('SELECT a.action,a.target,a.created_at,u.email FROM admin_audit a LEFT JOIN admin_users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 100').all());}
 return null;
}
export async function encrypt(secret,value){const iv=crypto.getRandomValues(new Uint8Array(12));const key=await crypto.subtle.importKey('raw',bytes(secret),'AES-GCM',false,['encrypt']);return hex(iv)+':'+hex(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,enc.encode(value)));}
export async function decrypt(secret,value){const [iv,data]=value.split(':');const key=await crypto.subtle.importKey('raw',bytes(secret),'AES-GCM',false,['decrypt']);return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(iv)},key,bytes(data)));}
