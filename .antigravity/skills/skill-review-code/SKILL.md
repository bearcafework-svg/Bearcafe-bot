---
name: skill-review-code
description: Performs a focused code review for correctness, maintainability, security, performance, and regression risks.
---

# Code Review

Review the requested code or current diff without rewriting it unless explicitly asked.

## Review Priority

1. Correctness and bugs
2. Security and authorization
3. Data integrity
4. Error handling
5. Regression risks
6. Performance
7. Maintainability
8. Style

## Rules

- Prioritize real issues over stylistic preferences.
- Follow the project's existing architecture and conventions.
- Check edge cases and failure paths.
- Check async behavior and race conditions where relevant.
- Check input validation and authorization boundaries.
- Check database queries for unsafe or unnecessarily expensive operations.
- Do not recommend large refactors for minor issues unless they materially reduce risk.

## Output

For each finding include:

- Severity
- File and location
- Problem
- Why it matters
- Recommended fix

Finish with:

- Critical issues
- Non-critical issues
- Positive observations
- Overall assessment
