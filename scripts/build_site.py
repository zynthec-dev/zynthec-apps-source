#!/usr/bin/env python3
import argparse, pathlib, shutil
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
if args.base_path:
    raise SystemExit('Only root-domain Cloudflare publishing is supported.')
print('Built landing page, library and admin dist/')
