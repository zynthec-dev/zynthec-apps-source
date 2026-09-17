let token = '';
let catalog = {};
let settings = {};
let sha = '';
let selectedID = '';
let busy = false;
let pendingImport = null;
const $ = id => document.getElementById(id);
const API = '/api/';
function node(tag, cls, text){const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n;}
function status(id,text,error=false){$(id).textContent=text;$(id).classList.toggle('error',error);}
async function api(route,body={}){
  const response=await fetch(API+route,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
  let data;try{data=await response.json();}catch{throw new Error('Das Admin-Panel ist nur auf sideload.zynthec.com verfügbar.');}
  if(!response.ok){if(response.status===401)logout();throw new Error(data.error||'Anfrage fehlgeschlagen.');}return data;
}
function logout(){token='';catalog={};settings={};sha='';$('token').value='';$('dashboard').hidden=true;$('login-view').hidden=false;$('logout').hidden=true;document.querySelectorAll('dialog').forEach(d=>d.close());}
$('logout').addEventListener('click',()=>{if(!busy)logout();});
$('login-form').addEventListener('submit',async event=>{
  event.preventDefault();const submit=event.submitter;submit.disabled=true;token=$('token').value.trim();status('login-status','Anmeldung wird geprüft …');
  try{await api('session');$('token').value='';await load();$('login-view').hidden=true;$('dashboard').hidden=false;$('logout').hidden=false;status('login-status','');}
  catch(error){token='';status('login-status',error.message,true);}finally{submit.disabled=false;}
});
function appFor(id){return {...catalog[id].app,...settings[id]};}
function renderApps(){
  const list=$('admin-apps');list.replaceChildren();let visible=0;
  for(const id of Object.keys(catalog).sort((a,b)=>appFor(a).name.localeCompare(appFor(b).name,'de'))){
    const app=appFor(id),enabled=settings[id]?.enabled!==false;if(enabled)visible++;
    const row=node('article','admin-app-row'+(enabled?'':' is-hidden'));
    const icon=node('img');icon.src=app.iconURL;icon.alt='';
    const info=node('div','admin-app-info');const title=node('h3','',app.name);title.append(node('span','badge',enabled?'In der Source':'Ausgeblendet'));
    info.append(title,node('p','',`v${app.versions[0].version} · ${id}`));
    const actions=node('div','admin-row-actions');const edit=node('button','','Bearbeiten');edit.addEventListener('click',()=>editApp(id));
    const toggle=node('button',enabled?'remove':'',enabled?'Entfernen':'Wiederherstellen');toggle.addEventListener('click',()=>confirmVisibility(id));actions.append(edit,toggle);row.append(icon,info,actions);list.append(row);
  }
  $('visible-count').textContent=visible;$('hidden-count').textContent=Object.keys(catalog).length-visible;
}
async function load(){const data=await api('catalog');catalog=data.catalog;settings=data.settings;sha=data.sha;renderApps();await loadRuns();}
async function loadRuns(){
  const target=$('runs');
  try{const data=await api('runs');target.replaceChildren();
    for(const run of data.workflow_runs){const row=node('a','run');row.href=run.html_url;row.target='_blank';row.rel='noopener noreferrer';const label=run.status!=='completed'?'In Bearbeitung':run.conclusion==='success'?'Erfolgreich':run.conclusion==='cancelled'?'Abgebrochen':'Fehlgeschlagen';row.append(node('span','',`${new Date(run.created_at).toLocaleString('de-DE')} · ${run.display_title}`),node('span','',label));target.append(row);}
  }catch(error){target.textContent=error.message;}
}
$('refresh').addEventListener('click',async()=>{try{await load();status('dashboard-status','Ansicht aktualisiert.');}catch(e){status('dashboard-status',e.message,true);}});
$('sync').addEventListener('click',async()=>{if(busy)return;busy=true;$('sync').disabled=true;try{await api('sync');status('dashboard-status','Update-Prüfung gestartet. Den Verlauf findest du unter Veröffentlichungen.');await loadRuns();}catch(e){status('dashboard-status',e.message,true);}finally{busy=false;$('sync').disabled=false;}});
async function save(next){await api('settings',{settings:next,sha});await load();status('dashboard-status','Gespeichert. Die Source wird jetzt veröffentlicht. Das kann einige Minuten dauern.');}
function editApp(id){selectedID=id;const app=appFor(id);$('edit-title').textContent=app.name;$('edit-name').value=app.name;$('edit-developer').value=app.developerName;$('edit-description').value=app.localizedDescription;$('edit-category').value=app.category||(/sign|scarlet|feather|sideinstaller/i.test(app.name)?'utilities':'other');status('edit-status','');$('edit-dialog').showModal();}
$('edit-form').addEventListener('submit',async event=>{event.preventDefault();if(busy)return;busy=true;event.submitter.disabled=true;status('edit-status','Wird gespeichert …');try{const next=structuredClone(settings);next[selectedID]={...next[selectedID],name:$('edit-name').value.trim(),developerName:$('edit-developer').value.trim(),localizedDescription:$('edit-description').value.trim(),category:$('edit-category').value};await save(next);$('edit-dialog').close();}catch(e){status('edit-status',e.message,true);}finally{busy=false;event.submitter.disabled=false;}});
function confirmVisibility(id){selectedID=id;const enabled=settings[id]?.enabled!==false;$('visibility-title').textContent=enabled?`${appFor(id).name} entfernen?`:`${appFor(id).name} wiederherstellen?`;$('visibility-description').textContent=enabled?'Die App verschwindet aus der Source und der öffentlichen Sammlung. Du kannst sie jederzeit wiederherstellen. Bereits installierte Apps und vorhandene Downloads bleiben erhalten.':'Die App wird wieder in der Source und auf der öffentlichen Seite angezeigt.';$('confirm-visibility').textContent=enabled?'Aus der Source entfernen':'Wiederherstellen';status('visibility-status','');$('visibility-dialog').showModal();}
$('confirm-visibility').addEventListener('click',async()=>{if(busy)return;busy=true;$('confirm-visibility').disabled=true;try{const next=structuredClone(settings);next[selectedID]={...next[selectedID],enabled:settings[selectedID]?.enabled===false};await save(next);$('visibility-dialog').close();}catch(e){status('visibility-status',e.message,true);}finally{busy=false;$('confirm-visibility').disabled=false;}});
document.querySelectorAll('dialog').forEach(dialog=>{dialog.querySelector('[data-close]').addEventListener('click',()=>{if(!busy)dialog.close();});dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});});
$('open-upload').addEventListener('click',()=>{$('upload-dialog').showModal();});
$('ipa-file').addEventListener('change',()=>{const file=$('ipa-file').files[0];$('file-label').textContent=file?`${file.name} · ${(file.size/1048576).toFixed(1)} MB`:'Bis zu 512 MB';});
function uploadPart(blob,upload,part,onProgress){return new Promise((resolve,reject)=>{
  const xhr=new XMLHttpRequest();xhr.open('POST',`${API}chunk?upload=${upload}&part=${part}`);xhr.setRequestHeader('Authorization',`Bearer ${token}`);xhr.setRequestHeader('Content-Type','application/octet-stream');xhr.timeout=180000;xhr.upload.onprogress=event=>onProgress(event.loaded);xhr.onerror=()=>reject(new Error('Upload unterbrochen. Prüfe deine Verbindung und starte erneut.'));xhr.ontimeout=()=>reject(new Error('Zeitüberschreitung beim Upload. Bitte erneut versuchen.'));xhr.onload=()=>{let data;try{data=JSON.parse(xhr.responseText);}catch{reject(new Error('Upload fehlgeschlagen. Bitte erneut versuchen.'));return;}xhr.status>=200&&xhr.status<300?resolve(data):reject(new Error(data.error||'Upload fehlgeschlagen.'));};xhr.send(blob);
});}
async function dispatchUpload(){await api('import',pendingImport);pendingImport=null;$('retry-import').hidden=true;status('upload-status','Upload abgeschlossen. GitHub prüft die IPA und veröffentlicht sie. Du kannst dieses Fenster jetzt schließen.');status('dashboard-status','App-Import gestartet. Prüfe den Verlauf unter Veröffentlichungen.');await loadRuns();}
$('retry-import').addEventListener('click',async()=>{if(!pendingImport||busy)return;busy=true;try{await dispatchUpload();}catch(e){status('upload-status',e.message,true);}finally{busy=false;}});
$('upload-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;const file=$('ipa-file').files[0];if(!file||!file.name.toLowerCase().endsWith('.ipa')||file.size<1||file.size>512*1024**2){status('upload-status','Bitte eine IPA-Datei bis 512 MB wählen.',true);return;}
  busy=true;event.submitter.disabled=true;$('logout').disabled=true;$('ipa-file').disabled=true;$('upload-progress').hidden=false;$('upload-progress').value=0;pendingImport=null;$('retry-import').hidden=true;
  try{
    const upload=crypto.randomUUID(),chunkSize=16*1024**2,assets=[],checksums=[];
    for(let offset=0,part=0;offset<file.size;offset+=chunkSize,part++){
      const blob=file.slice(offset,offset+chunkSize);status('upload-status',`Upload läuft … Abschnitt ${part+1} von ${Math.ceil(file.size/chunkSize)}`);
      const hash=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());checksums.push([...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join(''));
      const asset=await uploadPart(blob,upload,part,loaded=>{$('upload-progress').value=Math.min(100,(offset+loaded)/file.size*100);});assets.push(asset.id);
    }
    pendingImport={assets,checksums,size:file.size};status('upload-status','Upload vollständig. Veröffentlichung wird gestartet …');await dispatchUpload();
  }catch(e){status('upload-status',e.message,true);$('retry-import').hidden=!pendingImport;}finally{busy=false;event.submitter.disabled=false;$('logout').disabled=false;$('ipa-file').disabled=false;}
});
window.addEventListener('beforeunload',event=>{if(busy){event.preventDefault();event.returnValue='';}});
if(location.hostname!=='sideload.zynthec.com'&&location.hostname!=='127.0.0.1'&&location.hostname!=='localhost'){status('login-status','Bitte öffne die Verwaltung unter https://sideload.zynthec.com/admin.',true);$('login-form').querySelector('button').disabled=true;}
