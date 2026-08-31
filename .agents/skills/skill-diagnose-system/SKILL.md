---
name: skill-diagnose-system
description: Diagnoses implemented systems and features that behave incorrectly, incompletely, inconsistently, or differently from the intended requirements. Compares expected versus actual behavior, traces the full execution and data flow, identifies root causes, and recommends fixes before implementation.
---

# Diagnose System

Use this skill when an implemented feature or system does not behave as expected.

Typical cases include:

- A feature works partially.
- A feature works sometimes but fails in other cases.
- The system produces the wrong result without an obvious error.
- The implementation differs from the intended requirements.
- A workflow stops at an unexpected step.
- Data exists but is not displayed or processed correctly.
- The UI appears correct but the backend behavior is wrong.
- The backend succeeds but the user-facing result is incorrect.
- Discord behavior does not match the intended behavior.
- Supabase data is correct but application behavior is incorrect.
- The code appears logically correct but does not work in real usage.
- There is no useful error log, but the system is clearly malfunctioning.

The primary goal is diagnosis, not immediate implementation.

## Core Rules

- Do not modify code during the initial diagnosis.
- Do not assume the user's implementation is correct.
- Do not assume the user's description of the root cause is correct.
- Do not immediately patch the most obvious-looking file.
- Reconstruct the actual execution flow before recommending changes.
- Compare intended behavior against actual behavior.
- Prefer evidence from the repository, runtime behavior, logs, database state, API responses, and tests over assumptions.
- Distinguish confirmed causes from hypotheses.
- Identify the earliest point where expected behavior diverges from actual behavior.
- Check whether multiple symptoms originate from the same root cause.
- Consider both frontend and backend when the feature crosses system boundaries.
- Consider database, Discord API, external services, configuration, permissions, and asynchronous behavior when relevant.
- Do not perform unrelated refactoring.
- Do not change architecture unless the current architecture is demonstrably causing the problem.
- Do not declare a diagnosis confirmed without sufficient evidence.

## Diagnosis Process

### 1. Define Expected Behavior

Determine what the system is supposed to do.

Identify:

- User action
- Expected response
- Expected state changes
- Expected database changes
- Expected Discord changes
- Expected API calls
- Expected UI behavior
- Expected error handling

If the intended behavior is unclear and materially affects the diagnosis, ask focused questions before proceeding.

### 2. Define Actual Behavior

Document what actually happens.

Identify:

- What the user does
- What the system actually does
- What happens instead of the expected result
- Whether the problem is consistent or intermittent
- Whether the problem affects all users or specific cases
- Whether the problem occurs in development, production, or both

### 3. Compare Expected vs Actual

Create a clear comparison.

Example:

| Stage | Expected | Actual | Status |
|---|---|---|---|
| User action | Submit form | Submit form | PASS |
| API request | POST /api/quest | POST /api/quest | PASS |
| Validation | Valid input accepted | Valid input accepted | PASS |
| Database write | Quest created | No row created | FAIL |
| UI response | Success message | Loading state remains | FAIL |

Identify the first meaningful divergence.

### 4. Trace the Execution Flow

Trace the complete path through the system.

Example:

User
→ UI
→ Client handler
→ API
→ Authentication
→ Authorization
→ Service layer
→ Database/RPC
→ External API
→ Response
→ State update
→ UI

For Discord systems:

User
→ Discord interaction
→ Bot handler
→ Validation
→ Permission check
→ Business logic
→ Supabase/API
→ Discord API
→ Database update
→ Response

Do not stop at the first suspicious file. Follow the data and control flow until the behavior can be explained.

### 5. Inspect Relevant Code

Inspect:

- Entry points
- Event handlers
- Command handlers
- Services
- Utilities
- Database queries
- RPC functions
- Edge Functions
- API routes
- Frontend state management
- UI components
- Configuration
- Environment variables
- Relevant dependencies

Only inspect files that are relevant to the execution path unless broader inspection is necessary.

### 6. Check State and Data

When state or data is involved, verify:

- Input values
- Intermediate values
- Database records
- Query filters
- Returned values
- Null/undefined handling
- Cached state
- Client state
- Server state
- Timing-dependent state

Determine whether the problem is caused by:

- Missing data
- Incorrect data
- Correct data being filtered incorrectly
- Correct data not being returned
- Correct data not being stored
- Correct data not reaching the next layer
- Correct data being overwritten
- Stale state

### 7. Check Integration Boundaries

For systems involving external services, inspect boundaries such as:

- Discord API
- Supabase
- REST APIs
- Webhooks
- Payment systems
- Authentication providers
- Background jobs
- Queues

Check:

- Request payloads
- Response payloads
- Authentication
- Authorization
- Permissions
- Timeouts
- Rate limits
- Retries
- Duplicate requests
- Idempotency
- Partial failures

