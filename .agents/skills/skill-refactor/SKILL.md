# Skill: Code Refactoring (`skill-refactor`)

## Objective
To systematically improve the existing codebase of the Bear Cafe Discord Bot without altering its external behavior. This skill focuses on reducing technical debt, eliminating code duplication, separating concerns, and improving overall maintainability.

## Triggered When
*   "Spaghetti code" is detected (e.g., UI building, DB querying, and business logic all in one function).
*   Multiple files share the exact same logic or UI payload structure.
*   Preparing an old module to integrate with a new feature.
*   Optimizing Supabase queries to reduce network payload/egress.

## Refactoring Principles & Strategies

### 1. Separation of Concerns (SoC)
*   **Target:** `index.js` or `handler.js` files that exceed 200 lines due to inline payload definitions.
*   **Action:** Extract UI definitions into a dedicated `payloadBuilder.js`. Extract database interactions into `services.js`. The handler should only act as a traffic director.

### 2. DRY (Don't Repeat Yourself)
*   **Target:** Repeated bitwise flags (`const FLAG_V2 = 32768`), redundant Button builders, or repeated Canvas setup code.
*   **Action:** Centralize constants in `config.js` or a constants file. Use Shared UI Components (e.g., `src/features/shared/tarotComponents.js`).

### 3. Supabase Query Optimization
*   **Target:** Multiple sequential database calls in a single interaction.
*   **Action:** 
    *   Refactor to use a single Supabase query with `select('*, relations(*)')`.
    *   Implement Redis or in-memory LRU caching for static configurations to save Supabase Egress.

### 4. Safety Wrapper Implementation
*   **Target:** Raw `interaction.reply()` or `interaction.deferUpdate()` calls.
*   **Action:** Replace all raw Discord API response calls with wrappers from `utils/discordSafety.js` to ensure standardized error handling and timeout prevention.

## Execution Workflow
1.  **Audit:** Analyze the target file/module and identify violations of SoC or DRY.
2.  **Plan:** Draft the new file structure and module boundaries.
3.  **Extract:** Move UI, Logic, and DB calls into their respective isolated files.
4.  **Wire:** Update the main handler to import and use the newly extracted modules.
5.  **Verify:** Ensure the bot's behavior remains identical to the pre-refactored state.