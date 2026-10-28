---
name: skill-discord-check
description: Reviews Discord bot features for permissions, intents, event handling, API usage, rate limits, reliability, and user-facing behavior.
---

# Discord Bot Check

Use this skill when building, reviewing, debugging, or modifying Discord bot functionality.

## Check

### Permissions and Access
- Verify required bot permissions.
- Verify role and channel permission assumptions.
- Do not trust client-provided role or user identifiers without server-side validation.

### Events and Commands
- Check command registration and interaction handling.
- Check interaction acknowledgement timing.
- Check duplicate event handling and race conditions.
- Handle missing channels, roles, users, messages, and deleted resources.

### Discord API
- Respect rate limits.
- Avoid unnecessary API calls.
- Prefer caching or existing objects when safe.
- Handle Discord API failures and transient errors.

### User Input
- Validate command arguments and form/modal input.
- Sanitize or safely handle user-generated content.
- Avoid accidental mentions or unintended mass notifications.

### Reliability
- Handle rejected promises and asynchronous failures.
- Ensure long-running tasks cannot silently fail.
- Check retry behavior and idempotency for operations that may run more than once.

### Database Integration
- Verify authorization before database writes.
- Check consistency between Discord state and database state.
- Prefer atomic operations for points, balances, counters, and similar state.

## Output

Return findings by severity and include:

- Issue
- Impact
- Location
- Recommended fix
- Verification method

Do not change unrelated Discord behavior during a focused fix.
