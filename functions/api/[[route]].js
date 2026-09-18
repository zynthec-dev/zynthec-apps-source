const REPO = 'zynthec-dev/zynthec-ios-sideload-source';
const API = `https://api.github.com/repos/${REPO}`;
const LIMIT = 16 * 1024 * 1024;
const json = (body, status = 200) => new Response(JSON.stringify(body), {status, headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"}});
class APIError extends Error { constructor(message,status=400){super(message);this.status=status;} }
async function limitedBody(request, max) {
  if(Number(request.headers.get('content-length')) > max) throw new APIError('Die Datei ist zu groß.',413);
  const reader=request.body?.getReader(); if(!reader) return new Uint8Array();
  const chunks=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw new APIError('Die Datei ist zu groß.',413);}chunks.push(value);}
  const data=new Uint8Array(size);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}return data;
}
function validateSettings(data) {
  if(!data || typeof data!=='object' || Array.isArray(data) || Object.keys(data).length>500)throw new APIError('Ungültige App-Einstellungen.');
  const fields={name:100,developerName:100,localizedDescription:10000,category:30};
  const result=Object.create(null);
  for(const [id,values] of Object.entries(data)){
    if(!/^[A-Za-z0-9][A-Za-z0-9._-]{1,254}$/.test(id) || !values || typeof values!=='object' || Array.isArray(values))throw new APIError('Ungültige App-ID.');
    const row=Object.create(null);
    for(const [key,value] of Object.entries(values)){
      if(key==='enabled'){if(typeof value!=='boolean')throw new APIError('Ungültiger Status.');row.enabled=value;}
      else if(Object.hasOwn(fields,key)){if(typeof value!=='string'||value.length>fields[key])throw new APIError('Ungültiger App-Text.');if(['name','developerName'].includes(key)&&!value.trim())throw new APIError('Name und Entwickler dürfen nicht leer sein.');if(key==='category'&&!['utilities','other','entertainment','games','lifestyle','photo-video','social','developer'].includes(value))throw new APIError('Ungültige Kategorie.');row[key]=value;}
      else throw new APIError('Nicht erlaubtes App-Feld.');
    }
    result[id]=row;
  }
  return result;
}
export {validateSettings, limitedBody};
export async function onRequest({request,params}) {
  try {
    const url=new URL(request.url);
    if(request.headers.get('Origin')!==url.origin)throw new APIError('Zugriff nur über dieses Admin-Panel erlaubt.',403);
    const token=request.headers.get('Authorization')||'';
    if(!/^Bearer [A-Za-z0-9_]+$/.test(token))throw new APIError('Bitte mit deinem GitHub-Zugangsschlüssel anmelden.',401);
    const route=Array.isArray(params.route)?params.route.join('/'):params.route;
    const headers={Authorization:token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'zynthec-source-admin'};
    async function github(path,{method='GET',body,raw=false}={}){
      const destination=path.startsWith('https://uploads.github.com/')?path:path.startsWith('/user')?'https://api.github.com'+path:API+path;
      const step=path==='/user'?'GitHub-Konto':path===''?'Repository-Zugriff':'GitHub-Anfrage';
      let response;
      try {
        response=await fetch(destination,{method,headers:{...headers,...(body?{'Content-Type':raw?'application/octet-stream':'application/json'}:{})},body:body?(raw?body:JSON.stringify(body)):undefined,redirect:'manual',signal:AbortSignal.timeout(20000)});
      } catch {
        throw new APIError(`${step}: GitHub ist derzeit nicht erreichbar oder antwortet zu langsam. Bitte erneut versuchen.`,424);
      }
      if(!response.ok){
        const status=response.status;
        if(status===401)throw new APIError('Zugangsschlüssel ungültig oder abgelaufen.',401);
        if(status===404 && path==='')throw new APIError(`Dein Schlüssel kann das private Repository ${REPO} nicht sehen. Prüfe im Fine-grained Token den Resource owner zynthec-dev und die Freigabe genau dieses Repositorys.`,403);
        if(status===403)throw new APIError(`${step}: GitHub verweigert den Zugriff. Prüfe die Token-Freigabe für ${REPO} sowie Contents und Actions: Read and write.`,403);
        if(status===409||status===422)throw new APIError('Zwischenzeitlich geändert oder Upload bereits vorhanden. Bitte neu laden.',409);
        if(status>=300&&status<400)throw new APIError(`${step}: GitHub meldet eine Weiterleitung (HTTP ${status}). Die Repository-Konfiguration muss geprüft werden.`,424);
        // Keep dependency failures distinguishable from an edge/proxy 502 page.
        throw new APIError(`${step} fehlgeschlagen (GitHub HTTP ${status}). Bitte diese Meldung zur Diagnose weitergeben.`,424);
      }
      if(response.status===204)return null;
      try {return await response.json();}
      catch {throw new APIError(`${step}: GitHub hat keine gültige JSON-Antwort geliefert. Bitte erneut versuchen.`,424);}

    }
    const user=await github('/user');
    if(user.login!=='zynthec-dev')throw new APIError('Nur das GitHub-Konto zynthec-dev darf diese Source verwalten.',403);
    const repo=await github('');
    if(!repo.permissions?.push)throw new APIError('Schreibzugriff auf das Source-Repository fehlt.',403);
    const method=request.method;
    if(route==='session'&&method==='POST')return json({login:user.login});
    if(route==='catalog'&&method==='POST'){
      const [catalog,settings]=await Promise.all([github('/contents/catalog/apps.json?ref=main'),github('/contents/apps.json?ref=main')]);
      const decode=data=>JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(data.content.replace(/\s/g,'')),c=>c.charCodeAt(0))));
      return json({catalog:decode(catalog),settings:decode(settings),sha:settings.sha});
    }
    if(route==='runs'&&method==='POST')return json(await github('/actions/workflows/source.yml/runs?per_page=8'));
    if(method!=='POST')throw new APIError('Methode nicht erlaubt.',405);
    if(route==='chunk'){
      const upload=url.searchParams.get('upload'),part=url.searchParams.get('part');
      if(!/^[0-9a-f-]{36}$/.test(upload||'')||!/^\d{1,3}$/.test(part||'')||Number(part)>127)throw new APIError('Ungültiger Upload.');
      const release=(await github('/releases?per_page=100')).find(r=>r.tag_name==='admin-uploads');
      if(!release?.draft)throw new APIError('Upload-Ablage ist nicht privat als Entwurf konfiguriert.');
      const bytes=await limitedBody(request,LIMIT);if(!bytes.length)throw new APIError('Leere Datei.');
      const name=`${upload}-${Number(part)}.part`;
      const asset=await github(`https://uploads.github.com/repos/${REPO}/releases/${release.id}/assets?name=${name}`,{method:'POST',body:bytes,raw:true});
      return json({id:asset.id,size:asset.size,name:asset.name});
    }
    const body=JSON.parse(new TextDecoder().decode(await limitedBody(request,100000)));
    if(route==='settings'){
      const settings=validateSettings(body.settings);
      if(!/^[0-9a-f]{40}$/.test(body.sha||''))throw new APIError('Ungültiger Versionsstand.');
      const content=btoa(Array.from(new TextEncoder().encode(JSON.stringify(settings,null,2)+'\n'),b=>String.fromCharCode(b)).join(''));
      const result=await github('/contents/apps.json',{method:'PUT',body:{message:'Update apps from admin panel',content,sha:body.sha,branch:'main'}});
      return json({commit:result.commit.sha});
    }
    if(route==='import'){
      if(!Array.isArray(body.assets)||!body.assets.length||body.assets.length>128||body.assets.some(a=>!Number.isSafeInteger(a)||a<=0))throw new APIError('Ungültige Upload-Teile.');
      if(!Array.isArray(body.checksums)||body.checksums.length!==body.assets.length||body.checksums.some(h=>!/^[0-9a-f]{64}$/.test(h))||!Number.isSafeInteger(body.size)||body.size<1||body.size>512*1024**2)throw new APIError('Ungültige Dateiprüfsumme.');
      const manifest={assets:body.assets,checksums:body.checksums,size:body.size};
      await github('/actions/workflows/source.yml/dispatches',{method:'POST',body:{ref:'main',inputs:{upload_manifest:JSON.stringify(manifest)}}});
      return json({queued:true});
    }
    if(route==='sync'){
      await github('/actions/workflows/source.yml/dispatches',{method:'POST',body:{ref:'main'}});return json({queued:true});
    }
    throw new APIError('Nicht gefunden.',404);
  }catch(error){return json({error:error instanceof SyntaxError?'Ungültige Anfrage.':error instanceof APIError?error.message:'Die Anfrage konnte nicht abgeschlossen werden. Bitte erneut versuchen.'},error instanceof APIError?error.status:400);}
}
