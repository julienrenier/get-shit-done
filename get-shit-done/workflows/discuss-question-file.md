<purpose>
Recursive per-question workflow used by markdown mode. Handles a single question `.md` file: reads the current state of its conversation thread and checkbox, replies to new user comments, detects lock events (checkbox ticked), detects split requests, propagates child answers back up when the question is a split parent.

This workflow is **recursive** — it applies identically to top-level questions (Q-01) and to any child question spawned by a split (Q-01.a, Q-01.a.1, etc.). A parent that becomes split invokes this same workflow on each of its children; children that themselves split invoke it again on their grand-children. The logic at every level is identical — only the scope changes.
</purpose>

<invocation>
Called by @~/.claude/get-shit-done/workflows/discuss-phase-file.md during the `wait_loop` step, once per node that needs servicing. Caller provides:
- `node_id` (e.g., `Q-01` or `Q-01.a.2`)
- `file_path` absolute path to the question's `.md` file
- A pointer to the canonical `{padded_phase}-QUESTIONS.json` state

May also call itself on children when handling a split.
</invocation>

<step name="read">
Read the question markdown file at `file_path`. Parse:
- Title from `# {id} — {title}`
- Context from `**Context:**`
- Dependencies from `**Dependencies:**`
- Options: all lines matching `- [ ] (x) label — description` or `- [x] (x) label — description`
- **Checkbox state** per option (`[ ]` unchecked, `[x]` checked)
- Discussion thread: all `> User:` and `> Claude:` blocks in order
- `**Split:** {value}` marker

Load the matching node from the JSON state to know previous `conversation` length and previous `status`.
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
3. Append the new messages to `node.conversation` in the JSON
4. Re-save both files
5. Do not change `status` — the user has not locked yet

When the state is **leaf-ambiguous**:
- Append `> Claude: Two options are ticked ({ids}). Please leave exactly one `[x]` to finalize, or use "Custom" with free-form text in Discussion.`
- Set `node.status = "ambiguous"` temporarily until next refresh clears it
</step>

<step name="handle_split">
When the state is **split-request**:

1. Extract N from `**Split:** yes N` (or decide N yourself based on the decision space when user wrote only `yes`)
2. Decompose the question's decision space into N child sub-questions, each with its own title, context, and 2–4 options. The N is a hint — generate as many children as makes sense for logical coherence; do not pad or truncate.
3. Compute pair-wise dependencies between the new children using the **logical-independence rule**: child B depends on child A iff at least one valid answer to A would empty or materially alter B's option space. Independent siblings will appear as a parallel wave in INDEX.md; dependent siblings will be Blocked until predecessors lock.
4. For each new child:
   - Append a new node to the JSON `nodes` map with `parent = {current_id}`, `dependencies = [computed]`, `status = "leaf"` (or `"blocked"` if it has unmet dependencies)
   - Create a `.md` file at `{padded_phase}-questions/{current_id}/{child_id}.md` using the same per-question template as the orchestrator
5. Update the current node: `status = "split"`, `children = [child ids]`, `options = []`
6. Rewrite the parent's `.md` to show a small redirect notice: `**Status:** split into [{child_ids}] — see child files`
7. INDEX.md regeneration (done by the orchestrator after this sub-workflow returns) will hide the parent and show the new children

Recursion: if any child is itself complex enough to trigger auto-split heuristics, the orchestrator will invoke this same workflow on that child, which may in turn split further. There is no depth limit — the same workflow applies uniformly.
</step>

<step name="handle_lock">
When the state is **leaf-locked**:

1. Identify the ticked option (the single `[x]`)
2. Set `node.answer = {option_id or custom text if option (d) Custom + free-form text in Discussion}`
3. Set `node.status = "answered"`
4. Append a `> Claude: Locked: {option_label}.` reply in the Discussion thread and to `node.conversation`
5. Re-evaluate the DAG:
   - For every node that had `{current_id}` in its `dependencies`, check if all its dependencies are now satisfied. If yes, re-validate its option space against the newly locked answer:
     - If options are still valid → transition from `blocked` to `leaf` (appears in Ready wave on next INDEX.md rewrite)
     - If options are now invalid given the lock → regenerate the options for that dependent node, rewrite its `.md`, keep its status as `leaf`
6. Check for parent propagation — delegate to the propagate step
</step>

<step name="propagate">
When a node's status has just changed to `answered`, check whether its parent can now be synthesized:

1. Load `parent_id = node.parent`
2. If `parent_id` is null, stop (top-level question — nothing to propagate)
3. Load all `parent.children` statuses. If any child is NOT `answered`, stop (more siblings pending)
4. All children of the parent are now answered — synthesize:
   - Build a parent answer by combining the children's answers into a single coherent decision summary
   - Set `parent.status = "leaf"` (resurrected as a leaf)
   - Write a fresh parent `.md` with:
     - A synthesized single-option list where `(a) = synthesized answer from children` is pre-ticked with `[x]`
     - Optionally an `(b) override — edit manually` option if the user wants to override
     - A Discussion block summarizing each child's locked answer
   - Leave the user the choice to confirm (by keeping the `[x]` on save) or override
5. Recurse: if the parent now has a parent of its own, the subsequent refresh will re-enter this workflow on that grand-parent and repeat the check

This is the bubble-up: child answers propagate upward through the tree until a top-level node is reached or an unfinished sibling blocks the propagation.
</step>

<success_criteria>
- Every `> User:` message receives a `> Claude:` reply within one refresh cycle
- Ambiguous multi-tick states are detected and surfaced, not silently accepted
- Split requests create children in the same workflow shape (recursive self-application)
- Logical-independence rule correctly classifies siblings as parallel vs. sequential
- Lock events trigger DAG re-evaluation and option regeneration when dependencies invalidate downstream options
- Parent resurrection pre-fills a synthesized answer once all children lock, and the user can confirm or override
- Conversation thread in the `.md` file mirrors the JSON `conversation` array exactly
</success_criteria>
