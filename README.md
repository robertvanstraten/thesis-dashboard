# Scriptiedashboard

Statische app (HTML/CSS/JS, geen build-stap) voor thesis.robert.amsterdam via GitHub Pages.
De pagina zelf bevat geen scriptie-inhoud. Alles wordt na inloggen live geladen uit de private
repo `robertvanstraten/thesis` (branch `dashboard`), met een fine-grained GitHub-token dat alleen
in de browser van dat apparaat staat. Zonder repo-toegang zie je alleen het inlogscherm.

Schermen: **Overzicht** (voortgang, status per hoofdstuk), **To-do** (taken + subtaken),
**Maandag** (gedaan sinds vorige meeting, agenda, bespreekpunten, archief), **Literatuur**
(samenvattingen + labels) en **Feed** (nieuwe papers, eigen activiteit, micro-taken).

## Lokaal testen (zonder je echte repo aan te raken)

```bash
python3 dev/mock_api.py --data ../thesis-dashboard-data --git ../thesis
# open http://localhost:8765/?mock en log in met een willekeurig token, bv. "test"
```

De mock werkt op een kopie van de data. Een andere API-basis wordt alleen op localhost geaccepteerd.

## Structuur

- `js/github.js`: contents-API (lezen/schrijven) en commits
- `js/store.js`: cache, wachtrij met wijzigingen, één commit per ~1 s, conflicten oplossen
- `js/ops.js`: alle wijzigingen als kleine, herhaalbare operaties
- `js/views/*`: de vijf schermen
- `CNAME`: custom domain voor GitHub Pages
