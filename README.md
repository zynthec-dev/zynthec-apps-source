# zynthec Apps

Dunkelgrüne Source für **SideStore und AltStore Classic** (kein AltStore PAL).

- Website: https://sideload.zynthec.com
- Source: https://sideload.zynthec.com/source.json
- GitHub-Source: https://zynthec-dev.github.io/zynthec-ios-app-source/source-github.json
- GitHub Pages: https://zynthec-dev.github.io/zynthec-ios-app-source/
- IPAs: https://github.com/zynthec-dev/zynthec-ios-app-source/releases/tag/apps

## Online-Verwaltung

Öffne **https://sideload.zynthec.com/admin**. Die Anmeldung verwendet einen
GitHub Fine-grained personal access token für `zynthec-dev`, beschränkt auf
`zynthec-ios-app-source`, mit **Contents: Read and write** und
**Actions: Read and write**. Eine Anleitung steht direkt auf der Login-Seite.
Der Schlüssel bleibt nur im Arbeitsspeicher des Tabs und wird über die eigene
Cloudflare-API an GitHub weitergereicht. Kein Passwort und kein Schlüssel wird
serverseitig gespeichert. Nach Neuladen des Tabs erneut anmelden.

- **Hinzufügen / Update:** „App hinzufügen“ → IPA bis 512 MB auswählen →
  „Hochladen & veröffentlichen“. Metadaten und Icons werden automatisch gelesen.
- **Entfernen:** „Entfernen“ blendet die App aus Source und Website aus.
  „Wiederherstellen“ macht sie wieder sichtbar. Installationen und Release-Dateien
  werden nicht gelöscht. Der Status bleibt auch bei SideInstaller-Updates erhalten.
- **Bearbeiten:** Name, Entwickler, Beschreibung und Kategorie direkt ändern.
- **Status:** Unter „Veröffentlichungen“ den Workflow prüfen. Neue Apps und
  Änderungen erscheinen nach dem Build; anschließend die Source im iPhone aktualisieren.

Uploads gehen in 16-MB-Abschnitten in den nicht veröffentlichten GitHub-Release-Entwurf
`admin-uploads`. SHA-256-Prüfsummen prüfen jeden Abschnitt. GitHub Actions setzt die
IPA zusammen und veröffentlicht den vollständigen Download erst nach erfolgreicher
Metadatenprüfung. Fehlgeschlagene oder abgeschlossene Uploadteile bleiben im Entwurf
für eine mögliche Wiederherstellung und können dort bei Bedarf manuell gelöscht werden.
Der öffentliche `/admin`-Bildschirm enthält keine Zugangsdaten. Jede API-Anfrage
prüft Origin, GitHub-Konto und Repository-Schreibrecht. Änderungen an Texten nutzen
GitHubs Dateiversion zur Konflikterkennung. GitHub-Pages-Besucher werden für die
Verwaltung auf die Cloudflare-Domain verwiesen.

## Neue Apps und Updates

Auf macOS mit Python 3 und GitHub CLI (`brew install gh`, danach `gh auth login`):

1. IPA-Dateien in `ipa/` ablegen bzw. durch neuere Builds ersetzen.
2. `python3 scripts/source.py import --publish` ausführen. Der Import liest Name,
   Bundle-ID, Version, Build, Mindest-iOS, Icons und Berechtigungen aus der IPA.
   Downloads werden mit inhaltsabhängigen Dateinamen in GitHub Releases abgelegt.
3. Optional Namen, Beschreibung, Entwickler und Kategorie in `apps.json` unter der
   Bundle-ID anpassen. Anschließend `python3 scripts/source.py render` ausführen.
4. `python3 -m unittest discover -s tests -v`
5. `git add source.json source-github.json catalog assets apps.json && git commit -m "Update apps" && git push`

Cloudflare Pages veröffentlicht Änderungen an `main` automatisch. Große IPAs werden
absichtlich nicht in Git gespeichert. GitHub Releases unterstützt diese Downloads.
Bereits importierte Dateien werden übersprungen; frühere Versionen bleiben im Katalog.
Für Updates müssen Version oder Buildnummer steigen. Bundle-IDs bleiben unverändert.
IPAs werden nicht neu signiert oder ausgeführt. Ein echter Installationstest erfolgt
auf einem iPhone mit SideStore/AltStore Classic.

## SideInstaller

GitHub Actions prüft stündlich (Minute 17) das neueste stabile Release von
[FrizzleM/SideInstaller](https://github.com/FrizzleM/SideInstaller/releases).
Die IPA wird für ihre tatsächlichen Metadaten gelesen, die Source aktualisiert und
committet. Downloads bleiben direkt beim Originalprojekt. Prereleases werden nicht
übernommen. Ein unveränderter Release erzeugt keinen Commit. Fehler lassen den zuletzt
veröffentlichten Katalog bestehen und werden im Actions-Lauf angezeigt.

Manuell: Actions → **Update source and publish GitHub Pages** → **Run workflow**
oder lokal `python3 scripts/source.py sync`.

Die tatsächliche Anzeige neuer Versionen hängt auch vom Refresh in SideStore/AltStore
ab. GitHub kann Zeitpläne verzögert ausführen und bei inaktiven öffentlichen Repos nach
60 Tagen abschalten; dann den Workflow unter Actions wieder aktivieren.

## Hosting und Entwicklung

Cloudflare Pages: Projekt `zynthec-ios-app-source`, Branch `main`, Build-Befehl
`python3 scripts/source.py render && python3 scripts/build_site.py`, Ausgabeordner `dist`, Custom Domain
`sideload.zynthec.com`. DNS: proxied CNAME auf `zynthec-ios-app-source.pages.dev`.
GitHub Pages wird zusätzlich über den Workflow veröffentlicht.

Lokal: `python3 scripts/build_site.py && python3 -m http.server 8080 --directory dist`.
Keine Python-Pakete oder npm-Abhängigkeiten erforderlich. Die Admin-API unter `functions/api/` läuft nur auf Cloudflare Pages. Tests: `python3 -m unittest discover -s tests -v` und `node --test tests/admin-api.test.mjs`. `source.json` ist generiert;
App-Texte in `apps.json` bearbeiten. `catalog/` enthält den Versionsverlauf und den
zuletzt synchronisierten SideInstaller-Release. `icon.png` ist das Source-Icon.

Format: https://faq.altstore.io/developers/make-a-source
