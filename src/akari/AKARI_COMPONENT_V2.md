# 🌸 Akari Bot — คู่มือมาตรฐานการออกแบบ Discord Component V2
> **Master Design Guide & Template Registry for Akari Bot UI (Components V2)**  
> **Target Bot:** Akari Public Multi-Tenant Bot (`index-akari.js`)  
> **ไฟล์หลัก:** `src/akari/AKARI_COMPONENT_V2.md`  
> **อัปเดตล่าสุด:** กันยายน 2026

เอกสารนี้รวบรวม **กฎการออกแบบ โครงสร้าง JSON Type IDs สไตล์ตัวอักษร Emojis และแม่แบบสำเร็จรูป (Templates)** สำหรับใช้พัฒนาคำสั่งและระบบตอบกลับทั้งหมดของ Akari Bot ให้เป็น Discord Component V2 ที่สวยงาม เรียบหรู และถูกต้องตามข้อกำหนดของ Discord 100%

---

## 1. กฎเหล็กของ Discord Component V2 (Zero-Exception Rules)

Discord จะปฏิเสธข้อความและส่ง Error `MESSAGE_CANNOT_USE_LEGACY_FIELDS_WITH_COMPONENTS_V2` ทันทีหากละเมิดกฎเหล่านี้:

1. 🚫 **ห้ามใส่ `content` ที่ Root Level เมื่อมี `flags: 32768`:**
   - ห้ามเขียน `{ content: "...", flags: 32768, components: [...] }`
   - ข้อความทั้งหมดต้องอยู่ใน **Text Component (`type: 10`)** ภายใน **Container (`type: 17`)** เท่านั้น
2. 🚫 **ห้ามปิดท้าย Container ด้วย Separator (`type: 14`):**
   - ตัวจบสุดท้ายของ Container (`type: 17`) ต้องเป็น Text หรือ ActionRow เสมอ
   - หากด้านล่างไม่มีปุ่มหรือเมนูต่อ **ต้องไม่ใส่ Separator เด็ดขาด**
3. 📏 **ความยาวปุ่มใน ActionRow (`type: 1`):**
   - ใส่ปุ่ม (`type: 2`) ได้สูงสุด **5 ปุ่มต่อ 1 แถว** หากเกินต้องแยก ActionRow ใหม่
4. 🖼️ **Section (`type: 9`) รองรับ Accessory ได้ 1 ชิ้นเท่านั้น:**
   - เลือกระหว่าง **Thumbnail (`type: 11`)** หรือ **ปุ่มลิ้งก์ Accessory (`type: 2`)** อย่างใดอย่างหนึ่ง
5. 🛡️ **การควบคุมสิทธิ์คำสั่งผู้ดูแลและนักพัฒนา (Permissions Rule):**
   - คำสั่ง **`/clear`** และ **`/akari-admin`** สงวนสิทธิ์สำหรับ **นักพัฒนาหลัก (Developer)** ของ Akari Bot เท่านั้น (`isAkariAdmin()`) ไม่อนุญาตให้บุคคลทั่วไปหรือ Server Owner ใช้งาน
   - คำสั่งแอดมินเซิร์ฟเวอร์ทั่วไป (`/setup-games`, `/setting-games`, `/set-game`, `/remove-game`) ต้องมีสิทธิ์ `ManageChannels` หรือ `Administrator`

---

## 2. พจนานุกรม Type IDs ของ Discord Component V2

```javascript
const FLAG_V2 = 32768; // หรือ MessageFlags.IsVoiceMessage (bitfield 32768)

const COMPONENT_TYPES = {
  ACTION_ROW: 1,     // แถวบรรจุคอนโทรลเลอร์ (Buttons / Menus)
  BUTTON: 2,         // ปุ่มกด (Styles: 1=Primary, 2=Secondary, 3=Success, 4=Danger, 5=Link)
  STRING_SELECT: 3,  // เมนู Dropdown ตัวเลือกข้อความ
  SECTION: 9,        // กรอบจัดกลุ่มเนื้อหาคู่กับ Accessory ด้านขวา
  TEXT_DISPLAY: 10,  // กล่องแสดงผลข้อความ Markdown
  MEDIA_THUMBNAIL: 11, // รูปภาพย่อด้านขวา (Accessory)
  MEDIA_GALLERY: 12,   // แกลเลอรีรูปภาพ
  SEPARATOR: 14,     // เส้นคั่นหรือระยะเว้นวรรค
  CONTAINER: 17,     // กล่องการ์ดหลักสไตล์ V2 (Card Outer Shell)
};
```

