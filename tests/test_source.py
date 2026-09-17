import copy, importlib.util, json, pathlib, plistlib, struct, tempfile, unittest, zipfile
ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('source', ROOT / 'scripts/source.py')
source = importlib.util.module_from_spec(spec); spec.loader.exec_module(source)
class SourceTests(unittest.TestCase):
    def test_entitlements_from_signature(self):
        data = plistlib.dumps({'com.apple.security.application-groups': ['group.test']})
        blob = b'prefix' + b'\xfa\xde\x71\x71' + struct.pack('>I', len(data)+8) + data
        self.assertEqual(source.entitlements(blob), {'com.apple.security.application-groups'})
    def test_ipa_reads_extension_permissions(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp)/'test.ipa'
            info = {'CFBundleIdentifier':'test.app','CFBundleName':'Test','CFBundleExecutable':'Test','CFBundleShortVersionString':'1.2','CFBundleVersion':'7','MinimumOSVersion':'16.0'}
            with zipfile.ZipFile(path,'w') as z:
                z.writestr('Payload/Test.app/Info.plist',plistlib.dumps(info)); z.writestr('Payload/Test.app/Test',b'unsigned')
                z.writestr('Payload/Test.app/PlugIns/X.appex/Info.plist',plistlib.dumps({**info,'NSCameraUsageDescription':'Take photos'})); z.writestr('Payload/Test.app/PlugIns/X.appex/Test',b'unsigned')
            app, digest = source.inspect_ipa(path,'https://example.com/test.ipa','2026-09-17')
            self.assertEqual(app['versions'][0]['buildVersion'],'7')
            self.assertEqual(app['appPermissions']['privacy']['NSCameraUsageDescription'],'Take photos')
            self.assertEqual(len(digest),64)
    def test_updates_and_reject_changed_same_version(self):
        app = {'bundleIdentifier':'test','versions':[{'version':'1.0','buildVersion':'1'}], 'appPermissions': {'entitlements': [], 'privacy': {}}}
        catalog = {}; source.merge(catalog, copy.deepcopy(app), 'a')
        with self.assertRaises(ValueError): source.merge(catalog, copy.deepcopy(app), 'b')
        app['versions'][0]['buildVersion'] = '2'; source.merge(catalog, copy.deepcopy(app), 'c')
        self.assertEqual([v['buildVersion'] for v in catalog['test']['app']['versions']],['2','1'])
        app['versions'][0] = {'version':'0.9','buildVersion':'9'}
        with self.assertRaises(ValueError): source.merge(catalog, app, 'd')
    def test_own_app_excluded_from_feed(self):
        with tempfile.TemporaryDirectory() as tmp:
            original = source.ROOT
            source.ROOT = pathlib.Path(tmp)
            try:
                def entry(bundle):
                    return {'app': {'name': bundle, 'bundleIdentifier': bundle, 'versions': [{'version':'1', 'date':'2026-09-17', 'downloadURL':'https://example.org/app.ipa', 'size':1}]}}
                ids = ['com.zynthec.zynthecApp', 'com.zynthec.zynthecStore.J9XAH3MN77', 'com.zynthec.zManager', 'com.zynthec.mipet', 'org.example.other']
                source.render({key: entry(key) for key in ids})
                actual = json.loads((source.ROOT/'source.json').read_text())
                self.assertEqual({a['bundleIdentifier'] for a in actual['apps']}, set(ids[-2:]))
            finally:
                source.ROOT = original

    def test_published_catalog(self):
        data = json.loads((ROOT/'source.json').read_text())
        settings = json.loads((ROOT/'apps.json').read_text())
        catalog = json.loads((ROOT/'catalog/apps.json').read_text())
        self.assertEqual(len(data['apps']),sum(not source.is_own_app(v['app']) and settings.get(k,{}).get('enabled',True) is not False for k,v in catalog.items()))
        ids = [app['bundleIdentifier'] for app in data['apps']]
        self.assertEqual(len(ids),len(set(ids)))
        for app in data['apps']:
            self.assertTrue(app['appPermissions'].keys() >= {'entitlements','privacy'})
            for v in app['versions']:
                self.assertGreater(v['size'],0); self.assertTrue(v['downloadURL'].startswith('https://'))
            icon = app['iconURL'].removeprefix(source.BASE+'/')
            self.assertTrue((ROOT/icon).is_file())
if __name__ == '__main__': unittest.main()
