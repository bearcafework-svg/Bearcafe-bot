---
name: skill-debug
description: Unified diagnostic and bug-fixing skill. Investigates error logs, stack traces, runtime malfunctions, or behavioral mismatches (Expected vs Actual) across Discord Bot, Database, and Web, identifies root causes, and executes safe minimal patches with post-fix verification.
---

# Unified Debug & Fix Skill (`skill-debug`)

Use this skill when any part of the system throws an error, crashes, or behaves unexpectedly (whether error logs exist or not).

## Core Capabilities

1. **Log & Trace Analysis:** Ingest error logs, stack traces, and API error codes (e.g. `DiscordAPIError[10062] Unknown interaction`, Supabase `42501 RLS violation`, `PGRST116`).
2. **Behavioral Diagnosis (Expected vs Actual):** When no error log is present, reconstruct the execution flow and trace where actual behavior diverges from requirements.
3. **Targeted Safe Fix:** Implement the smallest possible fix that resolves the root cause without touching unrelated code or silencing errors with empty catch blocks.
4. **Post-Fix Verification:** Validate that the fix solves the reported problem and does not cause regressions.

---

## Execution Workflow

### Step 1: Evidence Gathering & Triage
- If an error log is provided:
  - Isolate the earliest meaningful error and failing line.
  - Check whether the issue is related to Discord timeouts (3s rule), Supabase quota/egress, or missing environment variables.
- If no error log is provided:
  - Map the Expected vs Actual behavior flow:
    `User Action ➔ Handler ➔ Service Layer ➔ DB/API ➔ Response/UI`
  - Identify the exact step where behavior diverges.

### Step 2: Root Cause Identification
Classify the diagnosis:
- **Confirmed Root Cause:** Supported by code lines, logs, or reproduced state.
- **Contributing Factors:** Network latency, missing index, unhandled promise, race condition.

### Step 3: Minimal Safe Patch
- Apply the smallest safe code adjustment.
- **Project Rules:**
  - Discord interactions must always use `safeRespond`, `safeDeferReply`, or `safeDeferUpdate` from `utils/discordSafety.js` to prevent 10062 errors.
  - Never silence real errors with generic catch blocks.
  - Never weaken Supabase RLS policies just to make a query pass.

### Step 4: Verification & Handover
- Verify the fix against the original failure scenario.
- If complex or recurring quirk discovered, recommend `@skill-learn`.
- Prepare for release via `@skill-ship`.

---

## Output Template

### 🛠️ Debug & Diagnostic Report

🎯 **Incident:** `[Brief title of the issue / Error code]`

🔍 **Root Cause Analysis:**
- **Confirmed Cause:** `[Technical explanation of why the failure occurred]`
- **Evidence / Location:** `[path/to/file.js:line]`
- **Expected vs Actual:**
  - *Expected:* `[What should have happened]`
  - *Actual:* `[What actually happened]`

🔧 **Applied Fix:**
- `path/to/file.js`: `[Summary of specific code change]`

✅ **Verification & Residual Risks:**
- **Verification Performed:** `[How it was checked]`
- **Residual Risks:** `[None / Remaining items to observe]`