---

## 3. สไตล์ฟอนต์และหัวข้อเฉพาะตัวของ Akari (Typography & Emojis)

Akari Bot ใช้ฟอนต์ **Mathematical Sans-Serif Unicode ในรูปแบบ Title Case** (ขึ้นต้นด้วยตัวพิมพ์ใหญ่ ตามด้วยตัวพิมพ์เล็กเสมอ — ไม่ใช้ตัวพิมพ์ใหญ่ล้วน) ผสมกับตัวตกแต่ง `︲__\` ... ₊ ... 𓂃 \`__` และหัวข้อระดับ `##` เท่านั้น:

### 3.1 รูปแบบหัวข้อมาตรฐาน (Standard Header Patterns)
- **หัวข้อหลัก (H2 Title Case):**
  `## <:emoji:id>︲__\` 𝖲𝖾𝗍𝗍𝗂𝗇𝗀𝗌 ₊ จัดการมินิเกม 𓂃 \`__`
  `## <:emoji:id>︲__\` 𝖶𝖺𝗋𝗇𝗂𝗇𝗀 ₊ คุณไม่มีสิทธิ์ใช้คำสั่งนี้ 𓂃 \`__`
  `## <:emoji:id>︲__\` 𝖶𝖺𝗋𝗇𝗂𝗇𝗀 ₊ การเข้าถึงถูกปฏิเสธ 𓂃 \`__`
  `## <:emoji:id>︲__\` 𝖨𝗇𝗌𝗍𝖺𝗅𝗅𝖺𝗍𝗂𝗈𝗇 𝖼𝗈𝗆𝗉𝗅𝖾𝗍𝖾 ₊ ติดตั้งระบบมินิเกมเรียบร้อยแล้ว 𓂃 \`__`
  `## <:emoji:id>︲__\` 𝖦𝖺𝗆𝖾 𝖼𝗁𝖺𝗇𝗇𝖾𝗅 𝗌𝖾𝗍 ₊ ผูกห้องเกมเรียบร้อยแล้ว 𓂃 \`__`
  `## <:emoji:id>︲__\` 𝖴𝗇𝗅𝗂𝗇𝗄 𝗀𝖺𝗆𝖾 𝖼𝗁𝖺𝗇𝗇𝖾𝗅 ₊ ยกเลิกการผูกเกมเรียบร้อยแล้ว 𓂃 \`__`
  `## <:emoji:id>︲__\` 𝖲𝖾𝗍𝗍𝗂𝗇𝗀 𝗋𝖾𝗌𝖾𝗍 ₊ รีเซ็ตการตั้งค่า 𓂃 \`__`
  `## <:emoji:id>︲__\` 𝖦𝖺𝗆𝖾 𝗋𝖾𝗌𝖾𝗍 ₊ รีเซ็ตโจทย์สำเร็จ 𓂃 \`__`
  `## <:emoji:id>︲__\` 𝖢𝗅𝖾𝖺𝗋 ₊ กำลังลบช่องในหมวดหมู่ . . . 𓂃 \`__`
  `## <:emoji:id>︲__\` 𝖢𝗅𝖾𝖺𝗋 ₊ เคลียร์หมวดหมู่สำเร็จเรียบร้อย 𓂃 \`__`

- **หัวข้อใหญ่เน้นใจความ (H1):**
  `# ผูกเกม **{gameName}** เข้ากับห้อง <#{channelId}> สำเร็จ!`
  `# รีเซ็ตและส่งการ์ดโจทย์ใหม่สำหรับ **{gameName}** สำเร็จ!`

