# Rule: HealJai Project Features & Commands are Strictly DEV-Only

## Core Constraints (STRICT)
1. **ห้ามบอทหลักตอบสนองหรือลงทะเบียนคำสั่งโปรเจกต์ฮีลใจเด็ดขาด**:
   - ระบบโปรเจกต์ฮีลใจ (Heal Jai System) ทั้งหมดต้องทำงานเฉพาะบน **Bot Dev (Secondary Bot)** เท่านั้น
   - บอทหลัก (Production Mode / Main Bot) ห้ามลงทะเบียน Slash Command และห้ามตอบสนองต่อ Interactions ที่เกี่ยวกับโปรเจกต์ฮีลใจ

2. **การเพิ่ม Slash Command ใหม่ของโปรเจกต์ฮีลใจ**:
   - เมื่อมีการเพิ่ม Slash Command ใหม่สำหรับฮีลใจ ต้องเพิ่มชื่อคำสั่งลงใน:
     - `HEALJAI_COMMANDS` ใน `src/commands/slashCommandRegistry.js` และ `src/main/commands/slashCommandRegistry.js`
     - `DEV_SLASH_COMMANDS` (Default whitelist)
     - รายการตรวจสอบใน `utils/guildFilter.js`
   - เพื่อให้คำสั่งถูกซิงก์เฉพาะเมื่อ `isDevMode === true` และถูกกรองออกจากบอทหลักโดยอัตโนมัติ

3. **การตรวจสอบใน Event & Interaction Routers**:
   - ตรวจสอบ `guildFilter.js` ทุกครั้งเมื่อมี Interaction หรือ Message Event ใหม่เกี่ยวกับฮีลใจ เพื่อให้แน่ใจว่าทำงานเฉพาะในสภาพแวดล้อม Dev Sandbox ที่ได้รับอนุญาตเท่านั้น
