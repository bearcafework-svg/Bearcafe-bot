# Skill: Project Audit & Scope Control (`skill-audit`)

## Objective
To comprehensively scan the entire project repository (including the Discord Bot and Web components) to evaluate code health, feature completeness, and architectural consistency. Its primary goal is to identify necessary improvements while strictly preventing "over-engineering" by explicitly declaring when a module is "good enough" to be left alone.

## Triggered When
*   A major milestone is reached and you want a system-wide health check.
*   You feel stuck in an infinite loop of tweaking and refactoring.
*   You need an objective assessment of both the Discord Bot and the Web platform to prioritize the next steps.

## Evaluation Criteria
The audit evaluates the project across three main tiers:
1.  **Discord Bot Layer:** Interaction safety (preventing 10062 errors), payload sizes, Components V2 usage, and Canvas memory leaks.
2.  **Web / Frontend Layer:** UI/UX responsiveness, API routing efficiency, state management, and asset loading.
3.  **Database & Infrastructure (Supabase):** Query optimization, RLS (Row Level Security) enforcement, and preventing Egress Quota limits.

## Audit Output Template
When executing an audit, output the results using the following structure:

### 🛡️ Project Health Audit Report

🔴 **Critical Action Required (Must Fix):**
*   *List issues that cause crashes, data leaks, or hit service quotas (e.g., Supabase egress drains, unhandled timeouts).*

🟡 **Optimization Backlog (Can wait):**
*   *List technical debt or minor UI inconsistencies that should be fixed later but aren't blocking a release.*

🟢 **"Good Enough" - STOP EDITING:**
*   *Explicitly list modules, files, or features that are stable, functional, and meet the requirements. Instruct the developer to stop touching these to prevent over-engineering.*

💡 **Final Verdict & Next Step:**
*   *Provide a one-sentence summary of the project's current state and the single most important task to do next.*