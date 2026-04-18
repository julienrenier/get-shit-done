---
phase: 01-backlog-improvements
plan: "01-05"
subsystem: workflows
tags: [workflow, task, frontmatter, subagent, D-02, D-05]
dependency-graph:
  requires: [01-01]
  provides: [discuss-question-markdown Task() subagent conforme D-02 + D-05]
  affects: [discuss-phase-markdown.md wait_loop, DAG cascade via frontmatter]
tech-stack:
  added: []
  patterns: [frontmatter-yaml, task-subagent, dag-cascade]
key-files:
  created:
    - /Users/julienrenier/.claude/get-shit-done/workflows/discuss-question-markdown.md
    - get-shit-done/workflows/discuss-question-markdown.md
  modified: []
  deleted:
    - get-shit-done/workflows/discuss-question-file.md
decisions:
  - "D-02 appliqué : frontmatter YAML est la source de vérité unique — plus de QUESTIONS.json"
  - "D-05 appliqué : invocation Task() avec contexte isolé par question, pas @workflow inline"
  - "Contrainte nesting #686 documentée explicitement dans l'invocation"
metrics:
  duration: "5 minutes"
  completed: "2026-04-18T22:00:39Z"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 2
---

# Phase 01 Plan 05: discuss-question-markdown Refactor Summary

## What Was Built

Refactorisation complète de `discuss-question-markdown.md` pour implémenter D-02 (frontmatter YAML comme source de vérité, suppression de QUESTIONS.json) et D-05 (invocation Task() avec contexte isolé par question).

Le workflow est désormais un subagent Task() propre : il reçoit un `file_path`, parse le frontmatter YAML, traite la conversation, persiste via frontmatter in-place, et retourne `{ id, newStatus, answerLocked, conversationAdded }`.

## Commits

| Tâche | Commit | Description |
|-------|--------|-------------|
| T1 + T2 | add603c | feat(01-05): refactor discuss-question-markdown — Task() + frontmatter (D-02/D-05) |

## Modifications détaillées

### Section `<invocation>` (Tâche 1)
- Remplace la référence `@workflow` inline par une déclaration Task() subagent explicite
- Supprime le pointer vers `{padded_phase}-QUESTIONS.json`
- Documente le return contract `{ id, newStatus, answerLocked, conversationAdded }`
- Documente la contrainte nesting #686 (pas de Task() imbriqués — niveau 2 max)

### Section `<step name="read">` (Tâche 1)
- Remplace le chargement depuis JSON par le parsing du bloc frontmatter YAML `--- ... ---`
- Liste les champs à extraire : `id`, `title`, `status`, `parent`, `children`, `dependencies`, `answer`, `conversation_length`
- Affirme explicitement : "The frontmatter is the CANONICAL STATE — there is NO JSON to load"

### Section `<step name="reply">` (Tâche 2)
- Ajoute un bloc **Persistence (D-02)** : incrémenter `conversation_length`, re-sauvegarder le `.md`
- Supprime la référence à `node.conversation` dans le JSON

### Section `<step name="handle_split">` (Tâche 2)
- Remplace l'écriture dans `nodes` map JSON par la création de fichiers enfants avec frontmatter complet
- Documente le template frontmatter enfant (`id`, `title`, `status: leaf`, `parent`, `children: []`, `dependencies: []`, `answer: null`, `conversation_length: 0`)
- Affirme : "No JSON `nodes` map — the child files' existence + frontmatter IS the DAG"

### Section `<step name="handle_lock">` (Tâche 2)
- Remplace `node.answer` / `node.status` par des updates frontmatter in-place
- Documente le **DAG cascade (D-02)** : lecture/écriture des frontmatters des fichiers frères pour débloquer les dépendances
- Supprime toute référence à JSON

### Section `<step name="propagate">` (Tâche 2)
- Remplace le chargement JSON par la lecture des frontmatters des fichiers frères/parent
- Ajoute la section **DAG re-evaluation** avec scan des dossiers `questions/` et `questions/blocked/`
- Déplace le return contract JSON ici (point de sortie naturel du workflow)

### Section `<success_criteria>` (Tâche 2)
- Remplace "mirrors the JSON conversation array" par les 5 critères D-02 :
  - Frontmatter = single source of truth
  - Discussion thread = conversation persisted
  - `conversation_length` = count réel des messages
  - On lock: `answer` + `status` dans frontmatter
  - On split: `status: split` + `children: [...]` + fichiers enfants créés

## Deviations from Plan

### Déviation de commit stratégie

**Trouvé pendant :** Tâche 1 (après modifications du fichier `~/.claude/...`)

**Problème :** Le fichier `discuss-question-markdown.md` est dans `~/.claude/get-shit-done/workflows/` qui est gitignored dans le repo principal. Les commits du Plan 01 n'avaient donc pas propagé le renommage dans le repo source (`get-shit-done/workflows/`).

**Fix :** En plus de modifier le fichier installé (`~/.claude/...`), j'ai créé le fichier dans le repo worktree (`get-shit-done/workflows/discuss-question-markdown.md`) et supprimé l'ancien `discuss-question-file.md` du repo. Ce commit unique couvre à la fois D-01 (renommage dans le repo) et D-02/D-05 (contenu mis à jour).

**Fichiers :** `get-shit-done/workflows/discuss-question-markdown.md` (créé), `get-shit-done/workflows/discuss-question-file.md` (supprimé)

**Commit :** add603c

## Self-Check: PASSED

- ✓ `QUESTIONS.json` absent du fichier (0 occurrences)
- ✓ `Task() subagent` présent (1 occurrence)
- ✓ `frontmatter` présent (23 occurrences)
- ✓ `conversation_length` présent (5 occurrences)
- ✓ `newStatus` présent (2 occurrences)
- ✓ `#686` présent (1 occurrence)
- ✓ `single source of truth` présent (2 occurrences)
- ✓ `DAG cascade` présent (1 occurrence)
- ✓ `conversationAdded` présent (2 occurrences)
- ✓ `children: [` présent (3 occurrences)
- ✓ `parent: Q-` présent (1 occurrence)
- ✓ 6 `<step name=` ouvertures = 6 `</step>` fermetures
- ✓ `<success_criteria>` présent (1 occurrence)
- ✓ Commit add603c vérifié dans git log
- ✓ `get-shit-done/workflows/discuss-question-markdown.md` présent dans le repo
- ✓ `get-shit-done/workflows/discuss-question-file.md` supprimé du repo
