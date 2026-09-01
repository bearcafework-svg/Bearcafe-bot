# Skill: Knowledge Acquisition & Documentation (`skill-learn`)

## Objective
To act as the centralized memory and documentation generator for the Bear Cafe development environment. This skill captures technical quirks, incident post-mortems, limitations of third-party APIs (Discord, Supabase, Canvas), and established workarounds to prevent recurring issues.

## Triggered When
*   A complex bug is successfully resolved.
*   A system limitation is discovered (e.g., Supabase "Egress Exceeded", Canvas text rendering bugs).
*   A new architectural decision or standard is finalized.

## Core Knowledge Domains

### 1. Supabase Quotas & Egress Management
*   **Known Quirk:** "All services are restricted" or "Egress Exceeded".
*   **Documentation Requirement:** Whenever hitting quota limits, document the query that caused it, the measured payload size, and the implemented caching/optimization strategy that resolved it.

### 2. Discord API & Interaction Constraints
*   **Known Quirk:** 3-second Interaction Timeout (`10062 Unknown Interaction`).
*   **Documentation Requirement:** Log instances where specific API calls (like fetching large guild member lists) take longer than expected, necessitating background jobs or deferred replies.

### 3. Canvas Rendering Limitations (`@napi-rs/canvas`)
*   **Known Quirk:** Custom font loading issues (Noto Sans Thai) or text measurement inaccuracies.
*   **Documentation Requirement:** Record exact coordinate offsets, line-height multipliers, and font-registration fallbacks required to make the UI render perfectly.

## Standard Operating Procedure (SOP) Template
When executing this skill to record new knowledge, output a markdown block in the following format to be appended to the project's knowledge base:

```markdown
### [Incident/Quirk Name]
**Date:** YYYY-MM-DD
**Domain:** [Supabase / Discord API / Canvas / Node.js]
**Description of Issue:**
(Briefly explain what went wrong or what limitation was hit)

**Root Cause:**
(Why did it happen? e.g., Uncached large query over 30 days of logs)

**Resolution / Workaround:**
(How to fix it or avoid it in the future. Include code snippets if applicable)

**Related Files:**
(List files affected or where the fix lives)
```