---
name: skill-analyze-log
description: Analyzes error logs, stack traces, warnings, and runtime failures to identify root causes before making code changes.
---

# Analyze Log

Use this skill when the user provides an error log, stack trace, runtime failure, API error, database error, or unexplained application behavior.

## Rules

- Do not modify code during the initial investigation.
- Separate actionable errors from warnings, noise, and secondary failures.
- Trace the failure from the first meaningful error to the final symptom.
- Inspect relevant source files, configuration, dependencies, database queries, API calls, and recent changes when available.
- Prefer evidence from the repository and logs over guesses.
- Distinguish confirmed root causes from hypotheses.
- Check for cascading errors and identify the earliest likely failure.
- Consider environment-specific causes when relevant.

## Output

Return:

1. **Summary**
2. **Root cause** — confirmed or suspected
3. **Evidence**
4. **Relevant files / components**
5. **Recommended fix**
6. **Risks / side effects**
7. **Verification steps**

Do not implement the fix unless the user explicitly asks for it.
