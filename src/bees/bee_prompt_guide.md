# 🐝 คู่มือแนวทางคำสั่ง Prompt สำหรับการสร้างภาพและผึ้งตัวใหม่ (Future Bee Prompting & Sprite Sheet Guide)

เอกสารนี้รวบรวมแนวทางการเขียน **Prompt ให้ AI** สร้างผึ้งประเภทใหม่ในอนาคต ทั้งด้าน Logic, โครงสร้าง Component v2 และ **ชุดคำสั่ง Master Prompt สำหรับสร้างสไปรต์ภาพ (Sprite Sheet 16-bit Pixel Art)** เพื่อนำไปใช้งานกับ Discord Bot คาเฟ่หมี

---

## 📌 1. โครงสร้างระบบเจ้าผึ้ง (System Architecture)

เมื่อต้องการเพิ่มผึ้งตัวใหม่ หรือปรับแต่งรูปแบบผึ้ง ให้เข้าใจบทบาทของไฟล์หลักดังนี้:

1. **[BEE_COMPONENTS_V2.md](file:///d:/bearcafe-bot/src/bees/BEE_COMPONENTS_V2.md)**:
   - ข้อกำหนดทางเทคนิคของ Discord Components V2 (Container, Section, Thumbnail, Media Gallery, ActionRow, Button Styles)
2. **[BEE_DESIGN_GUIDE.md](file:///d:/bearcafe-bot/src/bees/BEE_DESIGN_GUIDE.md)**:
   - คู่มือออกแบบพฤติกรรม, อัตราแพ้ชนะ, ตาราง 25+ Game States, และแบบฟอร์มผึ้งตัวใหม่
3. **[beePayloads.js](file:///d:/bearcafe-bot/src/bees/beePayloads.js)**:
   - ตัวประกอบ UI Components V2 และชุดบทพูดของผึ้งแต่ละตัว
4. **[beeManager.js](file:///d:/bearcafe-bot/src/bees/beeManager.js)**:
   - ตัวจัดการ Logic การสุ่ม/จัดลำดับผึ้ง, การดักจับ Interaction ปุ่มกด, ธุรกรรมแต้มสตรอว์เบอร์รี, และการตรวจสิทธิ์
5. **[settingBee.json](file:///d:/bearcafe-bot/src/bees/settingBee.json)**:
   - ไฟล์จัดเก็บการตั้งค่าระบบผึ้ง (Channel ID, Spawn Weight, Configs)

---

## 🎨 2. คู่มือ Master Prompt สำหรับสร้างภาพ Sprite Sheet (16-bit Pixel Art)

ใช้สำหรับสั่งงาน AI Image Generator (Midjourney v6, Niji 6, DALL-E 3, Stable Diffusion) เพื่อให้ได้ชุดภาพเกมแบบตารางกริดที่พร้อมตัดแยกใช้งาน:

### 📌 กฎเหล็กของ Sprite Sheet Asset:
1. **จัดวางเป็นตารางอย่างเป็นระเบียบ (Grid Layout):** เว้นระยะห่างเท่ากันทุกด้าน ไม่ซ้อน ไม่ติดกัน ไม่โดนตัดขอบ
2. **พื้นหลังโปร่งใส (Transparent Background):** หรือพื้นหลังสีเรียบ (Clean solid color) เพื่อให้ไดคัทง่าย
3. **คุมสไตล์เดียวกันทั้งหมด:** สัดส่วนตัวกลม (Chubby Chibi), เส้นขอบ 1-pixel Dark Chocolate, ทิศทางแสงเฉียงบนซ้าย, และชุดสีเดียวกัน
4. **เจ้าผึ้งสายลับ (Spy Bee):** เป็นลูกผสมผึ้งกับหมู (ตัวอ้วนกลมลายผึ้ง มีปีกผึ้ง หน้าตา/จมูก/หูเป็นหมูน้อยสีชมพู ใส่แว่นดำ)

---

### 📋 Master Prompt (คัดลอกไปใช้ได้ทันที)

```text
A retro 16-bit pixel art sprite sheet grid of cute chubby bee game characters for a 2D indie video game. Top-down / side-scroller RPG asset sheet.
จัดวาง Assets เป็นตารางอย่างเป็นระเบียบ เว้นระยะห่างเท่ากัน ทุกชิ้นแยกออกจากกันชัดเจน ไม่ซ้อน ไม่ติดกัน ไม่ถูกตัดขอบ ไม่มีข้อความ โลโก้ หรือลายน้ำ ใช้พื้นหลังโปร่งใส เพื่อให้ง่ายต่อการตัดแยกและนำไปพัฒนาเกมต่อ
Transparent background, isolated sprites, crisp pixel borders, no background shadows touching tile borders.

Character breakdown by their exact game states:

1. เจ้าผึ้งอ้วนตัวกลม - Chubby Worker Bee (fat_round_bee):
   - [Spawn]: Flying happily carrying a juicy fresh strawberry.
   - [Win]: Shocked expression, mouth wide open, strawberry is missing.
   - [Lose]: Angry puffy red cheeks, stinging forward with a sharp stinger.
   - [Poison]: Sinister grin with tiny skull poison aura.

2. นางพญาผึ้งอ้วนตัวกลม - Queen Bee (queen_bee):
   - [Spawn]: Floating gracefully with a tiny sparkling golden crown and royal fluffy collar.
   - [Win Normal]: Shocked expression with hands on cheeks, gasping in disbelief.
   - [Win Crown Jackpot]: Dramatic crying tears as her precious golden crown gets stolen.
   - [Lose]: Furious royal glare, swinging an angry stinging attack with crown gleaming.
   - [Bankrupt / Poison]: Empty velvet royal pouch, stern punishing royal scepter.

3. เจ้าผึ้งแวมไพร์ - Vampire Bee (vampire_bee):
   - [Spawn Sleepy]: Cozy hovering while sleeping, tiny cute bat wings, cozy closed eyes.
   - [Awaken]: Glowing crimson eyes, spread dark bat wings, mysterious purple magic aura.
   - [Drain Self]: Blushing dizzy swirling eyes after accidentally biting itself.
   - [Drain Friend]: Grinning proudly with cute goofy little vampire fangs holding strawberry juice.
   - [Drain Bot]: Confused goofy sweat drop face staring at a mechanical robot.

4. เจ้าผึ้งสายลับ - Spy Pig-Bee Hybrid (spy_bee):
   *Design: Adorable chubby round pig-bee hybrid, bee-striped round body with buzzing translucent bee wings, but with a cute pink pig face, floppy pig ears, round piggy snout, and cool black sunglasses.*
   - [Spawn]: Sneaking stealthily in mid-air wearing black sunglasses, holding a 3-star badge.
   - [Plus Point]: Chubby pig-bee lying lazily on back, happily offering fresh strawberries with tiny hooves.
   - [Minus Point]: Drooling greedily from pig snout, happily munching on stolen strawberries.
   - [Meme Card]: Striking a hilariously handsome anime bishounen pose, sparkly rose, cool smirk on pig face.
   - [All Stars Depleted]: Sweating profusely with big panic sweat drops as all stars vanish.

5. อาจารย์บีเรขา - Math Bee (math_bee):
   - [Spawn]: Floating proudly wearing oversized round teacher glasses, holding a wooden blackboard ruler.
   - [Win]: Joyfully dancing with colorful confetti, waving an A+ score examination paper.
   - [Wrong Cooldown]: Swirling dizzy question marks over head, timer hourglass ticking.

Art Style & Technical Rules:
- Authentic 16-bit SNES / Game Boy Advance pixel art aesthetic with crisp pixel clusters.
- Exact same scale and chubby spherical proportions across all characters.
- Consistent 1-pixel dark chocolate brown outline, uniform top-left light source.
- Cohesive color palette: warm honeycomb yellow, pastel cream, strawberry red, soft piggy pink, and deep royal accents.
- Perfectly spaced grid with wide empty margins between each sprite.
- Strictly transparent background, no background artifacts, no anti-aliased translucent halo.
- No text, no letters, no UI icons, no watermark, no signature. --ar 16:9 --v 6.0
```

---

## 💡 3. ตัวอย่าง Prompt สั่ง AI เพิ่มผึ้งแนวคิดใหม่ในอนาคต

### 🌟 ตัวอย่างที่ 1: ผึ้งประลองความเร็ว (ผึ้งนินจา)
```text
ฉันต้องการสร้างผึ้งตัวใหม่ชื่อ "เจ้าผึ้งนินจา" (id: ninja_bee)
1. เวลารอปลดล็อกปุ่มเร็วมากเพียง 1.5 วินาที (button_delay_ms: 1500)
2. อัตราการชนะ 60% ชนะได้ +40~70 แต้ม แพ้เสีย -30~50 แต้ม
3. ช่วยอัปเดต settingBee.json, beePayloads.js และสร้าง Payload แบบ Component v2 ให้ครบทุกสถานะ
```

### 🎁 ตัวอย่างที่ 2: ผึ้งกล่องของขวัญ (ผึ้งสุ่มการ์ด)
```text
ฉันต้องการสร้างผึ้งตัวใหม่ชื่อ "เจ้าผึ้งกล่องสุ่ม" (id: gacha_bee)
1. มี 2 ปุ่มให้เลือก "กล่องริบบิ้นแดง" หรือ "กล่องริบบิ้นทอง"
2. สุ่มรางวัลไอเทมและแต้มสตรอว์เบอร์รีตามน้ำหนักที่กำหนด
3. รองรับ Component v2 สไตล์ Discord ล่าสุด
```

---

## 📝 4. รายชื่อเอกสารอ้างอิงทั้งหมด
- [BEE_COMPONENTS_V2.md](file:///d:/bearcafe-bot/src/bees/BEE_COMPONENTS_V2.md) — คู่มือสเปก Discord Components V2
- [BEE_DESIGN_GUIDE.md](file:///d:/bearcafe-bot/src/bees/BEE_DESIGN_GUIDE.md) — คู่มือออกแบบพฤติกรรมและตารางสถานะผึ้ง
- [beeTemplate.json](file:///d:/bearcafe-bot/src/bees/beeTemplate.json) — แม่แบบ JSON สำหรับเพิ่มผึ้งลงฐานข้อมูล Supabase
