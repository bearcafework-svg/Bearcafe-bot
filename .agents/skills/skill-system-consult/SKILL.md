---
name: skill-system-consult
description: Provides system architecture and product design consultation before implementation. Analyzes requirements, architecture, database design, user flows, security, scalability, edge cases, trade-offs, and recommends the most suitable approach.
---

# System Consultation

Use this skill when the user wants advice, design guidance, architecture decisions, or technical consultation for a new system or feature.

The primary goal is to help the user make a good technical decision before implementation.

## Core Rules

- Do not start implementing code unless explicitly requested.
- Do not assume missing requirements.
- Ask focused questions only when missing information would materially change the recommendation.
- Inspect the existing project structure and relevant code when available.
- Reuse existing architecture, services, utilities, and database structures when appropriate.
- Avoid unnecessary complexity.
- Prefer simple, maintainable, and scalable designs.
- Clearly distinguish facts, assumptions, recommendations, and alternatives.
- Consider both current requirements and reasonable future growth.
- Do not recommend technology changes without a concrete benefit.
- Never recommend weakening authentication, authorization, RLS, validation, or security merely for convenience.

## Consultation Process

### 1. Understand the Goal

Identify:

- What the system or feature is supposed to accomplish.
- Who will use it.
- What problem it solves.
- What the expected user experience is.
- What constraints already exist.

### 2. Inspect Existing Architecture

When working inside an existing project:

- Inspect relevant folders and files.
- Identify existing services and abstractions.
- Identify existing database tables and relationships.
- Check existing APIs, RPCs, Edge Functions, and integrations.
- Identify conventions that should be preserved.
- Avoid proposing duplicate systems when an existing component can be extended.

### 3. Design the System

Consider:

- Architecture
- Components
- Data flow
- User flow
- Database structure
- API boundaries
- Authentication
- Authorization
- Permissions
- Validation
- Error handling
- State management
- Background jobs
- Caching
- Rate limits
- Idempotency
- Logging
- Monitoring
- Failure recovery

### 4. Database Design

When a database is involved:

- Identify required entities.
- Define relationships.
- Recommend appropriate primary and foreign keys.
- Consider indexes and query patterns.
- Consider uniqueness and constraints.
- Consider lifecycle and deletion behavior.
- Consider migration strategy.
- Check whether existing tables can be reused.
- Avoid creating redundant tables.

For Supabase specifically:

- Consider RLS requirements.
- Consider RPC functions where atomic operations are needed.
- Consider Edge Functions for privileged or server-side operations.
- Never expose sensitive data unnecessarily.
- Never assume frontend requests are trusted.

### 5. Discord-Specific Considerations

When designing Discord Bot systems, consider:

- Guild, channel, role, and user permissions.
- Slash commands and interactions.
- Buttons, select menus, and modals.
- Required intents.
- Discord API rate limits.
- Interaction acknowledgement deadlines.
- Missing or deleted Discord resources.
- Permission drift.
- Duplicate events.
- Retry behavior.
- Idempotency.
- Synchronization between Discord state and database state.

### 6. Edge Cases

Always identify important edge cases such as:

- Duplicate requests.
- Concurrent requests.
- Expired resources.
- Deleted Discord channels or roles.
- User permissions changing after creation.
- Partial failures.
- Database success but Discord API failure.
- Discord success but database failure.
- Retries.
- Timeouts.
- Invalid or missing input.
- Existing users and legacy data.

### 7. Compare Alternatives

When multiple approaches are reasonable:

Present a concise comparison.

Example:

| Approach | Advantages | Disadvantages | Recommendation |
|---|---|---|---|
| A | ... | ... | ... |
| B | ... | ... | ... |
| C | ... | ... | ... |

Do not present alternatives merely for the sake of variety.

Recommend one approach when the available evidence supports it.

## Recommended Output

Use the following structure when enough information is available:

# System Consultation

## Goal

Brief description of the requested system.

## Current Architecture

Relevant existing architecture and components.

## Recommended Architecture

Describe the recommended design and why it fits the project.

## User Flow

Describe the expected user journey step by step.

## System Flow

Describe how components communicate.

Example:

User
→ Discord Bot
→ Service Layer
→ Supabase
→ Discord API

## Database Design

List proposed or modified tables, important fields, relationships, indexes, and constraints.

## Security

Cover:

- Authentication
- Authorization
- RLS
- Permission checks
- Input validation
- Secret handling
- Abuse prevention

## Edge Cases

List important failure scenarios and how the system should handle them.

## Alternatives

Only include meaningful alternatives and explain the trade-offs.

## Recommendation

Give one clear recommendation with reasoning.

## Implementation Considerations

List important considerations that should be carried into implementation.

## Suggested Next Step

If the design is sufficiently defined, recommend using `/plan` to create the implementation plan.

Do not implement the system unless explicitly requested.

## Communication Style

- Be direct and technical.
- Prefer structured explanations.
- Explain the reasoning behind important architectural decisions.
- Avoid unnecessary jargon when it does not improve clarity.
- Do not overwhelm the user with low-impact details.
- Prioritize decisions that affect architecture, security, data integrity, cost, or future maintenance.