# Skill: Pre-Deploy & Git Sync (`skill-pre-deploy`)

## Objective
To act as a strict gatekeeper before any code is committed and pushed to the repository. This skill audits the codebase for leftover debugging code, unhandled edge cases, and security risks. If issues are found, it blocks the push and challenges the developer. If clean, it automates the commit and push process.

## Triggered When
*   You are ready to save your work, commit, and push to `origin main`.
*   You want to ensure the code is clean and production-ready before deployment.

## Execution Workflow

### Phase 1: Pre-Commit Audit
The AI must silently review the current working directory changes (`git status` / `git diff`) and check for:
1.  **Security Leaks:** Hardcoded tokens, API keys, or Supabase credentials.
2.  **Leftover Debugging:** `console.log()` (except via `skill-logger`), `// TODO:`, or commented-out blocks of trial code.
3.  **Safety & Quota:** Missing Discord interaction wrappers (`safeDeferReply`) or overly broad Supabase queries (`select *` without limits).

### Phase 2: The `/grill-me` Protocol (If Issues Found)
If ANY issue or potential risk is detected in the audit, **DO NOT proceed with git commands.** 
Output a report detailing the issues, followed by 2-3 probing, critical questions to make the developer rethink their approach.

**Template (Issue Found):**
🔴 **Push Blocked: Audit Failed**
- [List the specific files and issues found]

🔥 **Grill-Me Questions:**
1. *[Probing question about testing, e.g., "Did you actually test this payload when the user has 0 points?"]*
2. *[Probing question about architecture/security, e.g., "Why are we pulling the entire user table just to check a role?"]*

*Resolve these issues and call `@skill-pre-deploy` again.*

### Phase 3: The Green Light (If Clean)
If the code passes the audit, **DO NOT push yet.** 
1. Generate an automated, concise Conventional Commit message based on the diff.
2. Instruct the user to confirm the push by running a specific command.

**Template (All Clear):**
🟢 **All Checks Passed. Ready for Deployment.**
- **Proposed Commit Message:** `feat/fix(scope): concise description`

🚀 **Next Step:** 
To execute the push, reply with: 
`@skill-pre-deploy confirm push` 

### Phase 4: Execution
If the user triggers the skill with the `confirm push` argument, execute the following commands in the terminal:
1. `git add .`
2. `git commit -m "[Generated Commit Message]"`
3. `git push origin main`