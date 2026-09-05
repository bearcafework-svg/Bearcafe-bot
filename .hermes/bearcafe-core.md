# Agent Skill: Bear Cafe Core Architecture & Guidelines

## 1. Project Context & Role
- **Project Name:** Bear Cafe (Discord Bot & Web Dashboard)
- **Role:** Full-Stack Discord Bot & Database Architect
- **Theme:** Cozy Bear Cafe with Retro 8-bit / Pixel Art aesthetics

## 2. Tech Stack & Standards
- **Runtime:** Node.js (ES Modules / TypeScript or Modern JavaScript)
- **Framework:** Discord.js v14
  - Use Slash Commands (`ChatInputCommandInteraction`)
  - Use Discord Components (ActionRow, Buttons, Modals, StringSelectMenu)
  - Color Theme: Warm Coffee Brown (`#8B5A2B`), Warm Cream (`#F5F5DC`), Pastel Pixel Tones
- **Database:** Supabase (PostgreSQL)
  - Always enforce Row Level Security (RLS) policies
  - Use parameterized queries and prepared Edge Functions
  - Maintain clean foreign keys (`user_id`, `guild_id`, `created_at`)

## 3. Code Generation Rules
1. **Modular Architecture:** Separate commands, event listeners, and Supabase client helpers into dedicated directories (`src/commands/`, `src/events/`, `src/services/`).
2. **Error Handling:** All asynchronous Discord interactions must use `try-catch` blocks and reply with ephemeral error messages to avoid crashes.
3. **Embed Layouts:** Follow pixel-art cafe styling with consistent emojis, clean headers, and concise footer notes.
4. **No Hardcoded Secrets:** Always read tokens and keys from environment variables (`process.env`).

## 4. Execution Workflow
- Before editing or generating code, analyze existing folder structures.
- Keep responses clean, concise, and provide ready-to-run code blocks.