- **ข้อความอ้างอิง Quote:**
  `> 📦⠀**แผนสมาชิก:** Standard (ฟรี)`
  `> 🎮⠀**โควตาที่ใช้:** **2/3** เกม`
  `> คุณต้องมีสิทธิ์ **ผู้ดูแลระบบ (Administrator)** เพื่อใช้คำสั่งนี้นะคะ!`

- **หมายเหตุท้ายการ์ด (Footnote):**
  `-# ส่งข้อความโจทย์ข้อใหม่ลงในช่องมินิเกมเรียบร้อยแล้ว <:cuteplant:1152834055528783872>`
  `-# สามารถเริ่มเล่นและส่งคำตอบในห้องดังกล่าวได้ทันที <:cuteplant:1152834055528783872>`

---

### 3.2 ตาราง Custom Emojis ของ Akari Bot (มาจากเซิร์ฟเวอร์คลังอิโมจิ)

| ชื่ออิโมจิ | Raw Format | การนำไปใช้งาน |
|---|---|---|
| `bee20000` | `<:bee20000:1256669436350562355>` | หัวข้อหลักของระบบ, หน้าตั้งค่า (`/setting-games`), การ์ดความคืบหน้า |
| `50121checkmark` | `<:50121checkmark:1358584609087946867>` | สถานะสำเร็จ, ยืนยันสำเร็จ, ติดตั้งเสร็จสิ้น |
| `lowwarning` | `<:lowwarning:1548772721679278180>` | แจ้งเตือนข้อควรระวัง, ขาดสิทธิ์, โควตาเต็ม, แจ้งเตือนแผนฟรี |
| `68440x` | `<:68440x:1358584606911369226>` | ทำรายการล้มเหลว, เข้าถึงไม่ได้, ข้อมูลไม่ถูกต้อง |
| `goodconektion` | `<:goodconektion:1548760301762121801>` | สถานะห้องพร้อมใช้งาน (สีเขียว) |
| `conektionokay` | `<:conektionokay:1548760281675599964>` | สถานะห้องหาย / หลุดการผูกห้อง (สีเหลือง) |
| `conektionbad` | `<:conektionbad:1548760143192260689>` | สถานะห้องปิดอยู่ / ปิดการใช้งาน (สีเทา) |
| `7596clock` | `<a:7596clock:1160230591892029510>` | นาฬิกานับเวลาถอยหลัง, แสดงความคืบหน้ากำลังประมวลผล |
| `cuteplant` | `<:cuteplant:1152834055528783872>` | ต้นอ่อนวางประดับท้ายบรรทัด `-#` หมายเหตุ |
| `643900sevlev` | `<a:643900sevlev:1548947725133942824>` | หัวข้อหลักระบบร้านค้าแลกของรางวัล (`/setting-store`) |
| `minecraft1yellow` | `<:minecraft1yellow:1548948434982141993>` | หมายเลขไอเทมช่องที่ 1 ของร้านค้า |
| `minecraft2yellow` | `<:minecraft2yellow:1548948476182798416>` | หมายเลขไอเทมช่องที่ 2 ของร้านค้า |
| `minecraft3yellow` | `<:minecraft3yellow:1548948499846926346>` | หมายเลขไอเทมช่องที่ 3 ของร้านค้า |

---

## 4. แม่แบบ Component V2 สำเร็จรูป (Ready-to-Use Templates)

---

### 📋 แม่แบบที่ 1: เมนูแดชบอร์ดพร้อม Thumbnail และ Dropdowns (`/setting-games`)
> เหมาะสำหรับ: หน้าการตั้งค่า, แผงควบคุมระบบ, ข้อมูลสถานะเซิร์ฟเวอร์ที่มีเมนูให้เลือก

