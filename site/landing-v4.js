const sourceURL = 'https://app.zynthec.com/source.json';
const container = document.querySelector('#apps');
const sourceDialog = document.querySelector('#source-dialog');
const appDialog = document.querySelector('#app-dialog');
const ownApp = {name:'zynthecApp', developerName:'zynthec', iconURL:'/icon.png', category:'utilities', inDevelopment:true, localizedDescription:'Dateien, Sideloading und Werkzeuge an einem Ort. zynthecApp befindet sich in Entwicklung; eine signierte Installationsversion ist noch in Vorbereitung.'};
let apps = [ownApp];
let filter = 'all';
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
function iconFor(app, className = 'app-icon') {
  const icon = element('img', className);
  try { const url = new URL(app.iconURL, location.href); icon.src = url.origin === 'https://app.zynthec.com' ? url.pathname : url.origin === location.origin ? url.href : '/icon.png'; } catch { icon.src = '/icon.png'; }
  icon.alt = ''; icon.loading = 'lazy';
  return icon;
}
function category(app) { return app.category || (/sign|scarlet|feather|sideinstaller/i.test(app.name) ? 'utilities' : 'other'); }
function description(app) {
  const descriptions = {ESign:'Signieren. Installieren. Direkt auf deinem iPhone.',Feather:'Deine Apps signieren und installieren. Alles an einem Ort.',Ksign:'Ein weiteres Tool für deine App-Sammlung.',Scarlet:'Neue Möglichkeiten für deine iOS-Apps.',SideInstaller:'Apps installieren. Mit automatisch geprüften Releases.'};
  return app.localizedDescription === 'Bereitgestellt in der zynthec Apps Source.' ? (descriptions[app.name] || app.localizedDescription) : app.localizedDescription;
}
function showSource() { appDialog.close(); document.querySelector('#copy-status').textContent = ''; sourceDialog.showModal(); }
document.querySelectorAll('[data-add-source]').forEach(button => button.addEventListener('click', showSource));
document.querySelectorAll('dialog').forEach(dialog => {
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if(event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
});
function showApp(app) {
  const version = app.versions?.[0] || app;
  const detail = document.querySelector('#app-detail');
  const developer = app.developerName === 'Entwickler der jeweiligen App' ? 'Aus der zynthec Sammlung' : app.developerName;
  detail.replaceChildren(iconFor(app, 'dialog-icon'), element('p', 'eyebrow', category(app) === 'utilities' ? 'TOOLS FÜR DEIN IPHONE' : 'AUS DEINER SAMMLUNG'), element('h2', '', app.name), element('p', 'detail-developer', developer));
  if (app.inDevelopment) {
    const link = element('a','button primary','zynthecApp entdecken');
    link.href = '#app'; link.addEventListener('click',()=>appDialog.close());
    detail.append(element('p','dialog-description',description(app)),link,element('p','detail-note','In Entwicklung · Noch nicht zur Installation verfügbar.'));
    appDialog.showModal(); return;
  }
  const facts = element('div', 'detail-facts');
  for (const [label,value] of [['VERSION',version.version],['MINDESTENS',version.minOSVersion ? `iOS ${version.minOSVersion}` : 'Keine Angabe'],['GRÖSSE',`${(version.size/1048576).toLocaleString('de-DE',{maximumFractionDigits:1})} MB`]]) {
    const fact = element('div'); fact.append(element('span','',label),element('b','',value)); facts.append(fact);
  }
  const actions = element('div', 'detail-actions');
  const add = element('button', 'button primary', 'Source hinzufügen ＋'); add.addEventListener('click', showSource);
  actions.append(add);
  detail.append(facts,element('p','dialog-description',description(app)),actions,element('p','detail-note','Installation über dein kompatibles Sideloading-Tool. Hier werden ausschließlich App-Informationen angezeigt.'));
  appDialog.showModal();
}
function render() {
  const query = document.querySelector('#search').value.trim().toLocaleLowerCase();
  const visible = apps.filter(app => `${app.name} ${app.developerName}`.toLocaleLowerCase().includes(query) && (filter === 'all' || (filter === 'utilities' ? category(app) === 'utilities' : category(app) !== 'utilities')));
  container.replaceChildren();
  for (const app of visible) {
    const version = app.versions?.[0] || app;
    const card = element('article', 'app');
    const top = element('div', 'app-top');
    top.append(iconFor(app),element('span','app-type',app.inDevelopment ? 'In Entwicklung' : app.name === 'SideInstaller' ? 'Automatisch aktuell' : category(app) === 'utilities' ? 'Utilities' : 'Entdecken'));
    const bottom = element('div', 'app-bottom');
    const details = element('button','details-button','Ansehen ↗'); details.setAttribute('aria-label',`${app.name} ansehen`); details.addEventListener('click',()=>showApp(app));
    bottom.append(element('span','app-meta',app.inDevelopment ? 'In Entwicklung' : `v${version.version} · ${version.minOSVersion ? `ab iOS ${version.minOSVersion}` : 'iOS'}`),details);
    card.append(top,element('h3','',app.name),element('p','app-description',description(app)),bottom);
    container.append(card);
  }
  if (!apps.length) {
    const empty = element('div','empty-state library-empty');
    empty.append(element('span','empty-symbol','＋'), element('h3','','Noch keine Apps.'), element('p','','Die Bibliothek ist aktuell leer. Neue Apps erscheinen hier, sobald sie veröffentlicht werden.'));
    container.append(empty);
  } else if (!visible.length) {
    const empty = element('div','empty-state','Keine passende App gefunden.');
    const reset = element('button','text-link','Filter zurücksetzen');
    reset.addEventListener('click',()=>{document.querySelector('#search').value='';setFilter('all');}); empty.append(reset);container.append(empty);
  }
}
function setFilter(value) {
  filter = value;
  document.querySelectorAll('[data-filter]').forEach(button=>{const selected=button.dataset.filter===filter;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));}); render();
}
document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>setFilter(button.dataset.filter)));
document.querySelector('#search').addEventListener('input', render);
document.querySelector('#copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(sourceURL); document.querySelector('#copy-status').textContent = 'Source-URL kopiert.'; }
  catch { document.querySelector('#source-url').select(); document.querySelector('#copy-status').textContent = 'URL markiert. Bitte manuell kopieren.'; }
});
function updateCount() { document.querySelector('#count').textContent = `${apps.length} ${apps.length === 1 ? 'App' : 'Apps'} in der Bibliothek`; }
updateCount(); render();
fetch('./source.json').then(response => { if (!response.ok) throw new Error('Catalog unavailable'); return response.json(); })
  .then(source => {
    apps = [ownApp, ...(Array.isArray(source.apps) ? source.apps : [])]; updateCount(); render();

  })
  .catch(() => { container.append(element('p', 'empty-state', 'Weitere Apps konnten nicht geladen werden. Bitte lade die Seite erneut.')); })
  .finally(()=>container.setAttribute('aria-busy','false'));

const pageForHash = {start:'start',source:'start',app:'app',features:'app',screenshots:'app',install:'app',library:'library',collection:'library'};
function navigate() {
  const hash = location.hash.slice(1);
  const page = pageForHash[hash] || 'start';
  document.querySelectorAll('[data-page]').forEach(panel => { panel.hidden = panel.dataset.page !== page; });
  document.querySelectorAll('[data-tab]').forEach(link => { if (link.dataset.tab === page) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current'); });
  if (['features','screenshots','install'].includes(hash)) document.getElementById(hash).scrollIntoView();
  else window.scrollTo({top:0,behavior:'instant'});
}
window.addEventListener('hashchange',navigate);
navigate();
