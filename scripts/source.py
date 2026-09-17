#!/usr/bin/env python3
"""Import IPA metadata and publish an AltStore Classic / SideStore source. macOS required for icon conversion."""
import argparse, datetime, hashlib, json, pathlib, plistlib, re, shutil, struct, subprocess, tempfile, urllib.parse, zipfile
ROOT = pathlib.Path(__file__).resolve().parent.parent
REPO = 'zynthec-dev/zynthec-ios-sideload-source'
BASE = 'https://app.zynthec.com'

def hash_file(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()

def read(path, default):
    return json.loads(path.read_text()) if path.exists() else default

def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')

def gh(*args):
    return subprocess.check_output(['gh', *args], text=True).strip()

def entitlements(binary):
    result = set()
    offset = 0
    while True:
        offset = binary.find(b'\xfa\xde\x71\x71', offset)
        if offset < 0:
            break
        length = struct.unpack('>I', binary[offset+4:offset+8])[0]
        if 8 < length <= len(binary) - offset:
            try:
                result.update(plistlib.loads(binary[offset+8:offset+length]))
            except (ValueError, plistlib.InvalidFileException):
                pass
        offset += 4
    if not result and b'\xfa\xde\x71\x72' in binary:
        raise ValueError('DER-only entitlements: inspect this IPA before publishing')
    return result

def inspect_ipa(path, url, date):
    digest = hash_file(path)
    with zipfile.ZipFile(path) as z:
        roots = [n for n in z.namelist() if re.fullmatch(r'Payload/[^/]+\.app/Info.plist', n)]
        if len(roots) != 1:
            raise ValueError(f'{path}: expected exactly one main app')
        info = plistlib.loads(z.read(roots[0])); appdir = roots[0].rsplit('/', 1)[0]
        bundle = info['CFBundleIdentifier']
        permissions, privacy = set(), {}
        for n in z.namelist():
            if n.startswith(appdir + '/') and (n.endswith('.app/Info.plist') or n.endswith('.appex/Info.plist')):
                p = plistlib.loads(z.read(n))
                privacy.update({k: v for k, v in p.items() if 'UsageDescription' in k and isinstance(v, str)})
                executable = n.rsplit('/', 1)[0] + '/' + p['CFBundleExecutable']
                permissions.update(entitlements(z.read(executable)))
        icon_url = BASE + '/icon.png'
        names = info.get('CFBundleIcons', {}).get('CFBundlePrimaryIcon', {}).get('CFBundleIconFiles', info.get('CFBundleIconFiles', []))
        candidates = [n for n in z.namelist() if n.startswith(appdir + '/') and n.count('/') == 2 and n.endswith('.png') and any(pathlib.PurePosixPath(n).name.startswith(s) for s in names)]
        if candidates:
            best = max(candidates, key=lambda n: z.getinfo(n).file_size)
            out = ROOT / 'assets/icons' / (hashlib.sha256(bundle.encode()).hexdigest()[:16] + '.png')
            out.parent.mkdir(parents=True, exist_ok=True)
            data = z.read(best)
            if b'CgBI' in data[:32]:
                with tempfile.TemporaryDirectory() as tmp:
                    raw = pathlib.Path(tmp) / 'icon.png'; raw.write_bytes(data)
                    subprocess.run(['sips', '-s', 'format', 'png', str(raw), '--out', str(out)], check=True, capture_output=True)
            else:
                out.write_bytes(data)
            icon_url = BASE + '/' + str(out.relative_to(ROOT))
        version = {'version': str(info['CFBundleShortVersionString']), 'buildVersion': str(info['CFBundleVersion']), 'date': date, 'downloadURL': url, 'size': path.stat().st_size}
        if info.get('MinimumOSVersion'):
            version['minOSVersion'] = info['MinimumOSVersion']
        app = {'name': info.get('CFBundleDisplayName') or info['CFBundleName'], 'bundleIdentifier': bundle, 'developerName': 'Entwickler der jeweiligen App', 'localizedDescription': 'Bereitgestellt in der zynthec Apps Source.', 'iconURL': icon_url, 'tintColor': '#165C40', 'versions': [version], 'appPermissions': {'entitlements': sorted(permissions), 'privacy': privacy}}
        return app, digest

def merge(catalog, app, digest):
    key = app['bundleIdentifier']
    old = catalog.get(key)
    if old:
        version = app['versions'][0]
        same = [v for v in old['app']['versions'] if (v['version'], v['buildVersion']) == (version['version'], version['buildVersion'])]
        if same and old['sha256'] != digest:
            raise ValueError(f'{key}: IPA changed without a version/build increase; use a new build number')
        if same:
            return
        def version_key(v):
            return tuple((1, int(p)) if p.isdigit() else (0, p) for p in re.findall(r'\d+|[^\d]+', v['version'] + '.' + v['buildVersion']))
        if version_key(version) <= version_key(old['app']['versions'][0]):
            raise ValueError(f'{key}: new version/build must be greater than the current version')
        app['versions'] += old['app']['versions']
        app['appPermissions']['entitlements'] = sorted(set(app['appPermissions']['entitlements']) | set(old['app']['appPermissions']['entitlements']))
        app['appPermissions']['privacy'] = {**old['app']['appPermissions']['privacy'], **app['appPermissions']['privacy']}
    catalog[key] = {'sha256': digest, 'app': app}

def is_own_app(app):
    # Own application is distributed separately from the third-party source.
    bundle = app.get('bundleIdentifier', '').lower()
    roots = ('com.zynthec.zynthecapp', 'com.zynthec.zynthecstore', 'com.zynthec.zmanager')
    return any(bundle == root or bundle.startswith(root + '.') for root in roots)

def render(catalog):
    overrides = read(ROOT / 'apps.json', {})
    apps = []
    for key, record in sorted(catalog.items(), key=lambda item: item[1]['app']['name'].lower()):
        settings = overrides.get(key, {})
        if is_own_app(record['app']) or settings.get('enabled', True) is False:
            continue
        app = {**record['app'], **{k:v for k,v in settings.items() if k != 'enabled'}}
        latest = app['versions'][0]
        app.update(version=latest['version'], versionDate=latest['date'], downloadURL=latest['downloadURL'], size=latest['size'])
        apps.append(app)
    source = {'name': 'zynthec Apps', 'identifier': 'com.zynthec.apps', 'sourceURL': BASE + '/source.json', 'subtitle': 'Deine Apps. Deine Wahl.', 'description': 'Die zynthec App-Sammlung für SideStore und AltStore Classic. Mit automatischen SideInstaller-Updates.', 'iconURL': BASE + '/icon.png', 'website': BASE, 'tintColor': '#165C40', 'apps': apps, 'news': []}
    write(ROOT / 'source.json', source)
    github_source = json.loads(json.dumps(source).replace(BASE, 'https://zynthec-dev.github.io/zynthec-ios-sideload-source'))
    github_source['sourceURL'] = 'https://zynthec-dev.github.io/zynthec-ios-sideload-source/source-github.json'
    write(ROOT / 'source-github.json', github_source)
    write(ROOT / 'catalog/apps.json', catalog)

def import_local(publish=False):
    catalog = read(ROOT / 'catalog/apps.json', {})
    uploaded = {}
    if publish:
        release = json.loads(gh('release', 'view', 'apps', '--repo', REPO, '--json', 'assets'))
        uploaded = {a['name']: a for a in release['assets']}
    for path in sorted((ROOT / 'ipa').glob('*.ipa')):
        digest = hash_file(path)
        asset = digest[:16] + '.ipa'
        if any(x['sha256'] == digest for x in catalog.values()):
            if publish and asset not in uploaded:
                with tempfile.TemporaryDirectory() as tmp:
                    target = pathlib.Path(tmp) / asset; shutil.copyfile(path, target)
                    gh('release', 'upload', 'apps', str(target), '--repo', REPO)
            continue
        url = f'https://github.com/{REPO}/releases/download/apps/{asset}'
        app, digest = inspect_ipa(path, url, datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'))
        merge(catalog, app, digest)
        if publish and asset not in uploaded:
            with tempfile.TemporaryDirectory() as tmp:
                target = pathlib.Path(tmp) / asset; shutil.copyfile(path, target)
                gh('release', 'upload', 'apps', str(target), '--repo', REPO)
        print(f"Imported {app['name']} {app['versions'][0]['version']}")
    render(catalog)

def sync_sideinstaller():
    release = json.loads(gh('api', 'repos/FrizzleM/SideInstaller/releases/latest'))
    assets = [a for a in release['assets'] if a['name'].lower().endswith('.ipa')]
    if len(assets) != 1:
        raise ValueError('Expected exactly one stable SideInstaller IPA')
    asset = assets[0]
    state = read(ROOT / 'catalog/sideinstaller.json', {})
    identity = {'release': release['id'], 'asset': asset['id'], 'updated_at': asset['updated_at']}
    if state == identity:
        print('SideInstaller is current'); return
    with tempfile.TemporaryDirectory() as tmp:
        gh('release', 'download', release['tag_name'], '--repo', 'FrizzleM/SideInstaller', '--pattern', asset['name'], '--dir', tmp)
        app, digest = inspect_ipa(pathlib.Path(tmp) / asset['name'], asset['browser_download_url'], release['published_at'])
    app.update(developerName='FrizzleM', localizedDescription='SideInstaller von FrizzleM. Neue stabile GitHub-Releases werden automatisch in dieser Source angeboten.')
    app['versions'][0]['localizedDescription'] = release.get('body') or release['tag_name']
    catalog = read(ROOT / 'catalog/apps.json', {})
    merge(catalog, app, digest); render(catalog)
    write(ROOT / 'catalog/sideinstaller.json', identity)
    print(f"SideInstaller synchronized: {release['tag_name']}")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('command', choices=['import', 'sync', 'render']); parser.add_argument('--publish', action='store_true'); args = parser.parse_args()
    if args.command == 'import': import_local(args.publish)
    elif args.command == 'sync': sync_sideinstaller()
    else: render(read(ROOT / 'catalog/apps.json', {}))
