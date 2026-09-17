#!/usr/bin/env python3
import argparse, pathlib, shutil
parser = argparse.ArgumentParser()
parser.add_argument("--base-path", default="")
args = parser.parse_args()
root = pathlib.Path(__file__).resolve().parent.parent
out = root / 'dist'
if out.exists(): shutil.rmtree(out)
shutil.copytree(root / 'site', out)
shutil.copytree(root / 'assets', out / 'assets')
for name in ['source.json', 'icon.png']:
    shutil.copyfile(root / name, out / name)
if args.base_path:
    for page in out.glob('*.html'):
        page.write_text(page.read_text().replace('href="/', 'href="' + args.base_path + '/').replace('src="/', 'src="' + args.base_path + '/'))
print('Built dist/')