```javascript
const dashboardPayload = {
  flags: 32768,
  components: [
    {
      type: 17, // Container
      components: [
        {
          type: 9, // Section
          components: [
            {
              type: 10,
              content:
                "## <:bee20000:1256669436350562355>︲__` 𝖲𝖾𝗍𝗍𝗂𝗇𝗀𝗌 ₊ จัดการมินิเกม 𓂃 `__\n" +
                "> 📦⠀**แผนสมาชิก:** Standard (ฟรี)\n" +
                "> 🎮⠀**โควตาที่ใช้:** **2/5** เกม\n" +
                "## 📊︲สถานะห้อง\n" +
                "- <:goodconektion:1548760301762121801> พร้อมเล่น **2** เกม\n" +
                "- <:conektionokay:1548760281675599964> ห้องหาย **1** เกม\n" +
                "- <:conektionbad:1548760143192260689> ปิดอยู่ **10** เกม",
            },
          ],
          accessory: {
            type: 11, // Thumbnail
            media: {
              url: guild.iconURL({ size: 256 }) || "https://cdn.discordapp.com/embed/avatars/0.png",
            },
          },
        },
        { type: 14, spacing: 2 }, // Divider line
        {
          type: 1, // ActionRow 1
          components: [
            {
              type: 3,
              custom_id: "akari_setting_toggle_menu",
              placeholder: "🎮︲เลือกมินิเกมเพื่อสลับสถานะ หรือเคลียร์ห้องหาย",
              options: [/* select options */],
            },
          ],
        },
        { type: 14, spacing: 1, divider: false }, // Spacer without line
        {
          type: 1, // ActionRow 2
          components: [
            {
              type: 3,
              custom_id: "akari_setting_reset_menu",
              placeholder: "🔄︲เลือกมินิเกมเพื่อสั่ง สปอว์น/ส่งโจทย์ใหม่ ทันที",
              options: [/* select options */],
            },
          ],
        },
        { type: 14, spacing: 1, divider: false }, // Spacer without line
        {
          type: 1, // ActionRow 3
          components: [
            {
              type: 2,
              style: 2, // Secondary
              label: "︲ตั้งค่าสกุลเงินแต้ม",
              custom_id: "akari_setting_currency_btn",
              emoji: {
                id: "1548976664090779650",
                name: "strawberryv2",
              },
            },
          ],
        },
      ],
    },
  ],
};
```

---

### ⚠️ แม่แบบที่ 2: การ์ดแจ้งเตือนสิทธิ์หรือปฏิเสธการเข้าถึง (Warning Card)
> เหมาะสำหรับ: ผู้ใช้ไม่มีสิทธิ์ (No Permission), บอทไม่มีสิทธิ์สร้างห้อง, ยังไม่ได้ผูกห้อง, สิทธิ์เฉพาะ Developer

```javascript
const warningPayload = {
  flags: 32768,
  components: [
    {
      type: 17,
      components: [
        {
          type: 10,
          content:
            "## <:lowwarning:1548772721679278180>︲__` 𝖶𝖺𝗋𝗇𝗂𝗇𝗀 ₊ คุณไม่มีสิทธิ์ใช้คำสั่งนี้ 𓂃 `__\n" +
            "> คุณต้องมีสิทธิ์ **ผู้ดูแลระบบ (Administrator)** เพื่อใช้คำสั่งนี้นะคะ!",
        },
      ],
    },
  ],
};

const devOnlyPayload = {
  flags: 32768,
  components: [
    {
      type: 17,
      components: [
        {
          type: 10,
          content:
            "## <:lowwarning:1548772721679278180>︲__` 𝖶𝖺𝗋𝗇𝗂𝗇𝗀 ₊ การเข้าถึงถูกปฏิเสธ 𓂃 `__\n" +
            "> คำสั่งนี้สงวนสิทธิ์เฉพาะ **นักพัฒนาหลัก (Developer)** ของ Akari Bot เท่านั้นค่ะ!",
        },
      ],
    },
  ],
};
```

---

### 🛡️ แม่แบบที่ 3: การ์ดโควตาเต็ม / เชิญชวนอัปเกรด (Quota Guard Card)
> เหมาะสำหรับ: แผนฟรีเปิดห้องเกินโควตา, พยายามเปิดเกมที่เป็น Premium Only

