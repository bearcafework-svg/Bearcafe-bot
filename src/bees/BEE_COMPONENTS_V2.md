# 🧩 คู่มือโครงสร้าง Discord Components V2 (Bee System Components V2 Spec)

เอกสารนี้รวบรวมข้อกำหนดทางเทคนิค (Technical Specification), โครงสร้างต้นไม้ (Component Hierarchy Tree), และรูปแบบ JSON Payload สำหรับ **Discord Components V2** ที่ใช้งานในระบบผึ้งของบอทคาเฟ่หมี ([beePayloads.js](file:///d:/bearcafe-bot/src/bees/beePayloads.js))

---

## 📌 1. ทำความเข้าใจ Discord Components V2

Discord Components V2 เป็นสถาปัตยกรรมการส่งข้อความแบบใหม่ของ Discord API โดยเปลี่ยนจากรูปแบบ Embed เดิม มาเป็นการประกอบ **กล่องคอนเทนเนอร์ (Container)** และ **ชิ้นส่วน UI ย่อย** ทำให้สามารถแสดงภาพขนาดใหญ่, ทำ Thumbnail แนบข้างข้อความ, ใส่ปุ่มกด, และจัดลำดับบล็อกได้อย่างอิสระเสมือนหน้าเว็บการ์ด

### 🔑 Message Flag สำคัญ
เมื่อต้องการส่งข้อความแบบ Components V2 จะต้องประกาศ Header ในระดับ Message Payload ดังนี้:
```javascript
{
  flags: 32768, // MessageFlags.IsComponentsV2 (0x8000)
  components: [ /* Container & Layout */ ]
}
```
> [!IMPORTANT]
> หากไม่ระบุ `flags: 32768` Discord API จะปฏิเสธการส่งข้อความประเภท Container (Type 17) หรือแสดงผลผิดพลาด

---

## 🏗️ 2. รหัสและประเภทของ Components V2 (Component Type Registry)

| Component Type | ค่าตัวเลข (Integer) | หน้าที่ / การใช้งานในระบบผึ้ง |
| :--- | :---: | :--- |
| **ActionRow** | `1` | แถวสำหรับวางองค์ประกอบปุ่มกด (Button) |
| **Button** | `2` | ปุ่มคลิกสำหรับผู้เล่น (แย่งกด, เสี่ยงทายการ์ด, ตอบโจทย์คณิต) |
| **Section** | `9` | บล็อกจัดกลุ่มข้อความกับรูปภาพ Thumbnail ด้านข้าง |
| **Text Display** | `10` | กล่องข้อความเนื้อหาหลัก (ชื่อผึ้ง, บทพูด, คำใบ้, แต้ม) |
| **Thumbnail** | `11` | รูปภาพไอคอนขนาดเล็ก (แนบข้างขวาของ Section) |
| **Media Gallery** | `12` | แกลเลอรีภาพขนาดใหญ่ (ภาพพื้นหลังสวน, มีมการ์ด) |
| **Separator** | `14` | เส้นคั่นหรือระยะเว้นวรรค (Spacing / Divider) |
| **Container** | `17` | กล่องห่อหุ้มหลักแบบมีขอบมน (Root Container) |

---

## 🌳 3. ผังโครงสร้างแบบต้นไม้ (Component Hierarchy Tree)

โครงสร้างมาตรฐานของข้อความผึ้งในระบบบอทคาเฟ่หมี:

```text
Message (flags: 32768)
└── Container (type: 17)
    ├── Separator (type: 14, divider: false)  [เว้นระยะขอบบน]
    ├── Section (type: 9)
    │   ├── Text Display (type: 10)           [หัวเรื่อง, บทพูดผึ้ง, Tips/สถิติ]
    │   └── Accessory: Thumbnail (type: 11)   [รูปผึ้ง Spawn/Result ด้านขวา]
    ├── Separator (type: 14, divider: false, spacing: 2)
    ├── Media Gallery (type: 12)              [ภาพสวนดอกไม้ / มีมการ์ดใหญ่]
    │   └── items: [{ media: { url } }]
    ├── Separator (type: 14, divider: true, spacing: 2)   [เส้นคั่นก่อนแถวปุ่ม]
    └── ActionRow (type: 1)
        ├── Button (type: 2)                  [ปุ่มปฏิสัมพันธ์ของผู้เล่น]
        └── ...
```

---

## 🔘 4. มาตรฐานการออกแบบปุ่มกด (Button Design System)

ในระบบผึ้งมีการออกแบบปุ่มตามบุคลิกและเกมเพลย์ของผึ้งแต่ละตัวอย่างชัดเจน:

### 1. ผึ้งอ้วน และ นางพญาผึ้ง (`fat_round_bee`, `queen_bee`)
- **สถานะรอพร้อม (Waiting - 6 วินาทีแรก):**
  - `style: 2` (Secondary / สีเทา)
  - `label: "︲กำลังโหลดผึ้ง . . ."`
  - `disabled: true`
- **สถานะพร้อมแย่งกด (Ready):**
  - `style: 3` (Success / สีเขียว)
  - `label: "︲คลิกฉันสิ! คลิกฉันสิ!"`
  - `disabled: false`

### 2. ผึ้งสายลับ (`spy_bee`)
- มี 3 ปุ่มเรียงกันใน ActionRow เดียวกัน
- ใช้ `style: 1` (Primary / สีน้ำเงินเบลอเพิล) ทุกปุ่ม
- **ไม่มีข้อความ Label** แสดงผลเฉพาะ Emoji เท่านั้น
- Custom Emoji รูปแว่นดำ / สัญลักษณ์สายลับ:
  ```javascript
  {
    type: 2,
    style: 1,
    emoji: { id: "1475765355027890258", name: "62689coolsunglasses" },
    custom_id: "spy_bee_pick_0"
  }
  ```

### 3. อาจารย์บีเรขา (`math_bee`)
- มี 3 ปุ่มตัวเลือกคำตอบ สุ่มลำดับตัวเลือกและคำตอบที่ถูกต้อง
- ใช้สไตล์หลากสีแบบไม่มี Emoji:
  - ปุ่มที่ 1: `style: 1` (Primary / สีน้ำเงิน)
  - ปุ่มที่ 2: `style: 3` (Success / สีเขียว)
  - ปุ่มที่ 3: `style: 4` (Danger / สีแดง)
- แสดงเฉพาะ **ตัวเลขคำตอบเท่านั้น** เช่น `"︲42"`, `"︲15"`, `"︲99"`

---

## 📝 5. กฎการจัดรูปแบบ Typography & Markdown

Discord Components V2 รองรับการจัดรูปแบบ Markdown พิเศษที่ช่วยเพิ่มความพรีเมียม:

1. **Subtext Markdown (`-#`)**:
   - ใช้สำหรับบทพูดผึ้งและข้อความรอง เพื่อให้ตัวอักษรมีขนาดเล็กลงและสีเทากลืนกับ UI:
   ```markdown
   -# <a:3602exclamationmarkbubble:1372837492205555812>⠀**บทพูดเจ้าผึ้ง** : (หม่ำๆ) สตรอว์เบอร์รีนี่อร่อยจัง!
   ```

2. **Discord Relative Timestamp (`<t:${timestamp}:R>`)**:
   - ใช้นับถอยหลังเวลา เช่น หน้าต่าง 60 วินาทีตอนผึ้งแวมไพร์ตื่น:
   ```markdown
   -# <a:red_alarm:1372837492205555812>⠀**หมดเวลาแท็กเพื่อนใน**: <t:1741549800:R>
   ```

3. **Blockquote Tips (`>`)**:
   - ใช้แสดงคำแนะนำและแต้มที่ได้รับ/สูญเสีย:
   ```markdown
   > (<:strawberryv2:1520439075100688614>)⠀**__`ผลลัพธ์`__** : ได้รับ +45 แต้มสตรอว์เบอร์รี!
   ```

4. **Unicode Padding Character (`⠀` U+2800)**:
   - ใช้เว้นวรรคช่องว่างระหว่างไอคอน Emoji กับข้อความหนา เพื่อแก้ปัญหาข้อความชิดติดไอคอนเกินไปบน Mobile App

---

## 💻 6. โค้ดตัวอย่างการประกอบ Payload แบบสมบูรณ์ (Production Boilerplate)

```javascript
/**
 * ตัวอย่างฟังก์ชันประกอบ Payload Component v2 สำหรับผึ้ง
 */
function buildBeeComponentsV2({
  title = "𝖡𝖾𝖾 ₊ เจ้าผึ้งน้อย 𓂃",
  dialogue = "(บินวนไปมาอย่างร่าเริง)",
  tips = "แย่งกดให้ทันเพื่อรับแต้มสตรอว์เบอร์รี!",
  thumbnailUrl,
  backgroundUrl,
  buttons = []
}) {
  return {
    flags: 32768, // MessageFlags.IsComponentsV2
    components: [
      {
        type: 17, // Container
        components: [
          { type: 14, divider: false },
          {
            type: 9, // Section
            components: [
              {
                type: 10, // Text Display
                content:
                  `## <:bee20000:1256669436350562355>︲__\` ${title} \`__\n` +
                  `-# <a:3602exclamationmarkbubble:1372837492205555812>⠀**บทพูดเจ้าผึ้ง** : ${dialogue} <:cuteplant:1152834055528783872>\n` +
                  ` > (<:strawberryv2:1520439075100688614>)⠀**__\`𝗍𝗂𝗉𝗌\`__** : ${tips}`
              }
            ],
            accessory: thumbnailUrl ? {
              type: 11, // Thumbnail Icon
              media: { url: thumbnailUrl }
            } : undefined
          },
          { type: 14, divider: false, spacing: 2 },
          ...(backgroundUrl ? [
            {
              type: 12, // Media Gallery
              items: [{ media: { url: backgroundUrl } }]
            }
          ] : []),
          { type: 14, divider: true, spacing: 2 },
          {
            type: 1, // ActionRow
            components: buttons
          }
        ]
      }
    ]
  };
}
```

---

## ⚠️ 7. ข้อควรระวังและ Best Practices

1. **ไม่รองรับการซ้อน Container ใน Container:** Discord กำหนดให้ Container (Type 17) อยู่ในระดับบนสุดของ `components` array เท่านั้น
2. **ขีดจำกัดจำนวนปุ่มใน ActionRow:** ไม่เกิน 5 ปุ่มต่อ 1 ActionRow
3. **การแสดงผลบน Discord Mobile:** รูปภาพใน Thumbnail (Type 11) จะถูกจัดสเกลอัตโนมัติ แนะนำให้ใช้อัตราส่วน 1:1 ความละเอียดอย่างน้อย 256x256 px
4. **ความถูกต้องของ CDN URLs:** Discord จะไม่แสดงรูปภาพหาก URL ไม่อนุญาต Hotlink หรือเป็นลิงก์หมดอายุ (Discord Attachment URLs ปัจจุบันมี Expiration Token `ex=...&is=...&hm=...`)
