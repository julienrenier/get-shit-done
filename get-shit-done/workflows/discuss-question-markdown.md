<purpose>
Recursive per-question workflow used by markdown mode. Handles a single question `.md` file: reads the current state of its conversation thread and checkbox, replies to new user comments, detects lock events (checkbox ticked), detects split requests, propagates child answers back up when the question is a split parent.

This workflow is **recursive** — it applies identically to top-level questions (Q-01) and to any child question spawned by a split (Q-01.a, Q-01.a.1, etc.). A parent that becomes split invokes this same workflow on each of its children; children that themselves split invoke it again on their grand-children. The logic at every level is identical — only the scope changes.
</purpose>

<invocation>
Called as a Task() subagent by `discuss-phase-markdown.md` during the `wait_loop` step, once per question file that needs servicing.

**Invocation mode:** Task() — isolated context, not @workflow inline. Each question is processed in its own subagent with no cross-contamination of context (per D-05).

**Caller provides in the Task prompt:**
- `node_id` — e.g. `Q-02`
- `file_path` — absolute path to the question's `.md` file
- NO JSON pointer — the frontmatter YAML at the top of the `.md` file IS the canonical state (per D-02)

**Return value (JSON):**
```json
{
  "id": "Q-02",
  "newStatus": "leaf|blocked|answered|split",
  "answerLocked": true,
  "conversationAdded": 2
}
```

**Nesting constraint:** This subagent must NOT spawn additional Task() — it stays at nesting level 2 (orchestrator → task-question) to stay within the #686 safe window.
</invocation>

<step name="read">
Parse the YAML frontmatter block at the top of the `.md` file (between the two `---` delimiters on their own lines).

Extract fields:
- `id` (string, e.g. `Q-02`)
- `title` (string)
- `status` (string, one of: `leaf`, `blocked`, `answered`, `split`)
- `parent` (string or null)
- `children` (YAML array, possibly empty `[]`)
- `dependencies` (YAML array, possibly empty `[]`)
- `answer` (null, or string — pending-lock / option letter / custom text)
- `conversation_length` (integer — number of messages already persisted in the Discussion)

Then read the Discussion section below the frontmatter. Detect:
- New `> User:` messages appended since last refresh (messages beyond `conversation_length`)
- Checkbox state in the `**Options**` list (`[x]` marks a lock)
- Any `Split:` marker in the user text (triggers handle_split)

The frontmatter is the CANONICAL STATE — there is NO JSON to load.
</step>

<step name="detect_state">
Classify the current file state into exactly one of:

- **leaf-locked**: exactly one checkbox is `[x]` — user finalized an answer
- **leaf-ambiguous**: two or more checkboxes are `[x]` — user ticked multiple options
- **leaf-new-comment**: at least one `> User:` block has no following `> Claude:` reply
- **split-request**: `**Split:** yes` or `**Split:** yes N` detected and status is not already split
- **leaf-idle**: no new input since last refresh — nothing to do, return early

Multiple states can co-exist (e.g., split-request + new-comment). Resolve in this priority order: ambiguous → split-request → locked → new-comment → idle.
</step>

<step name="reply">
When the state is **leaf-new-comment**:

1. For each `> User:` block without a reply, craft a contextual `> Claude:` response that:
   - Addresses the user's concern directly
   - References codebase info or options when relevant
   - Asks one clarifying sub-question if helpful (but only one at a time — keep the thread focused)
2. Append `> Claude: {reply}` under each unanswered user message in the `.md` file
3. Do not change `status` — the user has not locked yet

**Persistence (D-02):**
- Append new reply messages to the Discussion body (as `> Claude: ...` blocks) in the `.md` file.
- Increment `conversation_length` in the frontmatter by the number of new messages (user + claude) added.
- Re-save the `.md` file with updated frontmatter + updated Discussion body.
- There is NO JSON to update — the `.md` file is the single source of truth.

When the state is **leaf-ambiguous**:
- Append `> Claude: Two options are ticked ({ids}). Please leave exactly one `[x]` to finalize, or use "Custom" with free-form text in Discussion.`
- Update `status: ambiguous` in the frontmatter temporarily until next refresh clears it.
</step>

<step name="handle_split">
When the state is **split-request**:

1. Extract N from `**Split:** yes N` (or decide N yourself based on the decision space when user wrote only `yes`)
2. Decompose the question's decision space into N child sub-questions, each with its own title, context, and 2–4 options. The N is a hint — generate as many children as makes sense for logical coherence; do not pad or truncate.
3. Compute pair-wise dependencies between the new children using the **logical-independence rule**: child B depends on child A iff at least one valid answer to A would empty or materially alter B's option space. Independent siblings will appear as a parallel wave in INDEX.md; dependent siblings will be Blocked until predecessors lock.

