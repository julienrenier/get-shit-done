<purpose>
Ingest reference documentation into a phase's `refs/` folder via an interactive loop. Accepts three source types per iteration — URL (WebFetch), GitHub folder (`gh api`), or pasted text — and writes each as a `.md` file under `.planning/phases/<NN>-<slug>/refs/`. The loop continues until the user picks "Done". Feeds `gsd-phase-researcher` with external context before `/gsd:research-phase` or `/gsd:plan-phase`.
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.
</required_reading>

<process>

<step name="parse_phase">
**Resolve phase number.**

**TEXT_MODE fallback (non-Claude runtimes):** Set `TEXT_MODE=true` if `--text` is present in `$ARGUMENTS` OR `text_mode` from config is `true`. When TEXT_MODE is active, replace every `AskUserQuestion` call below with a plain-text numbered list and ask the user to type their choice number. This is required for non-Claude runtimes (OpenAI Codex, Gemini CLI, etc.) where `AskUserQuestion` is not available.

If `$ARGUMENTS` is a number (integer like `1` or decimal like `2.1`), treat it as `PHASE_NUM`. Otherwise list phases from ROADMAP.md and prompt the user.

```bash
PHASE_NUM=$(echo "$ARGUMENTS" | grep -oE '^[0-9]+(\.[0-9]+)?' || true)
```

If `PHASE_NUM` is empty:

```bash
PHASES=$(grep -nE '^### Phase [0-9]' .planning/ROADMAP.md 2>/dev/null | sed -E 's/.*### Phase ([0-9.]+): (.*)$/\1|\2/')
```

Parse into `AskUserQuestion` options (max 4 — if more phases exist, fall back to text input asking for the number):

```
AskUserQuestion(
  header: "Phase",
  question: "Quelle phase cibler pour l'ingestion ?",
  options: [
    { label: "Phase 1: task-manager", description: "..." },
    { label: "Phase 2: Bridge web↔Claude", description: "..." },
    ...
  ],
  multiSelect: false
)
```

Extract `PHASE_NUM` from the selection.

**Abort** if no phases found in ROADMAP.md : display `No phases found in ROADMAP.md. Run /gsd:add-phase first.` and exit.
</step>

<step name="resolve_phase_dir">
**Find the phase directory.**

Pad `PHASE_NUM` to match directory naming (`01`, `02`, `02.1`, etc.):

```bash
PADDED=$(printf '%02d' "${PHASE_NUM%.*}")
SUFFIX=""
case "$PHASE_NUM" in *.*) SUFFIX=".${PHASE_NUM#*.}" ;; esac
PHASE_DIR=$(ls -d .planning/phases/${PADDED}${SUFFIX}-*/ 2>/dev/null | head -1)
```

**Abort** if `PHASE_DIR` is empty : display `Phase $PHASE_NUM directory not found under .planning/phases/. Run /gsd:plan-phase $PHASE_NUM first.` and exit.

Display: `Target phase: $PHASE_DIR`
</step>

<step name="ensure_refs">
**Create refs/ directory if absent.**

```bash
REFS_DIR="${PHASE_DIR}refs"
mkdir -p "$REFS_DIR"
```

Display: `Refs directory: $REFS_DIR`
</step>

<step name="ingest_loop">
**Interactive ingest loop — single input, auto-détection.**

Chaque itération pose UNE SEULE `AskUserQuestion` avec deux options : "Add source" (champ texte libre, auto-détecté) ou "Done".

```
AskUserQuestion(
  header: "Source",
  question: "Colle une URL, un chemin GitHub (owner/repo/path[@branch]), ou du texte markdown — ou choisis Done.",
  options: [
    { label: "Add source", description: "Champ unique : URL, owner/repo/path[@branch], ou texte markdown (auto-détecté)" },
    { label: "Done", description: "Terminer la boucle et afficher le résumé" }
  ],
  multiSelect: false
)
```

Si l'utilisateur sélectionne **Done** → sortir de la boucle.

Si **Add source** → l'utilisateur entre le contenu via l'input texte (fallback "Other"). Stocker dans `$INPUT`. Auto-router :

```bash
case "$INPUT" in
  http://*|https://*)       TYPE="url" ;;
  *..*)                     TYPE="invalid" ;;  # traversal
  */*)
    # Regex GitHub strict : owner/repo[/path][@branch]
    if echo "$INPUT" | grep -qE '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(/[A-Za-z0-9_./-]+)?(@[A-Za-z0-9_./-]+)?$'; then
      TYPE="github"
    else
      TYPE="text"
    fi
    ;;
  *)                        TYPE="text" ;;
esac
```

Si `TYPE=invalid` → afficher `✗ Rejected: contient '..' (traversal). Retry.` et reboucler.

**Branch URL**

Valider `^https?://`. Appeler `WebFetch(url, prompt="Extract the main content as clean markdown. Strip navigation, ads, footer.")`.

Dériver un nom de fichier sans re-prompter (auto-detect = zero friction) :

```bash
NAME=$(echo "$INPUT" | sed -E 's#https?://##; s#[^a-zA-Z0-9._/-]+#-#g; s#/#-#g' | cut -c1-60)
NAME="${NAME%.md}.md"
# Sanitize against regex
echo "$NAME" | grep -qE '^[a-z0-9._-]+\.md$' || NAME="source-$(date +%s).md"
```

