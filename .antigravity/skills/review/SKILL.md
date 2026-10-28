---
name: review
description: Comprehensive quality, security, and scope auditor. Evaluates code changes across Discord Bot safety, Supabase RLS/Egress efficiency, clean architecture, and explicitly declares 'Good Enough' to halt over-engineering.
---

# Unified Quality & Architecture Review (`/review`)

Use this skill to:
1. **Discord Safety Audit**: 3-second timeout protection (safeDeferReply), Component V2 rules.
2. **Supabase & Database Audit**: RLS policies, connection pooling, indexed queries.
3. **Clean Architecture Audit**: Controller -> Service -> Model separation, Mirror Invariant.
4. **Scope Control**: Declare "Good Enough" to halt over-engineering.
