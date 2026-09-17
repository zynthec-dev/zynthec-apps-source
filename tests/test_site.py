import pathlib, plistlib, subprocess, sys, unittest
ROOT=pathlib.Path(__file__).resolve().parent.parent
class SiteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        subprocess.run([sys.executable,str(ROOT/'scripts/build_site.py')],check=True,capture_output=True)
    def test_landing_and_admin_remain_separate(self):
        out=ROOT/'dist'; html=(out/'index.html').read_text()
        self.assertIn('zynthecApp',html)
        self.assertEqual(html.count('id="collection"'),1)
        self.assertEqual(html.count('id="apps"'),1)
        self.assertNotIn('id="login-form"',html)
        self.assertIn('id="login-form"',(out/'admin.html').read_text())
        self.assertTrue((out/'source.json').exists())
        self.assertNotIn('downloadURL',(out/'landing-v4.js').read_text())
        self.assertNotIn('IPA herunterladen',(out/'landing-v4.js').read_text())
        for scheme in ['altstore','sidestore','livecontainer']:
            self.assertIn(scheme+'://source?url=https%3A%2F%2Fapp.zynthec.com%2Fsource.json',html)
    def test_profile_only_contains_removable_webclip(self):
        out=ROOT/'dist'; profile=plistlib.loads((out/'zynthecApp.mobileconfig').read_bytes())
        self.assertEqual(len(profile['PayloadContent']),1)
        clip=profile['PayloadContent'][0]
        self.assertEqual(clip['PayloadType'],'com.apple.webClip.managed')
        self.assertTrue(clip['IsRemovable'])
        self.assertEqual(clip['URL'],'https://app.zynthec.com/install.html')
        self.assertIn('disabled',(out/'install.html').read_text())
