---
name: skill-fix-error
description: Investigates and fixes application errors using evidence from logs, source code, configuration, and tests, then verifies the fix.
---

# Fix Error

Use this skill when the user wants an error investigated and fixed.

## Process

1. Reproduce or trace the reported failure when possible.
2. Identify the earliest meaningful failure.
3. Inspect the relevant code and configuration.
4. Determine the root cause before editing.
5. Make the smallest safe change that fixes the root cause.
6. Preserve existing behavior outside the affected scope.
7. Run relevant tests, type checks, linting, or targeted verification.
8. Re-check the original failure after the fix.

## Rules

- Do not hide errors with broad catch blocks, silent fallbacks, or disabled checks.
- Do not change database schemas or production configuration unless required.
- Do not refactor unrelated code during a bug fix.
- Do not claim the issue is fixed without verification.
- If verification cannot be performed, clearly state what remains unverified.

## Final report

Include:

- Root cause
- Files changed
- What changed
- Verification performed
- Remaining risks or follow-up work
