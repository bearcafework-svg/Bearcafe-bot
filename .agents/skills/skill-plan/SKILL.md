---
name: skill-plan
description: Creates a detailed, implementation-ready plan for building or modifying a system. Inspects the existing codebase, identifies affected files and dependencies, evaluates risks, and defines a clear execution and verification strategy before implementation.
---

# Implementation Planning

Use this skill when the user has a clear requirement and wants a structured implementation plan before code changes begin.

The primary goal is to transform a requirement or approved system design into a precise, implementation-ready plan.

## Core Rules

- Do not modify code while creating the plan.
- Inspect the existing codebase before proposing changes.
- Do not invent files, functions, tables, APIs, or architecture without evidence.
- Reuse existing architecture and utilities when appropriate.
- Avoid unnecessary rewrites and large refactors.
- Identify dependencies and affected components.
- Consider security, data integrity, performance, and backward compatibility.
- Identify uncertainties and assumptions explicitly.
- If the requirement is ambiguous and materially affects the implementation, ask focused questions.
- Do not begin implementation until the plan is complete and the user requests execution.

## Planning Process

### 1. Understand the Requirement

Identify:

- Goal
- User-facing behavior
- Functional requirements
- Non-functional requirements
- Constraints
- Existing systems that must remain compatible
- Expected success criteria

Convert vague requirements into concrete implementation requirements when possible.

### 2. Inspect the Existing Project

Before creating the plan, inspect relevant parts of the repository.

Look for:

- Project structure
- Entry points
- Existing services
- Components
- Utilities
- Database access
- API routes
- RPC functions
- Edge Functions
- Discord handlers
- Configuration
- Tests
- Existing related features

Prefer extending existing code over creating duplicate functionality.

### 3. Identify the Change Surface

Determine which parts of the project will be affected.

Classify them as:

- New files
- Modified files
- Deleted files
- Database changes
- Configuration changes
- External integrations
- Tests

Do not list unrelated files.

### 4. Define the Architecture

Explain how the new or modified feature fits into the existing architecture.

Describe:

- Components
- Responsibilities
- Data flow
- Control flow
- Integration boundaries
- State transitions

Example:

User
→ Discord Interaction
→ Command Handler
→ Service
→ Supabase RPC
→ Database
→ Response

### 5. Database Planning

If a database is involved, define:

- Tables to create or modify
- Columns
- Relationships
- Primary keys
- Foreign keys
- Unique constraints
- Indexes
- Defaults
- Data lifecycle
- Migration requirements
- Backward compatibility

For Supabase, also consider:

- RLS
- Policies
- RPC functions
- Edge Functions
- Authentication context
- Authorization

Do not weaken RLS or security to simplify implementation.

### 6. API and Integration Planning

For external services, define:

- Requests
- Responses
- Authentication
- Permissions
- Error handling
- Retry behavior
- Rate limits
- Timeouts
- Idempotency

For Discord, consider:

- Commands
- Interactions
- Events
- Intents
- Permissions
- Role hierarchy
- Channel access
- Interaction acknowledgement
- API rate limits
- Duplicate events

### 7. Edge Cases

Identify important scenarios such as:

- Missing data
- Invalid input
- Duplicate requests
- Concurrent requests
- Existing users
- Existing records
- Deleted Discord resources
- Permission changes
- API failures
- Database failures
- Partial failures
- Retries
- Timeouts
- Expired resources

Prioritize realistic and impactful edge cases.

### 8. Security

Review:

- Authentication
- Authorization
- Input validation
- RLS
- Permission checks
- Secret handling
- User-controlled data
- Abuse prevention
- Rate limiting

Do not expose secrets or sensitive information.

### 9. Testing Strategy

Define how the implementation should be verified.

Consider:

- Unit tests
- Integration tests
- Database tests
- API tests
- Discord behavior
- Error cases
- Permission cases
- Edge cases
- Regression tests

Testing should verify behavior, not merely code execution.

### 10. Deployment Considerations

If relevant, identify:

- Environment variables
- Database migrations
- Required permissions
- Deployment order
- Backward compatibility
- Rollback considerations
- Production configuration

Do not deploy during planning.

## Plan Structure

Use this output structure:

# Implementation Plan

## 1. Objective

Briefly describe what will be built or changed.

## 2. Current Architecture

Describe the existing architecture relevant to the task.

## 3. Proposed Architecture

Explain how the feature will fit into the existing system.

## 4. User Flow

Describe the user-facing flow step by step.

## 5. System Flow

Describe the internal execution and data flow.

## 6. Files to Change

Use a table:

| File | Action | Purpose |
|---|---|---|
| `path/to/file.ts` | Modify | ... |
| `path/to/new-file.ts` | Create | ... |

Only include files supported by repository inspection.

## 7. Database Changes

If applicable:

| Object | Action | Details |
|---|---|---|
| `table_name` | Create/Modify | ... |
| `rpc_name` | Create/Modify | ... |

Include RLS and migration considerations.

## 8. Implementation Steps

List the implementation in dependency order.

Example:

1. Add database migration.
2. Add/update RPC.
3. Add service logic.
4. Update Discord handler.
5. Update UI.
6. Add error handling.
7. Add tests.
8. Run verification.

Each step should explain what needs to change and why.

## 9. Edge Cases

List important edge cases and expected handling.

## 10. Security Considerations

List relevant security requirements.

## 11. Testing Plan

Describe exact verification required after implementation.

## 12. Risks

List possible regression, migration, compatibility, or operational risks.

## 13. Assumptions

List assumptions made because information was unavailable.

## 14. Final Recommendation

Summarize the recommended implementation approach.

## 15. Execution Readiness

End with one of:

### READY
The requirements and architecture are sufficiently clear for implementation.

### NEEDS CLARIFICATION
List the specific questions that must be answered before implementation.

## Important Behavior

This skill creates a plan only.

Do not:

- Edit source files
- Create migrations
- Modify database schema
- Run deployment commands
- Rewrite existing code
- Make production changes

unless the user explicitly switches from planning to implementation.

## Handoff

After the plan is approved:

- Use `/goal` when the implementation is straightforward and well-defined.
- Use `/goal` with the approved plan for normal feature implementation.
- Use `/system-consult` again if a major architectural decision changes.
- Use `/review-code` after implementation.
- Use `/supabase-check` if the implementation changes Supabase.
- Use `/discord-check` if the implementation changes Discord behavior.
- Use `/pre-deploy` before production deployment.

## Quality Standard

A good plan must allow another developer or agent to implement the feature without having to rediscover the architecture from scratch.

The plan should answer:

1. What are we building?
2. Where does it belong?
3. Which files change?
4. What database changes are required?
5. How does data flow through the system?
6. What can go wrong?
7. How is security handled?
8. How will the implementation be tested?
9. What risks exist?
10. Is the task ready for implementation?