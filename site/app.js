const sourceURL = 'https://sideload.zynthec.com/source.json';
const container = document.querySelector('#apps');
let apps = [];
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
function render() {
  const query = document.querySelector('#search').value.trim().toLocaleLowerCase();
  const visible = apps.filter(app => `${app.name} ${app.developerName}`.toLocaleLowerCase().includes(query));
  container.replaceChildren();
  for (const app of visible) {
    const version = app.versions[0];
    const card = element('article', 'app');
    const top = element('div', 'app-top');
    const icon = element('img', 'app-icon'); icon.src = app.iconURL.replace('https://sideload.zynthec.com/', './'); icon.alt = ''; icon.loading = 'lazy';
    const title = element('div'); title.append(element('h3', '', app.name), element('p', 'developer', app.developerName));
    top.append(icon, title);
    const meta = element('div', 'meta');
    meta.append(element('span', '', `v${version.version}`), element('span', '', `iOS ${version.minOSVersion || '—'}+`));
    if (app.name === 'SideInstaller') meta.append(element('span', '', 'Auto-Updates'));
    const bottom = element('div', 'app-bottom');
    const download = element('a', 'download', 'IPA laden ↓'); download.href = version.downloadURL;
    bottom.append(element('span', '', `${(version.size / 1048576).toLocaleString('de-DE', {maximumFractionDigits: 1})} MB`), download);
    card.append(top, element('p', 'app-description', app.localizedDescription), meta, bottom);
    container.append(card);
  }
  if (!visible.length) container.append(element('p', '', 'Keine passende App gefunden.'));
}
document.querySelector('#search').addEventListener('input', render);
document.querySelector('#copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(sourceURL); document.querySelector('#copy-status').textContent = 'Source-URL kopiert.'; }
  catch { document.querySelector('#copy-status').textContent = 'Bitte die Source-URL oben markieren und kopieren.'; }
});
fetch('./source.json').then(response => { if (!response.ok) throw new Error('Catalog unavailable'); return response.json(); })
  .then(source => { apps = source.apps; document.querySelector('#count').textContent = `${apps.length} Apps`; render(); })
  .catch(() => { container.replaceChildren(element('p', '', 'Der Katalog konnte nicht geladen werden. Bitte lade die Seite erneut.')); });
