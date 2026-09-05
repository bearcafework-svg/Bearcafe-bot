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

---

### 6. Standardized Discord Emojis & Custom IDs Knowledge System
**Date:** 2026-09-02  
**Domain:** Discord UI / Design System / Component V2  
**Description:**  
การจัดเก็บองค์ความรู้ Custom Emojis และ Custom IDs ประจำโปรเจกต์ เพื่ออ้างอิงนำไปใช้ในการออกแบบ Discord Components V2 และคำสั่งบอททุกระบบ

**Rules & SOPs:**  
1. **Custom Emojis Standard (`EMOJIS.md`):**  
   - ใช้งานเอกสาร [`EMOJIS.md`](file:///d:/bearcafe-bot/EMOJIS.md) ในการค้นหา Custom Emoji, ID, Raw Format `<:name:id>` และคำแนะนำ Use-Case สำหรับจุดประสงค์ของ UI  
   - ตัวอย่าง: `<:bee20000:1256669436350562355>` ใช้สำหรับหัวข้อหลัก (`###`), `<:strawberryv2:1520439075100688614>` ใช้สำหรับไอคอนคะแนนแต้ม, `<:cuteplant:1152834055528783872>` ใช้สำหรับตกแต่งท้ายข้อความ
2. **Custom IDs Standard (`CUSTOM_IDS.md`):**  
   - ใช้งานเอกสาร [`CUSTOM_IDS.md`](file:///d:/bearcafe-bot/CUSTOM_IDS.md) และโมดูล [`src/shared/customIdsAndEmojis.js`](file:///d:/bearcafe-bot/src/shared/customIdsAndEmojis.js) สำหรับอ้างอิง Prefix และ Naming Convention ของ Custom IDs ในทุกระบบ

**Related Files:**  
- [`EMOJIS.md`](file:///d:/bearcafe-bot/EMOJIS.md)
- [`CUSTOM_IDS.md`](file:///d:/bearcafe-bot/CUSTOM_IDS.md)
- [`src/shared/customIdsAndEmojis.js`](file:///d:/bearcafe-bot/src/shared/customIdsAndEmojis.js)

---

### 7. HealJai (ฮิลใจ) Project Scope & Two-Domain Guild Isolation SOP
**Date:** 2026-09-04  
**Domain:** Architecture / Guild Isolation / Multi-Project Routing  
**Description:**  
โปรเจกต์ **"ฮิลใจ" (HealJai)** เป็นระบบบริการและเมนูบำบัดจิตใจที่รันภายใต้โปรเซสบอทหลัก (Bear Cafe Bot) แต่แยกสภาพแวดล้อมออกจากเซิร์ฟเวอร์หลัก 100%

**Rules & SOPs:**  
1. **โฟลเดอร์ประจำโปรเจกต์ (Project Directory):**  
   - เมื่อใดก็ตามที่ผู้ใช้งานพูดถึง **"ฮิลใจ"** หรือ **"HealJai"** การสร้างไฟล์, แก้ไขโค้ด, พัฒนาฟีเจอร์ หรือออกแบบคำสั่งทั้งหมด **ต้องทำที่ [`src/features/healJai`](file:///d:/bearcafe-bot/src/features/healJai) เท่านั้น**
2. **การแยกเซิร์ฟเวอร์ (Two-Domain Isolation Architecture):**  
   - **เซิร์ฟเวอร์ฮิลใจ (`HEALJAI_GUILD_ID = 1536199707922141254`):**
     - คำสั่งของ Bear Cafe ทั้งหมด ทั้งคำสั่ง Prefix (`b!cafe`, `b!box`, `b!reset-*`) และ `/slash` ทั้งหมด **ต้องไม่แสดงและไม่ทำงาน**
     - ได้รับการปกป้องโดย [`utils/guildFilter.js`](file:///d:/bearcafe-bot/utils/guildFilter.js) ในระดับ `client.emit` โดยอนุญาตเฉพาะ Event ของฮิลใจ (`heal_jai_*`, `b!reset-menu`, `b!heal`) เท่านั้น
   - **เซิร์ฟเวอร์ Bear Cafe (`GUILD_ID = 1144251788493602848`):**
     - คำสั่งและระบบของฮิลใจทั้งหมด (`b!reset-menu`, ปุ่มกด `heal_jai_*`) **ต้องไม่แสดงผลและไม่ทำงาน** ในเซิร์ฟเวอร์หลักนี้
   - **บอทอาการิ (Akari Bot):**
     - แยกออกจากฮิลใจโดยสิ้นเชิง โดยถูก Exclude ผ่าน `AKARI_EXCLUDED_GUILD_IDS`
3. **Defense-in-Depth Guild Check:**  
   - ภายใน Event Handlers ของ [`src/features/healJai/index.js`](file:///d:/bearcafe-bot/src/features/healJai/index.js) ต้องตรวจสอบ `if (guildId !== HEALJAI_GUILD_ID) return;` เสมอ

**Related Files:**  
- [`src/features/healJai/index.js`](file:///d:/bearcafe-bot/src/features/healJai/index.js)
- [`utils/guildFilter.js`](file:///d:/bearcafe-bot/utils/guildFilter.js)
- [`src/akari/filters/guildIgnoreFilter.js`](file:///d:/bearcafe-bot/src/akari/filters/guildIgnoreFilter.js)
- [`config.js`](file:///d:/bearcafe-bot/config.js)



