---
name: skill-review
description: Comprehensive quality, security, and scope auditor. Evaluates code changes across Discord Bot safety, Supabase RLS/Egress efficiency, clean architecture, and explicitly declares 'Good Enough' to halt over-engineering.
---

# Unified Quality & Architecture Review (`skill-review`)

Use this skill to audit newly written code, perform pre-release reviews, or evaluate whole-project health to prevent regressions and over-engineering.

## The 4 Review Tiers

### Tier 1: Discord Bot Safety
- **Interaction Timing:** Are all button/select/command interactions protected by `safeRespond`, `safeDeferReply`, or `safeDeferUpdate` from `utils/discordSafety.js`?
- **Intents & Permissions:** Are required intents and permission bits validated before executing privileged actions?
- **Components V2:** Are interactive dashboards using standard Component V2 containers (`type: 17`) rather than deprecated embeds?
- **Canvas Memory Leaks:** Are Canvas allocations properly recycled and font fallbacks configured?

### Tier 2: Database & Supabase Efficiency
- **Egress & Quota:** Do queries select only necessary columns (avoid `select *` on large tables)? Are N+1 loops avoided?
- **RLS & Security:** Is Row Level Security enabled? Are policies strictly validated against user tokens?
- **Atomic Operations:** Are balance, point, or counter updates executed through RPC/transactions rather than race-prone read-then-write loops?

### Tier 3: Code Health & Clean Architecture
- **Separation of Concerns (SoC):** Is business logic isolated in `services/` instead of bloated interaction handler functions?
- **DRY:** Are duplicated UI buttons, bitwise flags, or constants consolidated in shared configs?
- **Secrets:** Are there any hardcoded tokens, webhook URLs, or credentials?

### Tier 4: Scope Control ("Good Enough" Declaration)
- Explicitly declare stable and functional modules as **"Good Enough — STOP EDITING"** to protect the developer from endless cycles of premature optimization and over-engineering.

---

## Output Template

### 🛡️ Quality & Architecture Review Report

🔴 **Critical Issues (Must Fix Before Ship):**
- *[Items causing crashes, 10062 timeouts, security leaks, or Supabase egress depletion]*

🟡 **Optimization Backlog (Can Wait):**
- *[Minor code style, non-blocking refactors, or future improvements]*

🟢 **"Good Enough" — STOP EDITING:**
- *[Explicit list of modules/files that are stable, tested, and meet requirements. Instruct developer to stop touching them]*

💡 **Verdict & Next Step:**
- *[Ready to Ship via `@skill-ship` / Needs targeted adjustment via `@skill-debug`]*
