---
name: skill-pre-deploy
description: Performs a production-readiness check before deployment, covering build, tests, configuration, database changes, security, and runtime risks.
---

# Pre-Deploy Check

Use this skill before deploying an application, Discord bot, web app, Edge Function, or database change.

## Checklist

### Code
- Check for obvious runtime errors.
- Check TypeScript/build errors.
- Check linting and formatting when configured.
- Review the current diff for accidental changes.
- Look for debug code, temporary bypasses, and hardcoded secrets.

### Tests
- Run relevant tests.
- Prefer targeted tests first, then broader checks when practical.
- Report skipped or unavailable tests.

### Environment
- Verify required environment variables exist without exposing secret values.
- Check production-only configuration differences.
- Check API URLs, callback URLs, origins, and feature flags.

### Database
- Check pending migrations.
- Review destructive or irreversible migrations.
- Check RLS and permissions for affected tables.
- Check compatibility between deployed code and database schema.

### Discord Bot
- Check required intents and permissions.
- Check command registration/deployment behavior.
- Check event handlers and error handling.
- Check rate-limit and retry behavior where relevant.

## Rules

- Do not deploy automatically.
- Do not expose secrets in output.
- Do not approve deployment if a critical unresolved issue remains.

## Final report

Use:

- PASS
- WARN
- BLOCK

Then list findings, required actions, and the exact verification performed.
