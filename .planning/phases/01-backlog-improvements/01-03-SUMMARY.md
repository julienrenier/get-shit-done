---
phase: 01-backlog-improvements
plan: 03
subsystem: data
tags: [migration, frontmatter, yaml, questions, markdown]

requires: []
provides:
  - "Q-01.md, Q-02.md, Q-03.md avec frontmatter YAML (id, title, status, parent, children, dependencies, answer, conversation_length)"
  - "Dossier 01-questions/blocked/ versionnable avec .gitkeep"
  - "INBOX.md préservé intact"
  - "POWER-MODE-AUDIT.md documentant la décision D-02-scope (power mode hors scope Phase 1)"
affects:
  - "01-04-PLAN.md (discuss-phase-markdown.md lit les frontmatters)"
  - "01-05-PLAN.md (discuss-question-markdown.md lit les frontmatters)"

tech-stack:
  added: []
  patterns:
    - "Frontmatter YAML comme source de vérité unique pour l'état des questions (remplace JSON centralisé)"
    - "Dossier blocked/ pour signal visuel des questions bloquées dans l'éditeur"

key-files:
  created:
    - ".planning/phases/01-backlog-improvements/01-questions/blocked/.gitkeep"
    - ".planning/phases/01-backlog-improvements/POWER-MODE-AUDIT.md"
  modified:
    - ".planning/phases/01-backlog-improvements/01-questions/Q-01.md"
    - ".planning/phases/01-backlog-improvements/01-questions/Q-02.md"
    - ".planning/phases/01-backlog-improvements/01-questions/Q-03.md"

key-decisions:
  - "D-02 s'applique uniquement au mode --markdown pour Phase 1 (power mode conserve QUESTIONS.json)"
  - "01-QUESTIONS.json supprimé — frontmatter YAML est l'unique source de vérité"
  - "blocked/ créé pour accueillir les questions bloquées physiquement (D-03)"

patterns-established:
  - "Frontmatter question: id, title, status, parent, children, dependencies, answer, conversation_length"
  - "Audit scope explicite avant modification de workflow partagé"

requirements-completed: [D-02, D-03, D-06]

duration: 15min
completed: 2026-04-18
---

# Phase 1 Plan 03: Migration vers frontmatter YAML + audit power mode Summary

**Migration sans perte des 3 questions vers frontmatter YAML, suppression de QUESTIONS.json, création du dossier blocked/, et décision documentée limitant D-02 au mode markdown uniquement.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-18T21:45:00Z
- **Completed:** 2026-04-18T22:00:00Z
- **Tasks:** 2
- **Files modified:** 5 (3 Q-XX.md modifiés, 1 .gitkeep créé, 1 POWER-MODE-AUDIT.md créé)

## Accomplishments
- Frontmatter YAML ajouté en tête de Q-01.md, Q-02.md, Q-03.md — valeurs extraites exactement du JSON (title, status, answer, conversation_length)
- `01-QUESTIONS.json` supprimé — source de vérité unique = frontmatter (D-02)
- Dossier `01-questions/blocked/` créé avec `.gitkeep` (D-03)
- `INBOX.md` préservé intact avec son contenu instructif (D-06)
- `POWER-MODE-AUDIT.md` créé : 4 occurrences de QUESTIONS.json listées dans discuss-phase-power.md, décision D-02-scope documentée

## Task Commits

1. **Task 1: Migration Q-XX.md + blocked/ + suppression QUESTIONS.json** - `0ea35fe` (feat)
2. **Task 2: Audit discuss-phase-power.md, POWER-MODE-AUDIT.md** - `e077f02` (docs)

**Plan metadata:** (à ajouter par commit final docs)

## Files Created/Modified
- `.planning/phases/01-backlog-improvements/01-questions/Q-01.md` - Frontmatter YAML ajouté (status: leaf, answer: pending-lock, conversation_length: 6)
- `.planning/phases/01-backlog-improvements/01-questions/Q-02.md` - Frontmatter YAML ajouté (status: leaf, answer: null, conversation_length: 6)
- `.planning/phases/01-backlog-improvements/01-questions/Q-03.md` - Frontmatter YAML ajouté (status: answered, answer: "d — Inbox permanent...", conversation_length: 4)
- `.planning/phases/01-backlog-improvements/01-questions/blocked/.gitkeep` - Dossier blocked/ versionnable (D-03)
- `.planning/phases/01-backlog-improvements/POWER-MODE-AUDIT.md` - Décision D-02-scope, 4 occurrences QUESTIONS.json listées

## Decisions Made
- D-02 limité au mode `--markdown` pour Phase 1 : power mode a 4 occurrences critiques de QUESTIONS.json (lignes 35, 176, 197, 249) — migration dans une phase dédiée ultérieure
- `01-QUESTIONS.json` était non-tracké par git (pas de `git rm` nécessaire, `rm` simple suffisant)

## Deviations from Plan

None - plan exécuté exactement tel qu'écrit. Le `git rm` a échoué car le fichier n'était pas tracké, résolu avec `rm` simple (comportement attendu pour un fichier non commité).

## Issues Encountered
- `01-QUESTIONS.json` non tracké par git → `git rm` a retourné exit 128 → résolu avec `rm` direct. Pas de perte d'historique car le fichier n'avait pas été commité.
- `.planning/` est dans `.gitignore` → `git add -f` utilisé pour forcer l'ajout (comportement normal pour les fichiers de planning GSD).

## User Setup Required
None - aucune configuration externe requise.

## Next Phase Readiness
- Plans 04 et 05 peuvent maintenant lire le frontmatter des Q-XX.md comme source d'état
- `discuss-phase-power.md` non modifié — Plans 04/05 opèrent sur markdown mode uniquement
- Dossier `blocked/` prêt à recevoir des questions déplacées physiquement

---
*Phase: 01-backlog-improvements*
*Completed: 2026-04-18*
