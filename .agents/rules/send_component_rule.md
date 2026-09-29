# Rule: Use Slash Command /send-component for Discord Boards & Component V2 Panels

## Core Constraints
1. **NEVER use prefix commands (e.g. `b!reset-warn`, `b!reset-verify`, `b!reset-notice`, `b!reset-staff`, `b!reset-donate`, `b!reset-form`, `b!reset-color`)** to setup, reset, or send boards and Component V2 cards in Discord.
2. **ALWAYS use the slash command `/send-component`** for sending and setting up all system boards, agreements, menus, shift panels, and component cards.
3. **TOP-LEVEL FUNCTION SCOPE IN MODULE EXPORTS**: ฟังก์ชันสร้าง Payload สำหรับพาเนลที่ถูกเรียกโดย `/send-component` (เช่น `buildRegistrationPanelPayload`, `buildMainPanelPayload`, `buildTopDonateComponents`) **ต้องถูกประกาศไว้ที่ Top-Level Module Scope เสมอ** ห้ามประกาศไว้ใน Nested Scope หรือ Event Callback (เช่น `client.on(...)`) เด็ดขาด เพื่อป้องกันปัญหา `ReferenceError` เมื่อ Node.js โหลดโมดูล

## Available Choices in `/send-component` (14 รายการ):
1. `terms`: 1️⃣ บอร์ดอ่านข้อตกลงและนโยบาย (Terms)
2. `menu`: 2️⃣ บอร์ดเมนูเครื่องดื่มและสั่งบริการ (Menu)
3. `shift`: 3️⃣ แผงตอกบัตรเข้ากะของทีมงาน (Shift)
4. `violation_history`: 4️⃣ ประวัติการทำผิดกฎ (Violation History)
5. `verify_panel`: 5️⃣ บอร์ดลงทะเบียนสมาชิกใหม่ (Registration Panel)
6. `notice_panel`: 6️⃣ แผงเลือกรับการแจ้งเตือน (Notifications Select)
7. `staff_welcome_msg`: 7️⃣ แผงตั้งค่าข้อความต้อนรับทีมงาน (Staff Welcome Msg)
8. `top_donate`: 8️⃣ กระดานยอดโดเนทสะสม (Top Donate Board)
9. `voice_board`: 9️⃣ บอร์ดห้องเสียงหาเพื่อน (Voice Board)
10. `daily_quest`: 🔟 กระดานเควสประจำวัน (Daily Quest Board)
11. `recruitment_form`: 1️⃣1️⃣ แผงเปิดรับสมัครทีมงาน (Recruitment Form)
12. `color_roles`: 1️⃣2️⃣ แผงเลือกและเปลี่ยนยศสี (Color Roles Panel)
13. `minigame_top`: 1️⃣3️⃣ กระดานจัดอันดับหมีติดเกม (Minigame Leaderboard)
14. `feedback`: 1️⃣4️⃣ กล่องความประทับใจ (Public Showcase Preview)