### 8. Check Asynchronous Behavior

When applicable, investigate:

- Race conditions
- Missing `await`
- Unhandled promises
- Concurrent writes
- Event ordering
- Duplicate events
- Delayed database updates
- Stale UI state
- Retry behavior

Do not assume asynchronous operations complete in the order they appear in source code.

### 9. Check Configuration

When behavior differs between environments, inspect:

- Environment variables
- API URLs
- Feature flags
- Production configuration
- Discord permissions
- Supabase configuration
- Deployment configuration
- Dependency versions

Never expose secret values in the diagnosis.

### 10. Identify Root Cause

Classify the diagnosis as one of:

- Confirmed root cause
- Highly likely root cause
- Possible root cause
- Insufficient evidence

For confirmed or highly likely causes, provide the evidence supporting the conclusion.

If multiple root causes exist, rank them by impact and confidence.

## Common Failure Patterns

Actively consider these patterns when relevant:

### Logic Errors
- Incorrect condition
- Incorrect state transition
- Wrong calculation
- Incorrect default behavior
- Incorrect branch selection

### Data Errors
- Wrong query
- Wrong filter
- Missing relationship
- Incorrect mapping
- Duplicate records
- Missing constraint

### State Errors
- Stale state
- State overwritten
- State not persisted
- State initialized incorrectly

### Integration Errors
- Incorrect API payload
- Incorrect API response handling
- Missing permission
- Authentication failure
- Rate limit
- Timeout

### Async Errors
- Missing `await`
- Race condition
- Duplicate execution
- Event ordering issue
- Retry causing duplicate side effects

### Authorization Errors
- Missing permission check
- Incorrect role check
- Incorrect RLS policy
- Client-side-only authorization

### Environment Errors
- Missing environment variable
- Incorrect production configuration
- Version mismatch
- Different runtime behavior

## Supabase Diagnosis

When Supabase is involved, additionally inspect:

- Table schema
- Relationships
- Constraints
- Indexes
- RLS
- RLS policies
- RPC functions
- Edge Functions
- Query filters
- Authentication context
- Database errors
- Transaction behavior
- Concurrent writes

Check whether the application is correctly handling:

- Database success
- Database failure
- Empty results
- Null values
- Partial operations

Never weaken RLS or bypass authorization merely to make the feature work.

## Discord Diagnosis

When Discord is involved, additionally inspect:

- Slash command registration
- Interaction handlers
- Buttons
- Select menus
- Modals
- Required intents
- Bot permissions
- Role hierarchy
- Channel permissions
- Missing/deleted resources
- Discord API responses
- Rate limits
- Interaction acknowledgement
- Duplicate events
- Event ordering

Pay special attention to operations that combine Discord state and database state.

For example:

Discord event
→ database update
→ Discord response

Determine what happens if either operation succeeds while the other fails.

## Evidence Requirements

For every important conclusion, provide evidence such as:

- Relevant source code
- Execution path
- Log entry
- Database state
- API response
- Test result
- Reproduction behavior

Do not present speculation as fact.

## Output Format

Use this structure:

# System Diagnosis

## Problem

Briefly describe the reported problem.

## Expected Behavior

Describe what should happen.

## Actual Behavior

Describe what currently happens.

## Execution Flow

Show the relevant execution path.

Example:

User
→ Discord interaction
→ Handler
→ Service
→ Supabase RPC
→ Response

## Expected vs Actual

| Stage | Expected | Actual | Status |
|---|---|---|---|
| ... | ... | ... | PASS/FAIL |

## Findings

### Finding 1 — Severity

**Status:** Confirmed / Highly Likely / Possible

**Location:** `path/to/file.ts:line`

**Problem:** Explain the issue.

**Evidence:** Explain why this conclusion was reached.

**Impact:** Explain what this causes.

Repeat for additional findings.

## Root Cause

State the most likely root cause clearly.

If uncertain, explain what evidence is missing.

## Recommended Fix

Describe the smallest appropriate fix.

Do not implement it during diagnosis.

## Risks

List potential side effects or regression risks.

## Verification Plan

Describe how the fix should be verified after implementation.

## Next Step

If the diagnosis is sufficiently confirmed, recommend:

- `/fix-error` for a focused bug fix
- `/goal` when implementing a clearly defined multi-step fix
- `/plan` when the issue requires architectural or multi-file planning

Do not modify code unless the user explicitly requests implementation.

## Quality Standard

A successful diagnosis should answer:

1. What should happen?
2. What actually happens?
3. Where does the behavior first diverge?
4. Why does it diverge?
5. What evidence supports the diagnosis?
6. What should be changed?
7. How should the fix be verified?

Do not stop at symptoms when the underlying cause can be determined.