**On Split: marker detected:**
- Parse the children definitions from the user's Split block (IDs, titles).
- Update the current question's frontmatter:
  - `status: split`
  - `children: [Q-XX.a, Q-XX.b, ...]`
- Create the child .md files under `{padded_phase}-questions/` root (or `blocked/` if initial status is blocked):
  - Each child starts with a complete frontmatter:
    ```yaml
    ---
    id: Q-XX.a
    title: {child title}
    status: leaf
    parent: Q-XX
    children: []
    dependencies: []
    answer: null
    conversation_length: 0
    ---
    ```
  - Body: use the same question template as generate_tree (see discuss-phase-markdown.md).

No JSON `nodes` map — the child files' existence + frontmatter IS the DAG.

4. Rewrite the parent's `.md` to show a small redirect notice: `**Status:** split into [{child_ids}] — see child files`
5. INDEX.md regeneration (done by the orchestrator after this sub-workflow returns) will hide the parent and show the new children

Recursion: if any child is itself complex enough to trigger auto-split heuristics, the orchestrator will invoke this same workflow on that child, which may in turn split further. There is no depth limit — the same workflow applies uniformly.
</step>

<step name="handle_lock">
When the state is **leaf-locked**:

1. Identify the ticked option (the single `[x]`)
2. Append a `> Claude: Locked: {option_label}.` reply in the Discussion thread

**On [x] checkbox lock detected:**
- Determine the locked answer value (option letter `a`/`b`/`c`/... or custom text from Discussion).
- Update the frontmatter in-place:
  - `answer: {value}` (string)
  - `status: answered`
- Re-save the `.md` file.

**DAG cascade (D-02):** For each question file in the same `{padded_phase}-questions/` folder (root AND `blocked/` subfolder), read its frontmatter. If its `dependencies` array contains the current question's `id` AND all other deps are satisfied (status == answered), update that dependent's frontmatter:
- `status: leaf` (unblock)
- Then the orchestrator (Plan 04 Phase 3) physically moves the file from `blocked/` to root.

No JSON touched — every state change is in the frontmatter of the .md files.

3. Check for parent propagation — delegate to the propagate step
</step>

<step name="propagate">
When a node's status has just changed to `answered`, check whether its parent can now be synthesized:

1. Read `parent` field from the current question's frontmatter
2. If `parent` is null, stop (top-level question — nothing to propagate)
3. Read the parent file's frontmatter; read all sibling files listed in `children`. If any sibling's frontmatter shows status NOT `answered`, stop (more siblings pending)
4. All children of the parent are now answered — synthesize:
   - Build a parent answer by combining the children's answers into a single coherent decision summary
   - Write a fresh parent `.md` with updated frontmatter and synthesized options

**DAG re-evaluation after any status change:**
- Scan sibling files in `{padded_phase}-questions/` and `{padded_phase}-questions/blocked/`.
- Parse each sibling's frontmatter `dependencies` array.
- Update the parent file's frontmatter `children` array if a split occurred.
- All updates are frontmatter-level — no JSON writes.

After this step, return the summary JSON to the caller:
```json
{
  "id": "{current_id}",
  "newStatus": "{final status}",
  "answerLocked": true | false,
  "conversationAdded": {count of new messages persisted}
}
```

5. Recurse: if the parent now has a parent of its own, the subsequent refresh will re-enter this workflow on that grand-parent and repeat the check

This is the bubble-up: child answers propagate upward through the tree until a top-level node is reached or an unfinished sibling blocks the propagation.
</step>

<success_criteria>
- Every `> User:` message receives a `> Claude:` reply within one refresh cycle
- Ambiguous multi-tick states are detected and surfaced, not silently accepted
- Split requests create children in the same workflow shape (recursive self-application)
- Logical-independence rule correctly classifies siblings as parallel vs. sequential
- Lock events trigger DAG re-evaluation and unblock dependents via frontmatter updates
- Parent resurrection pre-fills a synthesized answer once all children lock, and the user can confirm or override
- Frontmatter YAML in each `.md` file is the single source of truth — no external state file consulted or produced.
- Discussion thread in the `.md` file mirrors the persisted conversation (old messages preserved, new replies appended).
- `conversation_length` in frontmatter equals the actual number of `> User:` + `> Claude:` blocks in the Discussion.
- On lock: `answer` and `status` in frontmatter reflect the lock.
- On split: `status: split` + `children: [...]` in frontmatter; each child file exists with its own frontmatter.
</success_criteria>
