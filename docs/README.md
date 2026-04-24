# GSD Documentation

Comprehensive documentation for the Get Shit Done (GSD) framework — a meta-prompting, context engineering, and spec-driven development system for AI coding agents.

Language versions: [English](README.md) · [Português (pt-BR)](pt-BR/README.md) · [日本語](ja-JP/README.md) · [简体中文](zh-CN/README.md)

> **Structure note.** Everything listed below under **GSD documentation** is part of the framework itself. Non-GSD material shipped in this folder (external research, sibling-plugin specs) is grouped at the bottom under [Non-GSD material](#non-gsd-material-reference-only).

## GSD documentation

### Core references

| Document | Audience | Description |
|----------|----------|-------------|
| [User Guide](USER-GUIDE.md) | All users | Workflow walkthroughs, troubleshooting, and recovery |
| [Feature Reference](FEATURES.md) | All users | Feature narratives and requirements for released features (see [CHANGELOG](../CHANGELOG.md) for latest additions) |
| [Command Reference](COMMANDS.md) | All users | Stable commands with syntax, flags, options, and examples |
| [Configuration Reference](CONFIGURATION.md) | All users | Full config schema, workflow toggles, model profiles, git branching |
| [Beta Features](BETA.md) | Early adopters | Features available but not yet promoted to stable |

### Contributor / extension references

| Document | Audience | Description |
|----------|----------|-------------|
| [Architecture](ARCHITECTURE.md) | Contributors, advanced users | System architecture, agent model, data flow, internal design |
| [Agent Reference](AGENTS.md) | Contributors, advanced users | Role cards for primary agents — roles, tools, spawn patterns (the `agents/` filesystem is authoritative) |
| [CLI Tools Reference](CLI-TOOLS.md) | Contributors, agent authors | `gsd-tools.cjs` programmatic API for workflows and agents |
| [Inventory](INVENTORY.md) + [Manifest](INVENTORY-MANIFEST.json) | Contributors | Every shipped asset (commands, agents, workflows, skills, hooks) with size/kind classification |
| [Skills discovery contract](skills/discovery-contract.md) | Skill authors | Canonical contract that governs how skills advertise themselves to GSD |

### Topic deep-dives

| Document | Audience | Description |
|----------|----------|-------------|
| [Context Monitor](context-monitor.md) | All users | Context window monitoring hook architecture |
| [Discuss Mode](workflow-discuss-mode.md) | All users | Assumptions vs interview mode for `/gsd-discuss-phase` |
| [Manual Update](manual-update.md) | Source-install users | Steps for source-based installs and air-gapped environments |
| [gsd-sdk Query Migration](gsd-sdk-query-migration-blurb.md) | Contributors | Blurb summarising the CJS → SDK query handler migration |

### Translations (mirror the Core + Architecture set above)

- [Português (pt-BR)](pt-BR/README.md)
- [日本語 (ja-JP)](ja-JP/README.md)
- [한국어 (ko-KR)](ko-KR/README.md)
- [简体中文 (zh-CN)](zh-CN/README.md)

## Quick links

- **What's new:** see [CHANGELOG](../CHANGELOG.md) for current release notes, and upstream [README](../README.md) for release highlights
- **Getting started:** [README](../README.md) → install → `/gsd-new-project`
- **Full workflow walkthrough:** [User Guide](USER-GUIDE.md)
- **All commands at a glance:** [Command Reference](COMMANDS.md)
- **Configuring GSD:** [Configuration Reference](CONFIGURATION.md)
- **How the system works internally:** [Architecture](ARCHITECTURE.md)
- **Contributing or extending:** [CLI Tools Reference](CLI-TOOLS.md) + [Agent Reference](AGENTS.md)

## Non-GSD material (reference only)

These subdirectories live under `docs/` for convenience but are **not part of the GSD framework** — they are imported research, sibling-plugin specs, or third-party material consulted during development. They are not shipped in the npm tarball (`package.json` `files` excludes `docs/` entirely).

| Path | What it is | Why it's here |
|------|------------|---------------|
| [`fastmcp-research/`](fastmcp-research/) | Mirror of the FastMCP ecosystem docs (apps, servers, clients, providers, SDKs) | Research material consulted while designing the `plugins/gsd-bridge/` MCP integration. Fetched via `fastmcp-research/fetch-all.sh`. |
| [`superpowers/specs/`](superpowers/specs) | Specs for the `superpowers` sibling Claude Code plugin | Cross-referenced when implementing agent-skill injection and discovery patterns |

If you're evaluating what the GSD package actually ships, ignore both of these and focus on the [GSD documentation](#gsd-documentation) section above.
