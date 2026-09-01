# Skill: Console Logger (`skill-logger`)

## Objective
To standardize, beautify, and organize all terminal console outputs during bot startup and runtime, transforming noisy raw logs into a polished CLI Dashboard inspired by Hermes and modern developer tools.

## Triggered When
*   Refactoring messy `console.log` statements scattered across multiple files.
*   Implementing a new feature and needing to add standardized logging.
*   Cleaning up the bot startup sequence to make it more readable.

## Design & Typography Principles

### ANSI Color Palette
- **Brand Accent (Brown/Gold):** `chalk.hex('#D97706')` or `chalk.yellow`
- **Success / Ready:** `chalk.green` (`✔`, `🚀`)
- **System / Info:** `chalk.cyan` (`ℹ`, `📋`)
- **Warning:** `chalk.hex('#F59E0B')` (`⚠️`)
- **Critical / Supabase Quota:** `chalk.red` (`✖`, `🛑`)
- **Dimmed Metadata / Timestamp:** `chalk.gray` (`[HH:mm:ss]`)

### Box Framing Style
Use clean Unicode single-line border characters:
- Horizontal: `─`, Vertical: `│`
- Corners: `┌`, `┐`, `└`, `┘`
- Dividers: `├`, `┤`, `┬`, `┴`, `┼`

## Standard Log Prefix Format

Every log line must follow a unified structure:
`[HH:mm:ss] <EMOJI> [<CATEGORY>] <MESSAGE>`

### Supported Categories
- `[CORE]` : Bot authentication, lifecycle, presence updates
- `[COMMANDS]` : Slash command registration batch summaries (do not log 1 line per command)
- `[CLEANUP]` : Voice channel monitoring & cleanup summary
- `[DATABASE]` : Supabase connections, RPC calls, quota alerts
- `[SECURITY]` : Permission auditor, token checks, backup/restore
- `[MODULE]` : Feature-specific logs (`[BEES]`, `[MINIGAMES]`, `[TAROT]`)

## Implementation Guidelines

### 1. Batch Command Registration
*Avoid:* Printing 10+ lines for each registered command.
*Standard:* Collect registered commands in an array and print a single summarized line:
`logger.info("COMMANDS", "Registered 11 slash commands on Bear Café");`

### 2. Group Voice Cleanup Logs
*Avoid:* Printing individual lines for every room that has active users.
*Standard:* Count active rooms silently and log only the final result:
`logger.cleanup("Checked 13 rooms → 0 purged, 13 active");`

### 3. Graceful Quota Error Formatting
When Supabase responds with `exceed_egress_quota`:
*Intercept and format into a clear warning banner rather than raw dump:*
`logger.warn("SUPABASE", "Service restricted: Egress Quota Exceeded. Fallback cache enabled.");`