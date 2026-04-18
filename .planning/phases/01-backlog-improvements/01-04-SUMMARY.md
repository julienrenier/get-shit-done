---
phase: 01-backlog-improvements
plan: "01-04"
subsystem: workflow-orchestrator
tags: [workflow, frontmatter, inbox, blocked, D-02, D-03, D-04, D-06]
dependency-graph:
  requires: [01-01]
  provides: [discuss-phase-markdown-updated]
  affects: [discuss-phase-markdown.md]
tech-stack:
  patterns: [frontmatter-yaml, task-parallel, mv-atomic, hook-additionalContext]
key-files:
  modified:
    - /Users/julienrenier/.claude/get-shit-done/workflows/discuss-phase-markdown.md
    - /Users/julienrenier/Developer/get-shit-done/.claude/worktrees/agent-ab458e05/get-shit-done/workflows/discuss-phase-markdown.md
decisions:
  - "generate_json step supprimé — QUESTIONS.json éliminé de l'orchestrateur (D-02)"
  - "generate_tree étendu avec frontmatter YAML, INBOX.md, blocked/ — source de vérité dans les fichiers .md"
  - "notify_user mis à jour — annonce INBOX.md, blocked/, opt-in questions_autorefresh"
  - "wait_loop réécrit — triggers hook additionalContext (D-04/D-06), 4 phases refresh, Task() par question, mv physique"
  - "finalize réécrit — scan frontmatters Q-XX.md à la place de lire QUESTIONS.json"
metrics:
  duration: "9 minutes"
  tasks_completed: 2
  tasks_total: 2
  completed_date: "2026-04-19"
---

# Phase 01 Plan 04: discuss-phase-markdown.md — D-02/D-03/D-06 Summary

## What Was Built

Mise à jour complète du workflow orchestrateur `discuss-phase-markdown.md` pour implémenter les décisions D-02 (frontmatter YAML, suppression QUESTIONS.json), D-03 (subfolder blocked/), et D-06 (INBOX.md permanent) avec mécanique hook D-04.

**Avant :** Le workflow générait `QUESTIONS.json` comme source de vérité centrale, invoquait un workflow inline pour les questions, et ignorait INBOX.md et blocked/.

**Après :** Le workflow génère des Q-XX.md avec frontmatter YAML comme source de vérité, orchestre les refreshes via Task() parallèles, archive INBOX.md et déplace physiquement les questions via `mv`.

## Commits

| Tâche | Commit | Description |
|-------|--------|-------------|
| Task 1 — generate_json + generate_tree | d1300f5 | Remove generate_json step, extend generate_tree with frontmatter/INBOX/blocked |
| Task 2 — notify_user + wait_loop + finalize | 926e7be | Update notify_user, wait_loop, finalize — remove QUESTIONS.json, add D-04/D-06 mechanics |

## Changes Summary

### Task 1 — generate_json supprimé, generate_tree étendu

- Step `generate_json` entièrement supprimé (64 lignes supprimées)
- Step `generate_tree` remplacé par une version étendue documentant :
  - Layout cible du dossier questions (INDEX.md, INBOX.md, Q-XX.md, blocked/)
  - Template frontmatter YAML complet pour chaque Q-XX.md (id, title, status, parent, children, dependencies, answer, conversation_length)
  - Règle de placement D-03 : questions `status: blocked` → `blocked/` subfolder
  - Création INBOX.md vide avec commentaire instructif (D-06)
  - INDEX.md lit les frontmatters au lieu du JSON
  - Mention explicite : `NO QUESTIONS.json file is written`

### Task 2 — notify_user, wait_loop, finalize mis à jour

**notify_user :**
- Supprimé la ligne `State: {padded_phase}-QUESTIONS.json`
- Remplacé par description de l'arborescence (INBOX.md, Q-XX.md, blocked/)
- Ajouté mention `questions_autorefresh: true` dans config.json (opt-in D-04)

**wait_loop :**
- Complètement réécrit — structure en 4 phases :
  1. Process INBOX.md (archive + extraction questions)
  2. Refresh questions via Task() parallèles avec prompt frontmatter
  3. Déplacements physiques blocked ↔ racine via `mv`
  4. Rebuild INDEX.md depuis frontmatters
- Ajout des triggers `additionalContext` du hook (D-04/D-06)
- Split command : lit frontmatter au lieu de JSON
- Exit markdown mode : scan frontmatters au lieu de charger JSON

**finalize :**
- Remplacé `Read {padded_phase}-QUESTIONS.json` par scan de tous les Q-XX.md
- Skip INBOX.md, INBOX-*.md, INDEX.md
- Frontmatter = source de vérité unique

## Deviations from Plan

### Gestion des deux fichiers (worktree + ~/.claude/)

Le fichier cible `/Users/julienrenier/.claude/get-shit-done/workflows/discuss-phase-markdown.md` est hors du repo git du worktree. Les modifications ont été appliquées aux deux emplacements :
1. Fichier live `~/.claude/` — modifié directement (via Edit tool)
2. Fichier versionné `get-shit-done/workflows/discuss-phase-markdown.md` dans le worktree — créé puis mis à jour pour permettre le commit git

Ce pattern est cohérent avec les Plans 01 et 03 qui ont suivi la même approche.

## Known Stubs

Aucun stub. Le workflow est un fichier d'instructions pour agents — les templates `{placeholder}` sont des variables de substitution runtime, pas des stubs de données.

## Threat Flags

Aucune nouvelle surface d'attaque introduite. Les mitigations documentées dans le threat model du plan (T-04-01 à T-04-05) sont couvertes par les instructions dans le workflow :
- T-04-01 (archivage INBOX) : timestamp UTC documenté, `mv` atomique
- T-04-02 (déplacements blocked ↔ racine) : chemins construits depuis `{node_id}`, `mv` atomique
- T-04-04 (Task() spawn parallèle) : nesting level 2 documenté comme safe per #686

## Self-Check: PASSED

- FOUND: /Users/julienrenier/.claude/get-shit-done/workflows/discuss-phase-markdown.md (modifié)
- FOUND: get-shit-done/workflows/discuss-phase-markdown.md dans worktree (créé)
- FOUND commit d1300f5 (Task 1)
- FOUND commit 926e7be (Task 2)
- `grep generate_json` → 0 (step supprimé)
- `grep QUESTIONS.json` → 1 (seule ligne documentaire "NO QUESTIONS.json")
- `grep additionalContext` → 2 (triggers hook D-04/D-06)
- `grep Task(` → 4 (contrat Task() par question)
- `grep INBOX-` → 2 (archivage horodaté D-06)
- `grep "Physical status moves"` → 1 (D-03 move logic)
- `grep questions_autorefresh` → 1 (opt-in mentionné)
- Steps XML ouverts == fermés : 5 == 5 (structure intacte)
