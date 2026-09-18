# zynthec Apps – Verwaltungsaccounts

## Anmeldung

Die Verwaltung liegt auf `https://storage.zynthec.com/admin`. Sie ist unabhängig von Apple-Accounts, Apple-Zertifikaten und Provisioning-Profilen.

- Master-Admin: ausschließlich das GitHub-Konto `zynthec-dev`, Anmeldung über den GitHub-Token. GitHub muss Schreibzugriff auf `zynthec-dev/zynthec-apps-source` bestätigen.
- Team: E-Mail-Adresse und persönliches Passwort (12–256 Zeichen). Es gibt keine öffentliche Registrierung.
- Der Master-Admin bleibt geschützt: Team-Verwaltung darf ihn weder sperren noch zurücksetzen oder verändern.
- Der GitHub-Token wird beim Master-Login mit AES-GCM verschlüsselt in D1 gespeichert; der Schlüssel liegt als Cloudflare-Secret `AUTH_KEY` vor. Teammitglieder bekommen den Token nie zurück. Einen Fine-grained Token nur für dieses Repository mit Contents/Actions Read and write verwenden.

## Rechte

Jeder aktive Account kann den Katalog lesen. Zusätzliche Rechte werden einzeln vergeben:

| Recht | Wirkung |
|---|---|
| `apps.upload` | Neue Apps importieren |
| `apps.update` | Bestehende Apps aktualisieren, Texte ändern, Upstream-Sync starten |
| `apps.remove` | Apps aus Source ausblenden oder wiederherstellen; keine Release-Dateien löschen |
| `users.manage` | Team-Accounts, Einrichtungslinks und Rechte verwalten (weitreichendes Administrationsrecht) |

Die Rechte gelten serverseitig. Die Import-Pipeline kontrolliert zusätzlich anhand der tatsächlichen IPA-Bundle-ID, ob neue Apps oder Updates erlaubt sind. Uploadteile gehören jeweils dem hochladenden Account. Rechteänderungen und Sperren beenden dessen Sitzungen sofort. Bereits gestartete Veröffentlichungsjobs werden nicht rückwirkend abgebrochen.

Neue Accounts erhalten einen einmaligen Einrichtungslink (24 Stunden). Passwort-Reset-Links gelten eine Stunde. Links werden manuell weitergegeben, es werden keine E-Mails versendet. Die Berechtigung gilt für den Besitzer des Links; nur persönlich an das richtige Teammitglied weitergeben.

## Native zynthecApp

Im App-Projekt unter Einstellungen → Verwaltung einen eigenen Verwaltungsaccount führen. Keine Verbindung zu gespeicherten Apple-Accounts herstellen. Die native Oberfläche ist in diesem Website-Repository nicht implementiert.

API-Basis: `https://storage.zynthec.com/api/`. Alle Endpunkte verwenden POST, JSON (außer binäre Uploadteile), den exakten Header `Origin: https://storage.zynthec.com` und eine separate Cookie-Verwaltung für diese Domain. Alternativ lässt sich die bestehende Admin-Web-App in einem eigenen WKWebView öffnen. Niemals Apple-Anmeldedaten an diese API senden.

- `github-login`: `{token}` (nur Master); Schlüssel nach dem Request im Client verwerfen.
- `login`: `{email,password}` (Team).
- `session`: `{}` → `{user:{id,name,email,owner,permissions,active,pending}}`.
- `logout`: `{}` beendet die Sitzung serverseitig.
- `activate`: `{invite,password}`; Link-Token aus dem URL-Fragment entnehmen.
- `users`, `users/create`, `users/update`, `users/reset`: Teamverwaltung.
- `catalog`, `settings`, `chunk`, `import`, `runs`, `sync`: App-Verwaltung.

Sitzungscookie: `__Host-zynthec_session`, Secure, HttpOnly, SameSite=Strict, 8 Stunden. Kein GitHub-Token in UserDefaults, Browser-Storage oder Apple-Keychain-Accounts speichern. Native Sitzungen getrennt halten; keine Rechte ausschließlich im Client prüfen.

## Betrieb

D1-Binding `ADMIN_DB`: Datenbank `zynthec-admin`, EU. Schema in `migrations/0001_admin.sql`. Secret `AUTH_KEY`: 32 zufällige Bytes als Hex; nicht ohne Migrationsplan rotieren (Passwort-Pepper und GitHub-Verschlüsselung). Passwörter: PBKDF2-SHA256 mit individuellem Salt und serverseitigem HMAC-Pepper. Anmeldungen sind pro IP und E-Mail begrenzt. Sitzungen liegen nur gehasht in der Datenbank. Accounts, Rechteänderungen und Importstarts werden protokolliert.

Derzeit öffentlich mit Anmeldung. Kein Tailscale-Zugang und kein localhost-only-Betrieb eingerichtet. Auch der Source-Download aus privaten GitHub-Releases wird durch diese Authentifizierung nicht öffentlich verfügbar.

Tests: `node --test tests/admin-api.test.mjs` (Node 24+) und `python3 -m unittest discover -s tests -v`.
