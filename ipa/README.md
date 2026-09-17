IPAs hier ablegen, dann auf macOS ausführen:

    python3 scripts/source.py import --publish
    git add source.json catalog assets apps.json
    git commit -m "Update app catalog"
    git push

Voraussetzung: `gh auth login`. IPAs bleiben lokal und werden als unveränderliche
GitHub-Release-Assets hochgeladen; sie gehören nicht in Git (100-MB-Limit).
Für Updates muss die App eine höhere Version oder Buildnummer enthalten.