```javascript
const quotaGuardPayload = {
  flags: 32768,
  components: [
    {
      type: 17,
      components: [
        {
          type: 9,
          components: [
            {
              type: 10,
              content:
                "## <:lowwarning:1548772721679278180>︲__` 𝖶𝖺𝗋𝗇𝗂𝗇𝗀 ₊ โควตามินิเกมฟรีเต็มแล้ว 𓂃 `__\n" +
                "> เซิร์ฟเวอร์ของคุณใช้โควตาแผนฟรีครบ **5/5 เกม** แล้วค่ะ\n" +
                "> หากต้องการเปิดใช้งานเพิ่ม กรุณาปิดเกมอื่น หรืออัปเกรดเป็น **Premium** ✨",
            },
          ],
          accessory: {
            type: 2, // Accessory Link Button
            style: 5,
            label: "︲ติดต่อผู้พัฒนา",
            emoji: { name: "👑" },
            url: "https://discord.gg/bearcafe",
          },
        },
      ],
    },
  ],
};
```

---

### 🎉 แม่แบบที่ 4: การ์ดรายงานผลสำเร็จ (Success & Operation Complete Card)
> เหมาะสำหรับ: `/setup-games`, `/set-game`, `/remove-game`, รีเซ็ตเกมสำเร็จ

```javascript
const successPayload = {
  flags: 32768,
  components: [
    {
      type: 17,
      components: [
        {
          type: 10,
          content:
            "## <:50121checkmark:1358584609087946867>︲__` 𝖦𝖺𝗆𝖾 𝖼𝗁𝖺𝗇𝗇𝖾𝗅 𝗌𝖾𝗍 ₊ ผูกห้องเกมเรียบร้อยแล้ว 𓂃 `__\n" +
            "# ผูกเกม **ทายชื่ออาหารญี่ปุ่น** เข้ากับห้อง <#123456789> สำเร็จ!\n" +
            "-# สามารถเริ่มเล่นและส่งคำตอบในห้องดังกล่าวได้ทันที <:cuteplant:1152834055528783872>",
        },
      ],
    },
  ],
};
```

---

### ⏳ แม่แบบที่ 5: การ์ดแสดงความคืบหน้า (Progress / Processing Card)
> เหมาะสำหรับ: `/clear` กำลังลบห้อง (Dev Only), การทำงานที่มีการหน่วงเวลาหลายขั้นตอน

```javascript
const progressPayload = {
  flags: 32768,
  components: [
    {
      type: 17,
      components: [
        {
          type: 10,
          content:
            "## <:bee20000:1256669436350562355>︲__` 𝖢𝗅𝖾𝖺𝗋 ₊ กำลังลบช่องในหมวดหมู่ . . . 𓂃 `__\n" +
            "📌 **หมวดหมู่ (Category):** **🎮 มินิเกม**\n" +
            "⏳ **ความคืบหน้า:** `5/10` ช่อง (`50%`)\n" +
            "🗑️ **กำลังลบ:** **ทายสำนวนไทย**\n\n" +
            "-# 🛡️ มีการหน่วงเวลา 1.2 วินาทีต่อช่อง เพื่อป้องกัน Discord Rate Limit ︲ <a:7596clock:1160230591892029510>",
        },
      ],
    },
  ],
};
```

---

### 🛍️ แม่แบบที่ 6: การ์ดแดชบอร์ดตั้งค่าร้านค้าแลกของรางวัล (`/setting-store`)
> เหมาะสำหรับ: แดชบอร์ดจัดการร้านค้าแลกของรางวัลมินิเกมของเซิร์ฟเวอร์ Premium มีปุ่มแก้ไข `📝` ประจำแต่ละช่อง และเมนูสลับเปิด/ปิด

