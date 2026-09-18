#!/usr/bin/env python3
"""Reassemble authenticated admin uploads; never run code contained in an IPA."""
import datetime, json, os, pathlib, subprocess, tempfile, shutil
from source import ROOT, REPO, gh, hash_file, inspect_ipa, merge, read, render

def validate_manifest(manifest):
    import re
    assets=manifest.get('assets')
    if not isinstance(assets,list) or not 1<=len(assets)<=128 or len(set(assets))!=len(assets) or any(type(a) is not int or a<=0 for a in assets):
        raise ValueError('Invalid upload parts')
    if not isinstance(manifest.get('checksums'),list) or len(manifest['checksums'])!=len(assets) or any(not isinstance(h,str) or not re.fullmatch('[0-9a-f]{64}',h) for h in manifest['checksums']) or type(manifest.get('size')) is not int or not 0<manifest['size']<=512*1024**2:
        raise ValueError('Invalid file size or hash')
    return manifest

def authorize_import(manifest, bundle, catalog):
    allowed = manifest.get('allowUpdate') if bundle in catalog else manifest.get('allowNew')
    if allowed is not True:
        raise ValueError('This account may not update existing apps' if bundle in catalog else 'This account may not add new apps')

def main():
    manifest=validate_manifest(json.loads(os.environ['UPLOAD_MANIFEST']))
    releases=[r for page in json.loads(gh('api','--paginate','--slurp',f'repos/{REPO}/releases?per_page=100')) for r in page]
    release=next(r for r in releases if r['tag_name']=='admin-uploads')
    if not release['draft']: raise ValueError('Upload release must remain a draft')
    rid=release['id']
    available={a['id']:a for page in json.loads(gh('api','--paginate','--slurp',f'repos/{REPO}/releases/{rid}/assets?per_page=100')) for a in page}
    selected=[available[a] for a in manifest['assets']]
    if sum(a['size'] for a in selected)!=manifest['size']: raise ValueError('Upload size mismatch')
    prefix=selected[0]['name'].rsplit('-',1)[0]
    if any(a['name']!=f'{prefix}-{i}.part' for i,a in enumerate(selected)): raise ValueError('Upload part order mismatch')
    with tempfile.TemporaryDirectory() as tmp:
        path=pathlib.Path(tmp)/'app.ipa'
        with path.open('wb') as out:
            for i,asset in enumerate(selected):
                part=pathlib.Path(tmp)/'chunk.part'
                with part.open('wb') as chunk:
                    subprocess.run(['gh','api',f'repos/{REPO}/releases/assets/{asset["id"]}','-H','Accept: application/octet-stream'],stdout=chunk,check=True)
                if hash_file(part)!=manifest['checksums'][i]: raise ValueError('Upload checksum mismatch')
                with part.open('rb') as chunk:
                    shutil.copyfileobj(chunk,out)
        digest=hash_file(path)
        filename=digest[:16]+'.ipa'
        url=f'https://github.com/{REPO}/releases/download/apps/{filename}'
        app,digest=inspect_ipa(path,url,datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'))
        catalog=read(ROOT/'catalog/apps.json',{})
        authorize_import(manifest,app['bundleIdentifier'],catalog)
        merge(catalog,app,digest)
        published=json.loads(gh('release','view','apps','--repo',REPO,'--json','assets'))['assets']
        if filename not in {a['name'] for a in published}:
            final=path.with_name(filename);path.rename(final);gh('release','upload','apps',str(final),'--repo',REPO)
        render(catalog)
        print(f'Imported {app["name"]} {app["versions"][0]["version"]}')
    # Keep staging parts in the private draft for recovery. They can be removed in GitHub.
if __name__=='__main__': main()
