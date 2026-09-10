# Rule: Use Slash Command /send-component for Discord Boards

## Core Constraint
- **NEVER use prefix commands (e.g. `b!reset-terms`, `b!reset-menu`, `b!reset-shift`, or any `b!...`)** to setup, reset, or send boards and Component V2 cards in Discord.
- **ALWAYS use the slash command `/send-component`** for sending and setting up all system boards, agreements, menus, shift panels, and component cards.

## Command Specification: `/send-component`
- **Command Name**: `send-component`
- **Permissions**: Staff / Admin / Owner only (`PermissionFlagsBits.ManageGuild` or `Administrator`).
- **Options**:
  - `component` (String, required): Choices include:
    - `terms`: 1. บอร์ดอ่านข้อตกลงและนโยบาย
    - `menu`: 2. บอร์ดเมนูเครื่องดื่มและสั่งบริการ
    - `shift`: 3. แผงตอกบัตรเข้ากะของทีมงาน
    - `feedback`: 7. กล่องส่งความประทับใจ (พรีวิว)
  - `channel` (Channel, optional): Target text channel to send the card into. If omitted, sends to the current channel where the slash command was executed.