```javascript
const storeSettingsPayload = {
  flags: 32768,
  components: [
    {
      type: 17,
      components: [
        {
          type: 9, // Section with Guild Server Profile Thumbnail
          components: [
            {
              type: 10,
              content:
                "## <a:643900sevlev:1548947725133942824>︲__` 𝖲𝗍𝗈𝗋𝖾 𝗌𝖾𝗍𝗍𝗂𝗇𝗀 ₊ จัดการร้านค้าแลกของรางวัล 𓂃 `__\n" +
                "> ตั้งค่าของรางวัลที่ผู้เล่นสามารถนำแต้มสะสมจากการเล่นมินิเกมมาแลกรับได้ (สูงสุด 3 รายการ)\n\n" +
                "-# **ห้องส่งประวัติการแลก (Log Channel):** <#123456789012345678>\n" +
                "-# 💡 เมื่อตั้งค่าครบแล้ว พิมพ์คำสั่ง `/open-store` ในห้องที่ต้องการเพื่อเปิดหน้าร้านได้ทันทีค่ะ\n ",
            },
          ],
          accessory: {
            type: 11,
            media: {
              url: "https://cdn.discordapp.com/icons/.../icon.png",
            },
          },
        },
        { type: 14, spacing: 2, divider: true },
        {
          type: 9, // Slot 1 Section
          components: [
            {
              type: 10,
              content:
                "### <:minecraft1yellow:1548948434982141993>︲__` ว่าง — ยังไม่ได้ตั้งค่า `__\n" +
                "> <:conektionbad:1548760143192260689>⠀**สถานะ:** ยังไม่มีข้อมูลของรางวัล\n" +
                "> 💡 *กดเลือกเมนูด้านล่างเพื่อเริ่มสร้างของรางวัลช่องนี้*",
            },
          ],
          accessory: {
            type: 2,
            style: 2,
            custom_id: "akari_store_edit_modal_1",
            emoji: { name: "📝" },
          },
        },
        { type: 14, spacing: 2, divider: true },
        {
          type: 9, // Slot 2 Section
          components: [
            {
              type: 10,
              content:
                "### <:minecraft2yellow:1548948476182798416>︲__` VIP Gold Role `__\n" +
                "> <:goodconektion:1548760301762121801>⠀**สถานะ:** เปิดใช้งาน\n" +
                "> 💰⠀**ราคา:** 250 แต้ม\n" +
                "> 🎁⠀**ของรางวัล:** ยศ <@&คนสวย> (จำกัด 1 ครั้ง/คน)\n" +
                "> 📝⠀**คำอธิบาย:** ไม่พบคำอธิบาย",
            },
          ],
          accessory: {
            type: 2,
            style: 2,
            custom_id: "akari_store_edit_modal_2",
            emoji: { name: "📝" },
          },
        },
        { type: 14, spacing: 2, divider: true },
        {
          type: 9, // Slot 3 Section
          components: [
            {
              type: 10,
              content:
                "### <:minecraft3yellow:1548948499846926346>︲__` บัตรแลกเครื่องดื่ม Bear Cafe `__\n" +
                "> <:conektionokay:1548760281675599964>⠀**สถานะ:** ปิดใช้งาน\n" +
                "> 💰⠀**ราคา:** 1,000 แต้ม\n" +
                "> 🎯⠀**ชนะขั้นต่ำ:** 5 ครั้ง\n" +
                "> 🎁⠀**ของรางวัล:** ของรางวัลจริง / สิทธิ์พิเศษ (แลกได้ไม่จำกัด)\n" +
                "> 📝⠀**คำอธิบาย:** โค้ดส่วนลดเครื่องดื่ม 50 บาท (แคปใบเสร็จส่งเปิดทิกเก็ตกับทีมงาน)",
            },
          ],
          accessory: {
            type: 2,
            style: 2,
            custom_id: "akari_store_edit_modal_3",
            emoji: { name: "📝" },
          },
        },
        { type: 14, spacing: 2, divider: true },
        {
          type: 1, // ActionRow 1: Toggle Select Menu
          components: [
            {
              type: 3,
              custom_id: "akari_store_toggle_select",
              placeholder: "⚡︲สลับสถานะเปิด / ปิด การใช้งานของรางวัล...",
              options: [
                {
                  label: "รางวัล 1: (ยังไม่ได้ตั้งค่า)",
                  value: "1",
                  description: "ยังไม่มีข้อมูลของรางวัล ไม่สามารถเปิดใช้งานได้",
                  emoji: { id: "1548760143192260689", name: "conektionbad" },
                },
                {
                  label: "รางวัล 2: VIP Gold Role (เปิดอยู่)",
                  value: "2",
                  description: "คลิกเพื่อสลับเป็น ปิดใช้งาน",
                  emoji: { id: "1548760301762121801", name: "goodconektion" },
                },
                {
                  label: "รางวัล 3: บัตรแลกเครื่องดื่ม Bear Cafe (ปิดอยู่)",
                  value: "3",
                  description: "คลิกเพื่อสลับเป็น เปิดใช้งาน",
                  emoji: { id: "1548760281675599964", name: "conektionokay" },
                },
              ],
            },
          ],
        },
        { type: 14, divider: false },
        {
          type: 1, // ActionRow 2: Action Buttons
          components: [
            {
              type: 2,
              style: 1,
              label: "︲ผูกยศ Discord",
              custom_id: "akari_store_role_select_btn",
              emoji: { name: "🎖️" },
            },
            {
              type: 2,
              style: 2,
              label: "︲เลือกห้องแจ้งเตือน Log",
              custom_id: "akari_store_channel_select_btn",
              emoji: { name: "🔔" },
            },
          ],
        },
      ],
    },
  ],
};
```

