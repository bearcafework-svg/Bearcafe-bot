---
name: ship
description: Pre-deploy gatekeeper, Discord summary generator, and Git deployment synchronizer. Audits for leftover debug code and secrets, generates clean Discord summaries for the dev team, and handles Conventional Commit and Git Push.
---

# Pre-Deploy & Delivery Skill (`/ship`)

Use this skill when completing a task, feature, or bugfix to:
1. **Pre-Deploy Gatekeeper**: Scan git diff, remove console.logs/secrets, check edge cases.
2. **Discord Summary Generator**: Generate clean markdown summary for dev team.
3. **Git Delivery**: Run git add, conventional commit, and git push main.
