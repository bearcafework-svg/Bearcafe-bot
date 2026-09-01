# Bear Café Bot — Technical Knowledge Base & SOPs

บันทึกองค์ความรู้ เทคนิคเฉพาะทาง (Tech Quirks) และมาตรฐานการแก้ปัญหาประจำโปรเจกต์ Bear Café Bot

---

### 1. Discord 3-Second Interaction Timeout (`10062 Unknown Interaction`)
**Date:** 2026-09-01  
**Domain:** Discord API / Node.js  
**Description of Issue:**  
ผู้ใช้งานพิมพ์คำสั่ง Slash Command แล้ว Discord แสดงข้อผิดพลาด `🔴 แอปพลิเคชันไม่ตอบสนอง` (Application Did Not Respond / Interaction Code 10062)

**Root Cause:**  
ใน Interaction Listener บอททำการประมวลผลคำสั่ง Async (เช่น การอ่านไฟล์/คิวรีฐานข้อมูล/สะสมนาทีห้องเสียง) ก่อนที่จะส่งสัญญาณ Ack ตอบรับกับ Discord API หากกระบวนการใช้เวลานานเกิน 3 วินาที (3,000 ms) Discord จะยกเลิก Interaction Token ทันที

**Resolution / Workaround:**  
1. ในบรรทัดแรกของ Slash Command Handler ที่มีการทำงาน Async ต้องเรียก `safeDeferReply(interaction, { flags: MessageFlags.Ephemeral })` เสมอ
2. ส่งตอบกลับผลลัพธ์ผ่าน `safeRespond(interaction, payload)` จาก [`utils/discordSafety.js`](file:///d:/bearcafe-bot/utils/discordSafety.js)

```javascript
const { safeRespond, safeDeferReply } = require("../../../utils/discordSafety");

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "เควสของฉัน") return;

  // ✅ ตอบรับ Interaction ทันที ป้องกัน Timeout 3 วินาที
  await safeDeferReply(interaction, { flags: FLAG_EPHEMERAL });

  // ... ประมวลผล async ...

  // ✅ ส่งข้อความตอบกลับด้วย safeRespond
  await safeRespond(interaction, payload);
});
```

**Related Files:**  
- [`src/features/dailyQuest/index.js`](file:///d:/bearcafe-bot/src/features/dailyQuest/index.js)
- [`utils/discordSafety.js`](file:///d:/bearcafe-bot/utils/discordSafety.js)

---

### 2. Supabase Egress Quota Exceeded (Zero Egress Fallback Architecture)
**Date:** 2026-09-01  
**Domain:** Supabase / Database Architecture  
**Description of Issue:**  
Supabase แจ้งเตือน `exceed_egress_quota` (402 Payment Required / Restricted) ส่งผลให้คำสั่ง Query/Insert/Update ทั้งหมดโดนบล็อก

**Root Cause:**  
ปริมาณข้อมูลส่งออก (Outbound Egress) เกินโควต้าของแพ็กเกจประจำเดือน

**Resolution / Workaround:**  
ออกแบบสถาปัตยกรรมแบบ **Decoupled Zero-Egress Fallback Mode**:
1. เมื่อสร้างฟีเจอร์ใหม่ ให้สร้าง Local JSON Storage Adapter (เช่น `mockStorage.js`, `mockDailyQuestStore.js`)
2. ใน Service Layer ให้ตรวจสอบว่าหาก `supabase` เป็น `null` หรือระงับอยู่ ให้สลับไปอ่าน/เขียนข้อมูลใน Local JSON Storage ทันที
3. เมื่อ Supabase ปลดล็อกโควต้าในอนาคต ระบบจะสลับกลับไปใช้ Supabase โดยไม่ต้องเขียนโค้ด UI หรือ Canvas ใหม่

```javascript
async function getOrAssignDailyQuests(supabase, userId) {
  if (!supabase) {
    const { getOrAssignDailyQuestsLocal } = require("./mockDailyQuestStore");
    return getOrAssignDailyQuestsLocal(userId);
  }
  // ... Supabase logic ...
}
```

**Related Files:**  
- [`src/features/beeGacha/mockStorage.js`](file:///d:/bearcafe-bot/src/features/beeGacha/mockStorage.js)
- [`src/features/dailyQuest/mockDailyQuestStore.js`](file:///d:/bearcafe-bot/src/features/dailyQuest/mockDailyQuestStore.js)
- [`src/features/dailyQuest/dailyQuestManager.js`](file:///d:/bearcafe-bot/src/features/dailyQuest/dailyQuestManager.js)

---

### 3. Canvas Layered Compositing Engine (One-Canvas Template Rule)
**Date:** 2026-09-01  
**Domain:** Canvas / `@napi-rs/canvas`  
**Description of Issue:**  
ความยุ่งยากในการคำนวณพิกัด X/Y เมื่อซ้อนภาพชิ้นส่วนแต่งตัว (หมวก, ชุด, ของถือ) บนตัวละคร ทำให้ชิ้นส่วนเหลื่อมตำแหน่งเมื่อขนาดไฟล์รูปภาพไม่เท่ากัน

**Root Cause:**  
การใช้วิธีคำนวณ Offset พิกัด X/Y แยกตามชิ้นส่วน ทำให้เกิดบั๊กตำแหน่งเคลื่อนได้ง่ายเมื่อเปลี่ยนรูปภาพ

**Resolution / Workaround:**  
บังคับใช้กฎ **One-Canvas Template Rule (500x500 px 32-bit Transparent PNGs)**:
1. ทุกชิ้นส่วน (หมวก/ชุด/ของถือ) ต้องวาดบนผืน Canvas ขนาด `500x500` px เท่ากันพอดี โดยวางตำแหน่งตรงกับหัว/ตัวของผึ้งบนผืน Canvas นั้นเลย
2. โค้ด Canvas Renderer ใน Node.js จะวาดซ้อนทับภาพง่ายๆ ด้วย `ctx.drawImage(img, 0, 0, 500, 500)` ที่ตำแหน่ง `(0, 0)` ทุกรูป
3. ได้ความเร็วในการประมวลผลสูง ( sub-15ms ) และตำแหน่งตรงเป๊ะ 100%

```javascript
// ซ้อนภาพตำแหน่ง (0, 0) ทุกชิ้นส่วน
if (bgImg) ctx.drawImage(bgImg, 0, 0, 500, 500);
ctx.drawImage(baseBeeImg, 0, 0, 500, 500);
if (outfitImg) ctx.drawImage(outfitImg, 0, 0, 500, 500);
if (hatImg) ctx.drawImage(hatImg, 0, 0, 500, 500);
if (accImg) ctx.drawImage(accImg, 0, 0, 500, 500);
```

**Related Files:**  
- [`src/features/beeGacha/beeRenderer.js`](file:///d:/bearcafe-bot/src/features/beeGacha/beeRenderer.js)
- [`src/utils/fontLoader.js`](file:///d:/bearcafe-bot/src/utils/fontLoader.js)