---

### 🎖️ แม่แบบที่ 7: หน้าต่างเลือกช่องที่จะผูกยศ (`Store Role - Slot Target`)
> เหมาะสำหรับ: หน้าต่าง Ephemeral เมื่อกดปุ่มผูกยศ เพื่อให้แอดมินเลือกช่องของรางวัลที่ต้องการเปลี่ยนประเภทเป็นยศ Discord

```javascript
const roleSlotTargetPayload = {
  flags: 32768,
  components: [
    {
      type: 17,
      components: [
        {
          type: 10,
          content:
            "## <a:643900sevlev:1548947725133942824>︲__` 𝖲𝗍𝗈𝗋𝖾 𝗋𝗈𝗅𝖾 ₊ เลือกช่องที่ต้องการผูกยศ 𓂃 `__\n" +
            "> กรุณาเลือกช่องของรางวัลที่ต้องการเปลี่ยนประเภทเป็น **ยศ Discord** เมื่อผู้เล่นแลกของรางวัล บอทจะมอบยศนี้ให้อัตโนมัติ:",
        },
        {
          type: 14,
          spacing: 2,
        },
        {
          type: 1,
          components: [
            {
              type: 3,
              custom_id: "akari_store_role_slot_target",
              placeholder: "📦︲เลือกช่องไอเทมที่ต้องการผูกยศ...",
              options: [
                {
                  label: "รางวัล 1: (ว่าง — ยังไม่ตั้งชื่อ)",
                  value: "1",
                  description: "⚠️ ยังไม่ได้ตั้งค่า — กรุณาตั้งค่ารางวัลก่อน",
                  emoji: {
                    id: "1548948434982141993",
                    name: "minecraft1yellow",
                  },
                },
                {
                  label: "รางวัล 2: VIP Gold Role",
                  value: "2",
                  description: "ตั้งค่ายศที่จะมอบให้เมื่อแลกช่อง 2",
                  emoji: {
                    id: "1548948476182798416",
                    name: "minecraft2yellow",
                  },
                },
                {
                  label: "รางวัล 3: (ว่าง — ยังไม่ตั้งชื่อ)",
                  value: "3",
                  description: "⚠️ ยังไม่ได้ตั้งค่า — กรุณาตั้งค่ารางวัลก่อน",
                  emoji: {
                    id: "1548948499846926346",
                    name: "minecraft3yellow",
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};
```

---

### 🎭 แม่แบบที่ 8: หน้าต่างเลือกยศ Discord สำหรับช่องที่ระบุ (`Store Role - Role Select`)
> เหมาะสำหรับ: หน้าต่าง Ephemeral ต่อจากข้อ 7 ให้แอดมินเลือก Role เพื่อผูกเข้ากับช่องรางวัลโดยตรง

