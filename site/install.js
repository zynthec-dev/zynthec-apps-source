const target=document.getElementById('install-options');
const bundle=new URLSearchParams(location.search).get('app');
fetch('/installations.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(apps=>{
 const matches=apps.filter(app=>bundle?app.bundleIdentifier===bundle:app.ownApp);
 if(!matches.length){target.textContent='Für diese App ist noch keine IPA veröffentlicht.';return;}
 target.replaceChildren();
 for(const app of matches){
  const card=document.createElement('section');card.className='install-panel';
  const title=document.createElement('h2');title.textContent=app.name;
  const version=document.createElement('p');version.textContent='Version '+app.version;
  const install=document.createElement('a');install.className='button primary';install.textContent='Auf dem iPhone installieren';install.href='itms-services://?action=download-manifest&url='+encodeURIComponent(app.manifestURL);
  const download=document.createElement('a');download.className='button secondary';download.textContent='IPA herunterladen';download.href=app.downloadURL;
  const buttons=document.createElement('div');buttons.className='source-buttons';buttons.append(install,download);
  card.append(title,version,buttons);target.append(card);
 }
}).catch(()=>{target.textContent='Die Installationsdateien konnten nicht geladen werden. Bitte lade die Seite erneut.';});
