# Skill: Hypothesis-Driven Inquiry & Refinement (`skill-inquire-refine`)

## Objective
To eliminate assumptions and unverified guessing during development. When assigned a task, this skill autonomously formulates critical doubts, systematically gathers workspace evidence, performs a comparative trade-off analysis between potential solutions, and asks targeted questions before implementing the verified, optimal code adjustments.

## Triggered When
*   A task description is brief, ambiguous, or multi-faceted.
*   You want the AI to question requirements, challenge potential pitfalls (e.g., Supabase quota, Discord rate limits), and propose multiple technical approaches before writing code.
*   Refactoring a core logic where edge cases (such as zero balances, disconnected voice states, or concurrency) must be thoroughly investigated first.

---

## Execution Workflow

### Phase 1: Self-Interrogation & Doubt Formulation (Raise Hypotheses)
Upon receiving the task, the AI must NOT jump straight into writing code. Instead, it must formulate at least 3-4 critical doubts:
1.  **State & Edge Cases:** What happens during null values, network dropouts, or race conditions?
2.  **Infrastructure & Quota Impact:** Does this increase Supabase DB egress, hit Discord 3-second interaction timeouts, or leak Canvas memory?
3.  **Cross-System Consistency:** How does this affect both `bearcafe-bot` and `bear-cafe-web`?

### Phase 2: Evidence Gathering & Comparative Analysis
The AI investigates the workspace to answer its own doubts:
1.  **Inspect Codebase:** Read relevant files, constants, and database schemas.
2.  **Compare Approaches (Trade-Off Matrix):** Evaluate Option A vs. Option B (e.g., in-memory cache vs. DB lookup, RPC vs. client-side filtering).

### Phase 3: Diagnostic Briefing & Targeted Questions
Output the diagnostic report containing:
- **Discovered Constraints & Evidence**
- **Approach Comparison Table**
- **Specific Clarifying Questions** (if user preference on business logic is required)

### Phase 4: Precision Code Implementation
Once the optimal path is verified (or the user answers the targeted questions), apply the code changes cleanly with:
- Standardized error handling via `discordSafety.js`
- Optimized queries to minimize Supabase egress
- Clean separation of business logic and UI

---

## Output Template for Phase 3

### 🧐 Diagnostic & Inquiry Report

🎯 **Task Under Investigation:** `[Task Name]`

🔍 **Formulated Doubts & Findings:**
1. **Doubt:** `[e.g., What happens if the user leaves the voice room mid-calculation?]`
   - *Evidence Found:* `[e.g., Line 42 in voiceHistory.js does not verify active guildMember session.]`
2. **Doubt:** `[e.g., Will this trigger excessive Supabase Egress?]`
   - *Evidence Found:* `[e.g., Current query fetches full JSON logs instead of selected columns.]`

⚖️ **Comparative Approaches:**

| Option | Pros | Cons | Recommendation |
| :--- | :--- | :--- | :--- |
| **Option A (In-Memory Map)** | Zero DB Egress, Ultra Fast | Lost on PM2 restart | ✅ Best for transient sessions |
| **Option B (Supabase Table)** | Persistent across reboots | Consumes DB Quota | ⚠️ Use only for permanent records |

❓ **Targeted Questions for Developer:**
1. *[Question 1 regarding business logic or priority]*
2. *[Question 2 regarding UX or fallback behavior]*

*(Reply with your choices or say "Proceed with Recommended" to implement.)*