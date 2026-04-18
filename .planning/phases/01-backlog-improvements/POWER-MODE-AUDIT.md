---
phase: 01-backlog-improvements
decision_id: D-02-scope
date: 2026-04-18
---

# Audit : Scope de D-02 vs discuss-phase-power.md

## Contexte
D-02 (CONTEXT.md) : remplacer `QUESTIONS.json` par frontmatter YAML dans chaque `.md` question. Portée non explicite pour `--power` mode.

## Occurrences de QUESTIONS.json dans discuss-phase-power.md

Résultat du grep sur `/Users/julienrenier/.claude/get-shit-done/workflows/discuss-phase-power.md` :

| Ligne | Contexte |
|-------|---------|
| 35 | `{phase_dir}/{padded_phase}-QUESTIONS.json` — chemin du fichier d'état déclaré dans le header de variables |
| 176 | `JSON (state file): {phase_dir}/{padded_phase}-QUESTIONS.json` — référence dans la section "State Files" |
| 197 | `1. Read \`{phase_dir}/{padded_phase}-QUESTIONS.json\`` — étape de lecture dans le step "Refresh" |
| 249 | `1. Read \`{phase_dir}/{padded_phase}-QUESTIONS.json\`` — étape de lecture dans le step "Answer/Split" |

Total : **4 occurrences**. Le fichier JSON est la source d'état centrale de tout le workflow power mode — lecture systématique à chaque opération.

## Décision
**D-02 s'applique uniquement au mode `--markdown` pour la Phase 1.**

### Rationnel
- Le mode power est un workflow distinct avec ses propres contraintes (UI web, événements temps-réel).
- Modifier les deux en une seule phase double le blast radius.
- Le Pitfall 5 de RESEARCH.md identifie ce risque — le contenir à markdown mode est prudent.
- Power mode utilise QUESTIONS.json de manière centrale (4 occurrences, dont le chemin de variable principal) — la migration nécessite une phase dédiée avec tests isolés.

### Impact sur la Phase 1
- Plans 04 et 05 modifient `discuss-phase-markdown.md` et `discuss-question-markdown.md` uniquement.
- `discuss-phase-power.md` N'EST PAS modifié dans cette phase.
- `QUESTIONS.json` reste généré par power mode — le fichier supprimé au Plan 03 Task 1 concerne SEULEMENT la phase 01 qui est en mode markdown.

## Follow-up
Créer un todo dans `.planning/todos/pending/` pour une future phase « Power mode : migration vers frontmatter » si la décision est un jour prise d'uniformiser.