```javascript
const roleSelectPayload = {
  flags: 32768,
  components: [
    {
      type: 17,
      components: [
        {
          type: 10,
          content:
            "##  <a:643900sevlev:1548947725133942824>︲__` 𝖲𝗍𝗈𝗋𝖾 𝗋𝗈𝗅𝖾 ₊ ผูกยศสำหรับรางวัล 1 𓂃 `__\n" +
            "> กรุณาเลือกบทบาท Discord ที่ผู้เล่นจะได้รับเมื่อแลกรางวัลช่องที่ 1:",
        },
        {
          type: 14,
          spacing: 2,
        },
        {
          type: 1,
          components: [
            {
              type: 6, // RoleSelectMenu
              custom_id: "akari_store_role_selected_slot_1",
              placeholder: "📦︲เลือกยศ Discord ที่ต้องการมอบให้...",
            },
          ],
        },
      ],
    },
  ],
};
```

---

### 🔔 แม่แบบที่ 9: หน้าต่างเลือกห้องบันทึกประวัติการแลก (`Store Log - Channel Select`)
> เหมาะสำหรับ: หน้าต่าง Ephemeral เมื่อกดปุ่มเลือกห้องแจ้งเตือน Log ให้แอดมินเลือก Text Channel

```javascript
const logChannelSelectPayload = {
  flags: 32768,
  components: [
    {
      type: 17,
      components: [
        {
          type: 10,
          content:
            "## 🔔︲__` 𝖲𝗍𝗈𝗋𝖾 𝗅𝗈𝗀 ₊ เลือกห้องส่งประวัติการแลก 𓂃 `__\n" +
            "> เมื่อมีผู้เล่นแลกของรางวัล บอทจะส่งแจ้งเตือนพร้อมข้อมูลผู้แลกลงในห้องนี้ค่ะ:",
        },
        {
          type: 14,
          spacing: 2,
        },
        {
          type: 1,
          components: [
            {
              type: 8, // ChannelSelectMenu
              custom_id: "akari_store_log_channel_selected",
              placeholder: "💭︲เลือกห้องแชทสำหรับส่งแจ้งเตือน...",
              channel_types: [0], // GuildText
            },
          ],
        },
      ],
    },
  ],
};
```

---

### ✅ แม่แบบที่ 10: การ์ดแจ้งแก้ไขสำเร็จแบบกะทัดรัด (`Successfully fixed Card`)
> เหมาะสำหรับ: ตอบกลับหลังบันทึก Modal หรืออัปเดตตัวเลือก Select Menu ในระบบตั้งค่าร้านค้า

```javascript
const successfullyFixedPayload = {
  flags: 32768,
  components: [
    {
      type: 17,
      components: [
        {
          type: 10,
          content:
            "## <:50121checkmark:1358584609087946867>︲__` Successfully fixed ₊ แก้ไขสำเร็จ 𓂃 `__",
        },
      ],
    },
  ],
};
```

---

## 5. เช็คลิสต์ตรวจสอบก่อนส่งมอบ Component V2 (Dev Checklist)

- [ ] มี `flags: 32768` ครบถ้วน
- [ ] ไม่มี top-level `content: "..."` อยู่ข้างนอกเด็ดขาด
- [ ] ใช้ Container `type: 17` ห่อหุ้ม component ทั้งหมด
- [ ] มี `accessory` อยู่ใน Section `type: 9` (ไม่ใช่ใส่ลอยๆ นอก Section)
- [ ] จุดสุดท้ายของ Container ไม่ใช่ Separator `type: 14`
- [ ] Separator ระหว่าง Dropdowns ใช้ `{ type: 14, spacing: 1, divider: false }` เพื่อความสบายตา
- [ ] อิโมจิที่ใช้ตรงตามตาราง Custom Emojis ของ Akari Bot
- [ ] หัวข้อภาษาอังกฤษใช้ฟอนต์สไตล์ Unicode Title Case ระดับ `##` เสมอ (`𝖲𝖾𝗍𝗍𝗂𝗇𝗀𝗌`, `𝖶𝖺𝗋𝗇𝗂𝗇𝗀`, `𝖢𝗅𝖾𝖺𝗋`, `𝖦𝖺𝗆𝖾 𝗋𝖾𝗌𝖾𝗍`)
- [ ] คำสั่ง `/clear` มีการตรวจสิทธิ์เฉพาะ Developer (`isAkariAdmin()`) เท่านั้น
