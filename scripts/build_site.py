#!/usr/bin/env python3
import argparse, pathlib, shutil, json, plistlib, hashlib
from source import is_own_app
parser = argparse.ArgumentParser()
parser.add_argument("--base-path", default="")
args = parser.parse_args()
root = pathlib.Path(__file__).resolve().parent.parent
out = root / 'dist'
if out.exists(): shutil.rmtree(out)
shutil.copytree(root / 'site', out)
(out / '_redirects').write_text('/admin.html /admin 302\n')
shutil.copytree(root / 'assets', out / 'assets')
for name in ['source.json', 'icon.png']:
    shutil.copyfile(root / name, out / name)
# Generate OTA manifests from enabled catalog entries, including our own app.
settings = json.loads((root / 'apps.json').read_text())
catalog = json.loads((root / 'catalog/apps.json').read_text())
installations = []
(out / 'install').mkdir(exist_ok=True)
for bundle, record in catalog.items():
    overrides = settings.get(bundle, {})
    if overrides.get('enabled', True) is False:
        continue
    app = {**record['app'], **overrides}
    version = app['versions'][0]
    download = version['downloadURL']
    if not download.startswith('https://'):
        raise ValueError('IPA downloads must use HTTPS')
    filename = hashlib.sha256(bundle.encode()).hexdigest()[:20] + '.plist'
    manifest = {'items': [{'assets': [{'kind': 'software-package', 'url': download}],
        'metadata': {'bundle-identifier': bundle, 'bundle-version': str(version['buildVersion']),
                     'kind': 'software', 'title': app['name']}}]}
    (out / 'install' / filename).write_bytes(plistlib.dumps(manifest))
    installations.append({'bundleIdentifier': bundle, 'name': app['name'],
        'version': version['version'], 'downloadURL': download,
        'manifestURL': 'https://apps.zynthec.com/install/' + filename,
        'ownApp': is_own_app(app)})
(out / 'installations.json').write_text(json.dumps(installations, ensure_ascii=False))
if args.base_path:
    raise SystemExit('Only root-domain Cloudflare publishing is supported.')
print('Built landing page, library and admin dist/')
