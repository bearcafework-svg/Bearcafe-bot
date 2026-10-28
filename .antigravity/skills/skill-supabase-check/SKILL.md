---
name: skill-supabase-check
description: Audits Supabase database usage, migrations, RLS policies, RPC functions, Edge Functions, and client access for correctness and security.
---

# Supabase Check

Use this skill when reviewing or modifying Supabase-related code or database changes.

## Audit Areas

### Database
- Inspect schema, foreign keys, indexes, constraints, defaults, and data types.
- Check whether a new table duplicates an existing concept.
- Prefer migrations for schema changes.
- Avoid destructive changes unless explicitly requested.

### RLS
- Check whether RLS is enabled on exposed tables.
- Review SELECT, INSERT, UPDATE, and DELETE policies.
- Verify that policies match the intended authorization model.
- Look for public access to sensitive data.
- Never weaken RLS merely to make a feature work.

### RPC / Functions
- Inspect function arguments, return types, permissions, and security context.
- Prefer existing RPC functions when they already represent the required business operation.
- Check for unsafe SECURITY DEFINER usage.

### Edge Functions
- Validate input.
- Validate required environment variables.
- Handle authentication and authorization explicitly.
- Handle external API and database failures.
- Avoid leaking secrets or sensitive data in responses and logs.

### Client Access
- Check whether frontend code accesses data directly when an RPC or server-side operation is more appropriate.
- Check error handling and null/empty states.

## Output

Return:

1. Findings grouped by severity: Critical / High / Medium / Low
2. Security issues
3. Data integrity risks
4. Recommended changes
5. Verification steps

Do not apply destructive database changes without explicit approval.
