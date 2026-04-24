# Security Vetting — Phase 4 Webview Dependencies

**Date:** 2026-04-24
**Executor:** Claude (Plan 04-01)
**Vetted commit / npm tarball SHAs:** see per-package sections.
**Verdict:** APPROVED — proceed to `npm install` in Plan 04-02.

> Per UI-SPEC §Registry Safety Gate, packages flagged "developer-approved without view" MUST be vetted before `npm install`. This document records the pre-install audit.

***

## Methodology

For each package:
1. `npm view <pkg>@<version>` — confirm version exists, capture `dist.shasum` and `dist.tarball`
2. Inspect package source (clone upstream repo or `npm pack` + `tar -xzf`) for:
   - Network access in install scripts (`postinstall`, `preinstall`) — flagged if found
   - Dynamic code execution (`eval`, `new Function(...)`, `vm.runInThisContext`) outside of vetted runtime paths — investigate
   - Environment variable read (`process.env.X` outside of build-time config) — document
   - Obfuscated / minified-only source without sourcemap — flagged if package claims to be auditable
3. Cross-reference upstream issue tracker for any active CVE
4. Record finding + decision (APPROVED / APPROVE-WITH-CAVEAT)

If any high-severity issue appears: STOP, file a GitHub issue per CONTRIBUTING.md Issue-First gate, do not proceed.

***

## Vetted Packages

### `@json-render/core@0.18.0`

- **npm tarball:** sha1 `b7f41b4bc9b79fabebc41cb246dbe7d2f48d63c1` (`https://registry.npmjs.org/@json-render/core/-/core-0.18.0.tgz`)
- **Maintainers:** matt.straka (Vercel), vercel-release-bot, ctate (Chris Tate / Vercel) — all linked to Vercel npm org
- **Upstream:** https://github.com/vercel-labs/json-render (Vercel Labs)
- **Install scripts:** none (`scripts` block contains only `dev` / `build` / `typecheck` invoking `tsup` and `tsc` — no `postinstall`, no `preinstall`, no network call)
- **Runtime dependencies:** `zod@^4.3.6` only — single mainstream dep, already present in our pinned set
- **Dynamic execution:** none — catalog uses Zod schemas as the validation/declaration surface. No `eval`, no `new Function`, no `vm.runInThisContext` in the published `dist/`. Catalog `prompt()` builder is pure string concatenation
- **Environment access:** none at runtime — no `process.env.*` reads

**Verdict:** APPROVED — Vercel Labs maintained, single Zod dep, no install-time scripts, no dynamic code execution path; pure schema/catalog declaration helper

### `@json-render/react@0.18.0`

- **npm tarball:** sha1 `b8a4c6292bbad62f0878dc9960e100d552184a6f` (`https://registry.npmjs.org/@json-render/react/-/react-0.18.0.tgz`)
- **Maintainers:** matt.straka (Vercel), vercel-release-bot, ctate
- **Upstream:** https://github.com/vercel-labs/json-render
- **Install scripts:** none (only `dev` / `build` / `typecheck`)
- **Runtime dependencies:** `@json-render/core@0.18.0` only — single peer to its own core
- **Dynamic execution:** none — Renderer dereferences `spec.elements[id].type` against the registry's `components` map (object property lookup), not `eval`. Children resolved via `spec.elements[childId]` recursion, identifiers strictly compared against the registry whitelist
- **Environment access:** none at runtime

**Verdict:** APPROVED — Vercel Labs maintained, registry-based lookup (no dynamic code), no install scripts; safe React renderer

### `@json-render/shadcn@0.18.0`

- **npm tarball:** sha1 `55f8f2eef68118319e8ea2a225b376c9bed82da4` (`https://registry.npmjs.org/@json-render/shadcn/-/shadcn-0.18.0.tgz`)
- **Maintainers:** matt.straka (Vercel), vercel-release-bot, ctate
- **Upstream:** https://github.com/vercel-labs/json-render
- **Install scripts:** none (only `dev` / `build` / `typecheck` / `check-types`)
- **Runtime dependencies:** `clsx`, `vaul`, `radix-ui`, `lucide-react`, `tailwind-merge`, `embla-carousel-react`, `class-variance-authority` — all canonical shadcn ecosystem deps; `@json-render/{core,react}@0.18.0`
- **Dynamic execution:** none — bundles 36 React components built atop Radix UI primitives. Component lookup goes through `defineRegistry` like `@json-render/react`
- **Environment access:** none at runtime
- **Bundled assets:** confirmed — 36 shadcn components (Button, Input, Select, Card, Dialog, …) shipped as static React; no remote fetch. `lucide-react` icons inlined as SVG components

**Verdict:** APPROVED — Vercel Labs maintained, all transitive deps mainstream shadcn ecosystem, no install scripts, no remote fetch; safe stock component pack

### `vite-plugin-singlefile@2.3.3`

- **npm tarball:** sha1 `e859aea4c0c4b74fcbba6baf527e88f2ad09de69` (`https://registry.npmjs.org/vite-plugin-singlefile/-/vite-plugin-singlefile-2.3.3.tgz`)
- **Maintainers:** richardtallent (Richard Tallent — long-standing community maintainer, ~3y history on this package)
- **Upstream:** https://github.com/richardtallent/vite-plugin-singlefile
- **Install scripts:** has `prepare: npm run build` — runs ONLY during dev install of the plugin's own repo (the published tarball ships pre-built `dist/`); end-user `npm install <consumer>` does NOT trigger this. No `postinstall` / `preinstall` in the published manifest's user-facing surface. ACCEPTED — `prepare` is a development convention only triggered when installing from git, not from registry
- **Runtime dependencies:** `micromatch@^4.0.8` only — one mainstream glob lib used to filter assets
- **Dynamic execution:** none — operates as a Rollup `generateBundle` hook that mutates the emitted bundle in-memory (inlines `<script>` and `<style>` references into the HTML asset). No runtime `eval`, no Function constructor
- **Environment access:** none — pure build-time transformation

**Verdict:** APPROVED — single-maintainer but established (richardtallent, multi-year history), single-purpose Rollup hook, no runtime exposure (build-time only), single mainstream dep

***

## Standard Ecosystem Packages (no special vetting required)

The following are mainstream packages with established trust; standard caret semver applies in `package.json`:

- `react@19.2.5` (`^19`)
- `react-dom@19.2.5` (`^19`)
- `tailwindcss@3.4.19` (`^3` — pinned to v3 line; v4 changes config model and is OUT OF SCOPE per UI-SPEC §Tailwind Theme Configuration)
- `zod@4.3.6` (`^4`)
- `vite@8.0.10` (`^8`)
- `@vitejs/plugin-react@6.0.1` (`^6`)
- `postcss@8.5.10` (`^8`)
- `autoprefixer@10.5.0` (`^10`)
- `vitest@4.1.5` (`^4`) — test runner for plugin React side
- `@testing-library/react@16.3.2` (`^16`)
- `jsdom@29.0.2` (`^29`) — vitest jsdom env

***

## Excluded Packages

- `@json-render/mcp` — explicitly excluded per CONTEXT.md D-04 (preserve Phase 1 Elicitation MCP lock). MUST NOT appear in `package.json`.

***

## Re-vetting Triggers

Re-run this vetting when:
- Any pinned `@json-render/*` version is bumped
- `vite-plugin-singlefile` is bumped
- A new dep is added to the `dependencies` block of `plugins/gsd-bridge/webview/package.json`

***

*Vetting complete. Plan 04-02 may proceed with `npm install`.*
