# Skill: Development Summary (`skill-summary`)

## Objective
To generate a concise, easy-to-read summary of tasks completed, bug fixes, or feature updates formatted specifically for sharing with developers on Discord.

## Triggered When
*   A coding task, refactoring, or bug fix has just been completed.
*   The developer asks for a summary of what was changed.
*   Preparing to commit code or hand over the project state to a human developer.

## Output Rules
1.  **Format:** Must use standard Discord Markdown (bolding `**`, code blocks `\`` for file paths, and bullet points).
2.  **Conciseness:** Keep descriptions brief and strictly to the point. Avoid dumping large blocks of raw code.
3.  **Structure:** Always use the provided template below.

## Discord Summary Template
When summarizing work, strictly output the following format inside a standard code block or directly in chat so it can be easily copied:

**🛠️ Task / Fix:** [Short Title of the work]

📁 **Files Modified:**
- `path/to/file1.js`
- `path/to/file2.json`

🔴 **Problem (Before):**
- [Briefly state what was broken, missing, or needed improvement]

🟢 **What was Fixed/Changed:**
- [Action 1: e.g., Extracted inline UI into payloadBuilder.js]
- [Action 2: e.g., Added safeDeferReply to prevent 10062 errors]

💡 **Recommendations / Notes:**
- [e.g., Keep an eye on Supabase Quota for this query]
- [e.g., Remember to restart PM2 to apply these changes]