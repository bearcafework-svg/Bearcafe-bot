# 🐝 คู่มือแนวทางคำสั่ง Prompt สำหรับการสร้างผึ้งตัวใหม่ในอนาคต (Future Bee Prompting Guide)

เอกสารนี้รวบรวมแนวทางการเขียนหรือสั่ง **Prompt ให้ AI** สร้างผึ้งประเภทใหม่ในอนาคตที่มี Logic, การเล่นเกม หรือรูปแบบ Component v2 ที่หลากหลายและแตกต่างกัน

---

## 📌 โครงสร้างสำคัญของระบบเจ้าผึ้ง (System Architecture)

เมื่อต้องการเพิ่มผึ้งตัวใหม่ หรือปรับแต่งรูปแบบผึ้ง ให้เข้าใจการทำงานของไฟล์หลักดังนี้:

1. **[settingBee.json](file:///d:/bearcafe-bot/src/bees/settingBee.json)**:
   - ไฟล์จัดเก็บการตั้งค่าระบบผึ้ง (Channel ID, Auto Spawn, และรายชื่อผึ้งทั้งหมด) สำหรับแก้ไขข้อมูลผึ้งโดยตรงในโค้ด

2. **[beePayloads.js](file:///d:/bearcafe-bot/src/bees/beePayloads.js)**:
   - ฝังบทพูดข้อความ Component v2 และดีไซน์หน้าตาของผึ้งแต่ละประเภท
   - หากผึ้งตัวใหม่มีปุ่มแบบพิเศษ (เช่น ปุ่ม 2 ปุ่มให้เลือกเดาทาง, ปุ่มมินิเกม) ให้มาเพิ่มฟังก์ชัน Payload ในไฟล์นี้

3. **[beeManager.js](file:///d:/bearcafe-bot/src/bees/beeManager.js)**:
   - จัดการ Logic การสุ่ม/จัดลำดับผึ้ง, การดักจับ Interaction ปุ่มกด, การคำนวณแต้มในตาราง `user_points` และการตรวจ `role_blacklist`

---

## 💡 ตัวอย่าง Prompt 템플릿 สำหรับสั่ง AI สร้างผึ้งตัวใหม่

ท่านสามารถก๊อปปี้ข้อความด้านล่างนี้ไปปรับใช้เมื่อต้องการสร้างผึ้งประเภทใหม่ในอนาคต:

### 🌟 ตัวอย่างที่ 1: สร้างผึ้งที่มีปุ่มเลือกเดา 2 ทาง (ผึ้งเสี่ยงโชค)
```text
ฉันต้องการสร้างผึ้งตัวใหม่ชื่อ "เจ้าผึ้งสองทางเลือก" (id: dual_choice_bee) 
โดยมีเงื่อนไขและ Logic ดังนี้:
1. เมื่อผึ้งโผล่มา จะมีปุ่มให้ผู้เล่นเลือก 2 ปุ่ม: "ซ้าย" (custom_id: bee_left) และ "ขวา" (custom_id: bee_right)
2. เมื่อกดแล้ว จะสุ่ม 50/50 ว่าปุ่มไหนคือปุ่มปลอดภัย (ได้แต้ม +30) และปุ่มไหนคือปุ่มพิษ (เสียแต้ม -50)
3. หากผู้เล่นแต้ม <= 0 ให้โดนต่อยหนักเสีย -200 แต้ม
4. ช่วยเพิ่มการรองรับลงใน beePayloads.js, beeManager.js และเพิ่มข้อมูลลงในตาราง bee_configs บน Supabase
```

### 💣 ตัวอย่างที่ 2: สร้างผึ้งต่อยหลายคน (ผึ้งระเบิดเวลา)
```text
ฉันต้องการสร้างผึ้งตัวใหม่ชื่อ "เจ้าผึ้งระเบิดเวลา" (id: bomb_bee) 
โดยมีเงื่อนไขดังนี้:
1. ปุ่มเปิดให้กดได้หลายคนภายในเวลา 10 วินาที
2. ทุกคนที่กดจะมีสิทธิ์ได้ลุ้นแจกแต้ม +100 หรือโดนระเบิดต่อยทุกคนคนละ -50 แต้ม
3. ช่วยฝังบทพูด Component v2 ใน beePayloads.js และอัปเดตระบบจัดการเซสชันใน beeManager.js
```

### 🎁 ตัวอย่างที่ 3: สร้างผึ้งคำถามสุ่มตอบ (ผึ้งปริศนา)
```text
ฉันต้องการสร้างผึ้งตัวใหม่ชื่อ "เจ้าผึ้งปริศนา" (id: quiz_bee)
โดยมีเงื่อนไขดังนี้:
1. สุ่มคำถามง่ายๆ 1 ข้อ พร้อม Select Menu ชอยส์ตอบ A, B, C
2. หากตอบถูก ได้รับ +50 แต้ม หากตอบผิด โดนผึ้งต่อยเสีย -30 แต้ม
3. ช่วยสร้าง Payload Component v2 แบบ Select Menu ใน beePayloads.js
```

---

## 🎨 คู่มือและชุด Prompt สำหรับสร้างภาพ Sprite Sheet (16-bit Pixel Art)

สำหรับนำไปใช้กับ AI Image Generator (Midjourney v6, Niji 6, DALL-E 3, Stable Diffusion) เพื่อนำภาพไปตัดแยก (Slice) พัฒนาเกมต่อ:

### 📌 กฎเหล็กของ Asset:
1. **จัดวางเป็นตารางอย่างเป็นระเบียบ (Grid Layout):** เว้นระยะห่างเท่ากันทุกด้าน ไม่ซ้อน ไม่ติดกัน ไม่โดนตัดขอบ
2. **พื้นหลังโปร่งใส (Transparent Background):** หรือพื้นหลังสีเรียบ เพื่อให้ไดคัทและนำไปใช้ใน Game Engine ง่าย
3. **คุมสไตล์เดียวกันทั้งหมด:** ใช้สัดส่วนตัวกลม (Chubby Chibi), เส้นขอบ 1-pixel Dark Chocolate, ทิศทางแสงเฉียงบนซ้าย, และชุดสีเดียวกัน
4. **เจ้าผึ้งสายลับ (Spy Bee):** เป็นลูกผสมผึ้งกับหมู (ตัวอ้วนกลมลายผึ้ง มีปีกผึ้ง หน้าตา/จมูก/หูเป็นหมูน้อยสีชมพู ใส่แว่นดำ)

---

### 📋 Master Prompt (คัดลอกไปใช้ได้ทันที)

```text
A retro 16-bit pixel art sprite sheet grid of cute chubby bee game characters for a 2D indie video game. Top-down / side-scroller RPG asset sheet.
จัดวาง Assets เป็นตารางอย่างเป็นระเบียบ เว้นระยะห่างเท่ากัน ทุกชิ้นแยกออกจากกันชัดเจน ไม่ซ้อน ไม่ติดกัน ไม่ถูกตัดขอบ ไม่มีข้อความ โลโก้ หรือลายน้ำ ใช้พื้นหลังโปร่งใส เพื่อให้ง่ายต่อการตัดแยกและนำไปพัฒนาเกมต่อ
Transparent background, isolated sprites, crisp pixel borders, no background shadows touching tile borders.

Character breakdown by their exact game states:

1. เจ้าผึ้งอ้วนตัวกลม - Chubby Worker Bee (3 states):
   - [Spawn]: Flying happily carrying a juicy red strawberry.
   - [Win]: Shocked expression, mouth wide open, strawberry is missing.
   - [Lose]: Angry puffy red cheeks, stinging forward with a sharp stinger.

2. นางพญาผึ้งอ้วนตัวกลม - Queen Bee (4 states):
   - [Spawn]: Floating gracefully with a tiny sparkling golden crown and royal fluffy collar.
   - [Win]: Shocked expression with hands on cheeks, gasping in disbelief.
   - [Crown]: Dramatic crying tears as her precious crown gets stolen.
   - [Lose]: Furious royal glare, swinging an angry stinging attack.

3. เจ้าผึ้งแวมไพร์ - Vampire Bee (4 states):
   - [Spawn]: Sleepy hovering with tiny cute bat wings, cozy sleepy eyes.
   - [Awaken]: Glowing crimson eyes, spread bat wings, dark magic aura.
   - [Win]: Grinning proudly with cute goofy little vampire fangs.
   - [Lose]: Embarrassed chuckling face, blushing, scratching head with wing.

4. เจ้าผึ้งสายลับ - Spy Pig-Bee Hybrid (5 states):
   *Design: Adorable chubby round pig-bee hybrid, bee-striped round body with buzzing translucent bee wings, but with a cute pink pig face, floppy pig ears, round piggy snout, and cool black sunglasses.*
   - [Spawn]: Sneaking stealthily in mid-air wearing black sunglasses, holding a 3-star badge.
   - [Plus Point]: Chubby pig-bee lying lazily on back, happily offering fresh strawberries with tiny hooves.
   - [Minus Point]: Drooling greedily from pig snout, happily munching on stolen strawberries.
   - [Meme]: Striking a hilariously handsome anime bishounen pose, sparkly rose, cool smirk on pig face.
   - [All Gone]: Sweating profusely with big panic sweat drops as all stars vanish.

5. อาจารย์บีเรขา - Math Bee (2 states):
   - [Spawn]: Floating proudly wearing oversized round glasses, holding a wooden ruler and blackboard chalk.
   - [Win]: Joyfully dancing with confetti, waving an A+ score paper.

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

## 📝 รายชื่อไฟล์สำหรับ Template ผึ้งตัวใหม่
- [beeTemplate.json](file:///d:/bearcafe-bot/src/bees/beeTemplate.json) — ไฟล์แม่แบบ JSON สำหรับคัดลอกสร้างผึ้งลง Supabase DB
- [settingBee.json](file:///d:/bearcafe-bot/src/bees/settingBee.json) — ไฟล์คอนฟิกระบบผึ้งหลัก
