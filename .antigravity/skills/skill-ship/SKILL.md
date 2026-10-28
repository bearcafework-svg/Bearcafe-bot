---
name: skill-ship
description: Pre-deploy gatekeeper, Discord summary generator, and Git deployment synchronizer. Audits for leftover debug code and secrets, generates clean Discord summaries for the dev team, and handles Conventional Commit and Git Push.
---

# Pre-Deploy & Delivery Skill (`skill-ship`)

Use this skill when completing a task, feature, or bugfix to generate a Discord-ready handover summary, perform pre-flight code hygiene checks, and push clean commits to Git.

## Execution Workflow

### Phase 1: Pre-Flight Hygiene Audit
Silently inspect `git status` and `git diff` for:
1. **Secrets & Tokens:** Ensure no `.env`, BOT_TOKEN, or Supabase service keys are staged.
2. **Leftover Debug Artifacts:** Check for temporary `console.log()` dumps, `// TODO:`, or commented-out experiment blocks.
3. **Safety Violations:** Check that new Discord handlers don't have raw unhandled `interaction.reply()`.

If issues are found, block deployment and report specific files to clean up.

### Phase 2: Discord Summary Card Generator
Format a clean, copy-pasteable Discord Markdown summary for sharing in developer channels.

### Phase 3: Git Commit & Push
1. Generate an automated Conventional Commit message (e.g. `feat(cafe): ...` or `fix(interaction): ...`).
2. Offer the user one-click confirmation to execute:
   - `git add .`
   - `git commit -m "[message]"`
   - `git push origin main`

---

## Output Template

### 📦 Ship & Delivery Report

#### 💬 Discord Summary (Ready to Copy):
```markdown
**🛠️ Task / Update:** [Short title of work]

📁 **Files Modified:**
- `path/to/file1.js`
- `path/to/file2.js`

🔴 **Problem / Context (Before):**
- [What was missing, broken, or needed improvement]

🟢 **Changes Implemented:**
- [Key change 1: e.g., Deferred interaction to prevent 10062 timeout]
- [Key change 2: e.g., Replaced raw reply with safeRespond wrapper]

💡 **Deployment / Operational Notes:**
- [e.g., Restart PM2 process to apply updates]
```

---

#### 🚀 Git Deployment:
- **Pre-Flight Audit:** 🟢 Passed (No secrets, no dangling debug code)
- **Proposed Commit:** `[type]([scope]): [concise summary]`

*(To push directly, reply: `@skill-ship confirm push`)*
