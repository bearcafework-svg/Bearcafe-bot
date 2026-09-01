# Skill: Feature Development (`skill-feature`)

## Objective
To guide the end-to-end development of new features for the Bear Cafe Discord Bot. This skill ensures that new features are built consistently, securely, and efficiently, adhering to the project's architecture, database constraints (Supabase), and Discord UI standards.

## Triggered When
*   Developing a new Discord command or interaction.
*   Implementing a new backend logic flow (e.g., Minigames, Point systems, Store).
*   Integrating new database tables or Supabase RPCs.

## Execution Workflow

### Phase 1: Database & Backend Planning (Supabase)
1.  **Schema Design:** Define tables, columns, and foreign keys. Ensure Row Level Security (RLS) is considered if applicable.
2.  **Quota & Egress Optimization:** 
    *   Design queries to fetch *only* necessary columns.
    *   Avoid N+1 query problems; use JOINs or Supabase RPCs (Stored Procedures) for complex aggregations.
    *   Implement caching strategies for frequently accessed, rarely changing data to prevent "Egress Exceeded" or "All services are restricted" errors.

### Phase 2: Business Logic Isolation
1.  **Service Layer:** Place heavy computational logic, math (e.g., gacha rates, point calculations), and direct database interactions in `src/features/<feature_name>/services/`.
2.  **Decoupling:** Do not write business logic directly inside the Discord Interaction Handler.

### Phase 3: Discord Controller & Handler
1.  **Event Handling:** Map the Discord interaction (Command, Button, Modal) to the appropriate service function.
2.  **Safety First:** Always wrap interactions using the `discordSafety.js` helpers (`safeDeferReply`, `safeRespond`) to prevent the 3-second `10062 Unknown Interaction` timeout.
3.  **Error Handling:** Implement `try-catch` blocks. Return user-friendly error messages using the Ephemeral V2 Flag (`flags: 32768 | 64`).

### Phase 4: UI / Feedback Generation
1.  **Components V2:** Use `skill-ui` guidelines to build the interface using `type: 17` containers.
2.  **Canvas Assets:** If the feature requires dynamic imagery, implement `@napi-rs/canvas` generators utilizing the `Noto Sans Thai` font and Bear Cafe color palette.

## Definition of Done (DoD)
- [ ] Database queries are optimized for Supabase egress limits.
- [ ] UI correctly implements Components V2 (No legacy Embeds for dashboards).
- [ ] Interaction is protected against Discord timeouts.
- [ ] Edge cases (e.g., user not found, insufficient points) are handled with Ephemeral UI messages.