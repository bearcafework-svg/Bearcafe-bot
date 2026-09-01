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

---

### 4. Minigame Restart Anti-Spam (Smart Discord Message Recovery)
**Date:** 2026-09-01  
**Domain:** Discord API / Minigames Engine  
**Description of Issue:**  
เมื่อทำการรีสตาร์ทบอท (PM2 Restart / Deploy) บอทส่งข้อความโจทย์มินิเกมใหม่ลงทุกช่องโดยอัตโนมัติ ส่งผลให้เกิดข้อความรกในช่องสนทนามุมมองของผู้ใช้

**Root Cause:**  
1. เมื่อบอทเปิดขึ้นมา หากใน RAM ความจำชั่วคราว (`activeSessions` Map) ยังไม่มีเซสชันของช่องนั้นๆ ตัวตรวจเช็กสถานะ Self-Healing Keeper จะมองว่าไม่มีเกมรันอยู่ และสั่งรัน `sendNextGameQuestion` ส่งโจทย์ใหม่ทันที
2. บอทไม่ได้ตรวจเช็กประวัติข้อความล่าสุดในช่อง Discord ว่ามีโจทย์เดิมของบอทเปิดค้างไว้อยู่แล้วหรือไม่

**Resolution / Workaround:**  
1. ออกแบบสถาปัตยกรรม **Smart Discord Message Recovery**: ในช่วง `clientReady` หรือเมื่อ `restoreActiveSessions` รัน หากใน RAM ไม่มีเซสชัน ให้บอทสแกนประวัติ 5 ข้อความล่าสุด (`channel.messages.fetch({ limit: 5 })`)
2. หากพบข้อความการ์ดโจทย์เดิมของบอท ให้ดึง `message.id` มาผูกคืนเข้า RAM (`activeSessions.set(channelId, ...)`) ทันทีโดย **ไม่โพสต์ข้อความโจทย์ใหม่ลงไปในช่องเด็ดขาด**

```javascript
const recentMsgs = await channel.messages.fetch({ limit: 5 }).catch(() => null);
const lastBotMsg = recentMsgs?.find(m => m.author.id === client.user.id);
if (lastBotMsg) {
  activeSessions.set(channelId, {
    gameId,
    questionData: { wordOrQuestion: 'โจทย์ปัจจุบัน', answer: '', rewardPoints: 3 },
    messageId: lastBotMsg.id,
    channelId
  });
}
```

**Related Files:**  
- [`src/features/minigames/minigames.js`](file:///d:/bearcafe-bot/src/features/minigames/minigames.js)

---

### 5. Stale Game ID Checks & Event Listener Deprecation (`clientReady`)
**Date:** 2026-09-01  
**Domain:** Discord.js v14 / Refactoring Hygiene  
**Description of Issue:**  
1. มินิเกมฟังเสียงภาษาไทย (เกม 11) ไม่ยอมสร้างไฟล์เสียง `audio.mp3` และไม่ยอมตรวจคำตอบในแชท
2. บอทแสดงคำเตือน `DeprecationWarning: The ready event has been renamed to clientReady` ตอนเปิดเครื่อง

**Root Cause:**  
1. หลังจากลบมินิเกมเดิมออก การจัดลำดับเลขเกมใหม่ทำให้เกม 12 เปลี่ยนเป็นเกม 11 แต่ในโค้ดยังค้างเงื่อนไข `gameId === 12` และใน Chat Listener Ignore List ยังมีเลข 11 ติดอยู่
2. โค้ดเก่าในบริการ `contractNotifier.js` ยังใช้ `client.once("ready")` แทน `client.once("clientReady")`

**Resolution / Workaround:**  
1. เมื่อทำการเปลี่ยนเลข ID หรือลบรายการ Enums/IDs ในระบบ ต้องทำการสแกนสวิตช์และเงื่อนไขเปรียบเทียบเลขทั้งหมดทั่วทั้งไฟล์
2. เปลี่ยนอีเวนต์พร้อมทำงานบอทเป็น `clientReady` ทุกไฟล์ให้ตรงตามมาตรฐาน Discord.js v14

**Related Files:**  
- [`src/features/minigames/minigames.js`](file:///d:/bearcafe-bot/src/features/minigames/minigames.js)
- [`src/services/contractNotifier.js`](file:///d:/bearcafe-bot/src/services/contractNotifier.js)

