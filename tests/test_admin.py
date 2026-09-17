import copy, importlib.util, json, pathlib, sys, tempfile, unittest
from unittest.mock import patch
ROOT=pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'scripts'))
import source
from import_upload import validate_manifest
class AdminTests(unittest.TestCase):
    def test_removed_app_stays_hidden_when_catalog_updates(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(source,'ROOT',pathlib.Path(tmp)):
            path=pathlib.Path(tmp)
            catalog={'test.app':{'sha256':'a','app':{'name':'Test','bundleIdentifier':'test.app','versions':[{'version':'1','date':'2026-09-17','downloadURL':'https://example.com/a.ipa','size':12}]}}}
            source.write(path/'apps.json',{'test.app':{'enabled':False}})
            source.render(catalog)
            self.assertEqual(source.read(path/'source.json',{})['apps'],[])
            catalog['test.app']['app']['versions'][0]['version']='2'
            source.render(catalog)
            self.assertEqual(source.read(path/'source.json',{})['apps'],[])
            source.write(path/'apps.json',{'test.app':{'enabled':True}})
            source.render(catalog)
            app=source.read(path/'source.json',{})['apps'][0]
            self.assertEqual(app['version'],'2');self.assertNotIn('enabled',app)
    def test_upload_rejects_duplicate_parts_and_bad_checksums(self):
        good={'assets':[1,2],'checksums':['a'*64,'b'*64],'size':100}
        self.assertEqual(validate_manifest(good),good)
        for update in [{'assets':[1,1]},{'checksums':['x']},{'size':513*1024**2},{'assets':[True]}]:
            with self.assertRaises(ValueError):validate_manifest({**good,**update})
