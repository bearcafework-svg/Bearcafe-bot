---
name: skill-feature
description: End-to-end feature development, refactoring, and cross-system sync skill. Guiding implementation from Schema to Service, Controller, and UI, while enforcing Cross-System Blast Radius checks between Discord Bot, Database, and bear-cafe-web.
---

# Unified Feature Development & Refactoring (`skill-feature`)

Use this skill when building new features, refactoring legacy spaghetti code, or modifying shared parameters/schemas across Discord Bot and Web Dashboard.

## Core Directives

### 1. Cross-System Blast Radius (Bot ↔ Web Sync)
Before and during edits to any shared entity (e.g. Game IDs, Point Keys, Supabase Columns, or API types):
- Scan both `bearcafe-bot` and `bear-cafe-web`.
- Ensure changes are applied in sync so frontend dashboards and bot controllers never diverge.
- Audit dead references and deprecated keys after editing.

### 2. Clean Architecture & Separation of Concerns (SoC)
- **Service Layer:** Put database queries, point calculations, and domain logic into `src/features/<feature>/services/`.
- **Controller/Handler:** Interaction handlers must only parse input, invoke services, and pass results to the UI layer. Keep handlers lightweight.
- **Payload Builders:** Extract UI builders into dedicated `payloadBuilder.js` files rather than inlining complex JSON inside handlers.

### 3. Supabase Quota & Egress Protection
- Always specify column projections: avoid `select *`.
- Eliminate N+1 queries; use joins or RPCs.
- Cache static or slow-changing configurations in-memory.

### 4. Discord Interaction Safety (Zero 10062 Guarantee)
- For fast ephemeral replies: use `await safeRespond(interaction, { content, flags: 64 })`.
- For heavy operations (Canvas rendering, database calls, or external APIs):
  Call `await interaction.deferUpdate().catch(() => {})` or `await safeDeferReply(interaction)` within the first 500ms, then finalize with `interaction.editReply(...)`.

### 5. Standardized Console Logging
Format terminal logs using the unified project logger format:
`[HH:mm:ss] <EMOJI> [<CATEGORY>] <MESSAGE>`
Group batch operations (e.g. command registration or voice cleanups) rather than dumping individual lines.

---

## Definition of Done (DoD)
- [ ] Cross-system impact scanned (Discord Bot + Web Dashboard).
- [ ] Database queries optimized for egress limits.
- [ ] Interactions protected with `safeRespond` / `deferUpdate` against 10062 timeouts.
- [ ] Business logic isolated in `services/`, UI isolated in payload builders.
- [ ] Zero dangling references left across the repository.