`Write("$REFS_DIR/$NAME", content)`. Display : `✓ URL → $NAME ($(wc -c < "$REFS_DIR/$NAME") bytes)`.

**Branch GitHub**

Parse into `OWNER`, `REPO`, `PATH`, `BRANCH` (default `main` if no `@branch`).

Check `gh` CLI is available:

```bash
command -v gh >/dev/null || { echo "✗ gh CLI not installed — skip this source"; continue; }
```

List contents:

```bash
gh api "repos/$OWNER/$REPO/contents/$PATH?ref=$BRANCH" --jq '.[] | select(.type == "file" and (.name | endswith(".md"))) | {name, path, download_url}' > /tmp/gh-listing.json
```

If empty or error, display `✗ No .md files at $OWNER/$REPO/$PATH@$BRANCH` and loop back.

For each file :

```bash
while IFS= read -r entry; do
  NAME=$(echo "$entry" | jq -r .name)
  # Validate filename
  case "$NAME" in *..*|*/*|*\\*) echo "  skip $NAME (invalid chars)"; continue ;; esac
  DOWNLOAD_URL=$(echo "$entry" | jq -r .download_url)
  # Size check via content-length before download
  SIZE=$(curl -sI "$DOWNLOAD_URL" | grep -i '^content-length:' | awk '{print $2}' | tr -d '\r')
  if [ "${SIZE:-0}" -gt 512000 ]; then echo "  skip $NAME (>500KB)"; continue; fi
  curl -sL "$DOWNLOAD_URL" -o "$REFS_DIR/$NAME"
  echo "  ✓ $NAME ($(wc -c < "$REFS_DIR/$NAME") bytes)"
done < <(jq -c '.' /tmp/gh-listing.json)
rm -f /tmp/gh-listing.json
```

Note: non-recursive by design (only the immediate folder). Pour un walk récursif, réinvoquer la loop avec un sous-chemin.

**Branch Text**

Le contenu (`$INPUT`) est traité comme markdown brut. Le nom de fichier est auto-généré depuis la première ligne `# Heading` si présente, sinon un nom horodaté :

```bash
FIRST_LINE=$(echo "$INPUT" | head -1 | sed -E 's/^#+\s*//')
if [ -n "$FIRST_LINE" ]; then
  NAME=$(echo "$FIRST_LINE" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9._-]+/-/g' | cut -c1-50)
  NAME="${NAME%.md}.md"
else
  NAME="note-$(date +%s).md"
fi
# Final validation ; fallback si la dérivation a produit un nom invalide
echo "$NAME" | grep -qE '^[a-z0-9._-]+\.md$' || NAME="note-$(date +%s).md"
```

Check size :

```bash
SIZE=$(echo "$INPUT" | wc -c)
if [ "$SIZE" -gt 512000 ]; then echo "✗ Rejected: content >500KB"; continue; fi
```

`Write("$REFS_DIR/$NAME", $INPUT)`. Display : `✓ Text → $NAME ($SIZE bytes)`.

Reboucler (retour au prompt "Source" en tête d'étape) jusqu'à ce que l'utilisateur choisisse **Done**.
</step>

<step name="summary">
**Summary and next steps.**

```bash
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " GSD ► PHASE DOCS INGESTED"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Phase: $PHASE_DIR"
echo "Refs:  $REFS_DIR"
echo ""
ls -la "$REFS_DIR"/*.md 2>/dev/null | awk '{print "  " $NF " (" $5 " bytes)"}'
echo ""
echo "Next:"
echo "  /gsd:research-phase $PHASE_NUM      # distill refs/ into RESEARCH.md"
echo "  /gsd:plan-phase $PHASE_NUM --research  # force re-research with new refs"
echo ""
```
</step>

</process>

<security>
- **Filename validation** : every destination file must match `^[a-z0-9._-]+\.md$`. Path separators (`/`, `\`) and traversal (`..`) are rejected before write.
- **Size limit** : 500KB per file (512000 bytes). Enforced for Text (local check) and GitHub folder (`Content-Length` header pre-fetch).
- **GitHub path regex** : `^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(/[A-Za-z0-9_./-]+)?(@[A-Za-z0-9_./-]+)?$`. Rejects empty segments, shell metacharacters, and traversal.
- **URL scheme** : `https?://` only. No `file://`, `ftp://`, or other schemes.
- **WebFetch trust** : content is written verbatim to `refs/<name>.md`. Users must treat the result as untrusted input when consuming downstream (`gsd-phase-researcher` already tags claims with `[CITED]` — no code execution).
- **No git commit** : this workflow does not `git add` or `git commit`. The `refs/` directory lives under `.planning/` which is gitignored on this repo (see `commit_docs: false` in config).
</security>

<success_criteria>
- [ ] Phase number resolved (argument or interactive selection)
- [ ] `.planning/phases/<NN>-<slug>/refs/` created if absent
- [ ] Interactive loop iterates until user picks "Done"
- [ ] URL option fetches via `WebFetch` and writes a validated `.md` filename
- [ ] GitHub option lists and downloads all `.md` from the target folder (non-recursive), validates size and name per file
- [ ] Paste option accepts a user-supplied filename (validated) and content (size-checked)
- [ ] Summary lists every file written, with size and next-step commands
- [ ] No git commits are made by this workflow
</success_criteria>
