List each file and the exact change required:
- `[Bot Handler]` `path/to/file.js` : Update ID parsing & interaction customId.
- `[Shared Config]` `config.js` / `setting.json` : Update master constant.
- `[Web UI]` `bear-cafe-web/.../Component.tsx` : Update rendering condition, prop types, or API query.

---

### Phase 3: Synchronized Atomic Execution
1.  **Batch Update:** Apply the modification across ALL discovered files in a single pass to prevent desynchronization between Bot and Web.
2.  **No Residual Artifacts:** Ensure old fallback IDs, deprecated JSON keys, or stale switch-cases are cleanly removed or updated.

---

### Phase 4: Zero-Dangling-Reference Verification
Run a post-modification audit:
1.  Search the entire workspace for the *old* identifier/pattern to confirm zero remaining dead references.
2.  Check type consistency between Bot payloads and Web UI expectations.

---

## Output Template to Developer
When invoked, the skill must output the analysis before editing:

### 🔗 Cross-System Impact Report

🎯 **Target Entity:** `[e.g., Minigame ID / Point Reward Key / Role ID]`

📋 **Blast Radius (Affected Files):**
- 🤖 **Discord Bot:**
  - `src/features/.../handler.js` (Lines 45-60)
  - `config.js` (Constant definition)
- 🌐 **Web Dashboard (`bear-cafe-web`):**
  - `src/components/.../GameCard.tsx` (Display logic)
  - `src/services/.../api.ts` (Data fetching filter)
- 🗄️ **Database / Supabase:**
  - Table: `minigame_sessions` (Column: `game_type_id`)

⚠️ **Potential Ripple Effects:**
- *[e.g., Changing this ID without migrating active DB rows will cause existing Web sessions to render as "Unknown Game".]*

🚀 **Action Plan:**
1. Update `config.js` master definition.
2. Synchronize Bot handler custom IDs.
3. Update Web component props in `bear-cafe-web`.