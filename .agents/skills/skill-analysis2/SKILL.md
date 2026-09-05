---
name: skill-impact-analysis
description: Scans and analyzes cross-system impact (Blast Radius) across Discord Bot, Database/Supabase, Shared Config, and Web Dashboard before making synchronized code changes.
---

# Cross-System Impact Analysis (Blast Radius)

Use this skill when modifying system parameters, IDs, Database Schema, Supabase RPCs, or shared JSON configurations that span across Discord Bot, Database, Configs, and Web Dashboard (`bear-cafe-web`).

## Core Objectives

1. **Grasp Blast Radius:** Scan all related files across bot, database, configs, and web dashboard before modifying any file.
2. **Synchronized Atomic Execution:** Prevent single-file edits that leave other dependent systems out of sync or broken.
3. **Structured Reporting:** Output a clear Cross-System Impact Report before applying edits.

---

## Output Template to Developer

When invoked, output the impact report before performing edits:

### 🔗 Cross-System Impact Report

🎯 **Target Entity:** `[e.g., Minigame ID / Point Reward Key / Role ID / Schema Column]`

📋 **Blast Radius (Affected Files):**
- 🤖 **Discord Bot:**
  - `src/features/.../handler.js` (Lines 45-60)
  - `sharedSettings.json` (Constant definition)
- 🌐 **Web Dashboard (`bear-cafe-web`):**
  - `src/components/.../GameCard.tsx` (Display logic)
  - `src/services/.../api.ts` (Data fetching filter)
- 🗄️ **Database / Supabase:**
  - Table: `minigame_sessions` (Column: `game_type_id`)

⚠️ **Potential Ripple Effects:**
- *[Describe potential breaking changes, stale IDs, or rendering issues if modified out of sync]*

🚀 **Action Plan:**
1. List each file and the exact change required:
   - `[Bot Handler]` `path/to/file.js` : Update ID parsing & interaction customId.
   - `[Shared Config]` `config.js` / `setting.json` : Update master constant.
   - `[Web UI]` `bear-cafe-web/.../Component.tsx` : Update rendering condition, prop types, or API query.

---

### Phase 3: Synchronized Atomic Execution
1. **Batch Update:** Apply the modification across ALL discovered files in a single pass to prevent desynchronization between Bot and Web.
2. **No Residual Artifacts:** Ensure old fallback IDs, deprecated JSON keys, or stale switch-cases are cleanly removed or updated.

---

### Phase 4: Zero-Dangling-Reference Verification
Run a post-modification audit:
1. Search the entire workspace for the *old* identifier/pattern to confirm zero remaining dead references.
2. Check type consistency between Bot payloads and Web UI expectations.