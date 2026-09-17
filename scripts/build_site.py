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
for name in ['source.json', 'source-github.json', 'icon.png']:
    shutil.copyfile(root / name, out / name)
if args.base_path:
    for page in out.glob('*.html'):
        page.write_text(page.read_text().replace('href="/', 'href="' + args.base_path + '/').replace('src="/', 'src="' + args.base_path + '/'))
    for file in [out / 'index.html', out / 'app.js']:
        text = file.read_text().replace('https://sideload.zynthec.com/source.json', 'https://zynthec-dev.github.io/zynthec-ios-app-source/source-github.json')
        text = text.replace('https%3A%2F%2Fsideload.zynthec.com%2Fsource.json', 'https%3A%2F%2Fzynthec-dev.github.io%2Fzynthec-ios-app-source%2Fsource-github.json')
        text = text.replace("fetch('./source.json')", "fetch('./source-github.json')")
        text = text.replace('href="' + args.base_path + '/source.json"', 'href="' + args.base_path + '/source-github.json"')
        file.write_text(text)
print('Built dist/')
