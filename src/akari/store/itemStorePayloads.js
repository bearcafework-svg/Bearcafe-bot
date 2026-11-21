// ===================================================
// src/akari/store/itemStorePayloads.js
// ตัวสร้างโครงสร้างข้อความและ UI Component V2 สำหรับระบบร้านค้าแลกยศบอทคุมะ (Kuma Bot)
// มาตรฐาน Component V2 (flags: 32768, Container type 17) 100%
// ===================================================

const { MessageFlags } = require("discord.js");

const FLAG_V2 = MessageFlags.IsComponentsV2 || 32768;

const DEFAULT_CURRENCY_EMOJI = "<:strawberryv2:1548976664090779650>";
const GIFT_EMOJI = "🛍️";
const WARNING_EMOJI = "<:warning_1:1562067612135981217>";
const SUCCESS_EMOJI = "🎉";
const INFO_EMOJI = "📦";

/**
 * แปลง emoji string ให้เป็น object ที่เข้ากันได้กับ Discord Select Menu
 * @param {string} emojiStr
 * @returns {object} { name, id?, animated? }
 */
function parseEmojiForDiscord(emojiStr) {
  if (!emojiStr || typeof emojiStr !== "string") {
    return { name: "🎁" };
  }
  const trimmed = emojiStr.trim();
  const customMatch = trimmed.match(/^<(a)?:([a-zA-Z0-9_]+):([0-9]+)>$/);
  if (customMatch) {
    return {
      name: customMatch[2],
      id: customMatch[3],
      animated: Boolean(customMatch[1]),
    };
  }
  return { name: trimmed || "🎁" };
}

/**
 * สร้างชุดการ์ดหน้าร้านค้าไอเทม (Market Component V2)
 * รองรับการแบ่ง Chunk หากข้อความเกิน 3,500 ตัวอักษร หรือเกิน 25 ไอเทม
 * Chunk แรกจะมี Header (ยินดีต้อนรับ) ส่วน Chunk ถัดไปจะไม่มี Header
 * @param {object} guild
 * @param {Array} items รายการไอเทมทั้งหมดที่เปิดใช้งาน
 * @param {string} currencyEmoji สัญลักษณ์สกุลเงิน
 * @returns {Array<object>} Array ของ message payloads ที่ต้องส่ง
 */
function buildMarketPayloads(guild, items = [], currencyEmoji = DEFAULT_CURRENCY_EMOJI) {
  const serverName = guild?.name || "Server";
  const totalItems = items.length;
  const strawberryEmoji = parseEmojiForDiscord(currencyEmoji) || {
    id: "1520439075100688614",
    name: "strawberryv2",
    animated: false,
  };

  if (totalItems === 0) {
    const emptyPayload = {
      flags: FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: `## <a:shoppingcart:1567249451477901465>︲__\` 𝖬𝖺𝗋𝗄𝖾𝗍 𝖨𝗍𝖾𝗆 ₊ ร้านค้าไอเทม 𓂃 \`__\n-# ยินดีต้อนร้อนเข้าสู่ร้านค้าของ **${serverName}** ที่นี่เรามีไอเทมมากมายให้คุณได้เลิอกซื้อ มากถึง **__0 ชิ้น__** <:cuteplant:1152834055528783872>`,
            },
            {
              type: 14,
              spacing: 2,
            },
            {
              type: 10,
              content: "*ขณะนี้ร้านค้ายังไม่มีไอเทมเปิดให้แลก กรุณารอทีมงานเปิดจำหน่ายนะครับ 🍃*",
            },
          ],
        },
      ],
    };
    return [emptyPayload];
  }

  // 1. แบ่งรายการไอเทมเป็น Chunks (จำกัดความยาวไม่เกิน ~3,500 ตัวอักษร หรือ 25 ไอเทมต่อ 1 เมนู)
  const MAX_CHARS_PER_CHUNK = 3500;
  const MAX_ITEMS_PER_CHUNK = 25;
  const chunks = [];
  let currentChunk = [];
  let currentLength = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const itemNumber = i + 1;
    const stockText =
      item.stock === 0
        ? "❌ **สินค้าหมดสต็อก**"
        : item.stock > 0
        ? `**${item.stock.toLocaleString()} ชิ้น**`
        : "♾️ **ไม่จำกัด**";

    const block =
      `### ไอเทม #${itemNumber}\n` +
      `**\`[🏷️]\`**  ชื่อไอเทม : **${item.name}**\n` +
      `**\`[💰]\`**  ราคาไอเทม : ${currencyEmoji} **${Number(item.points_cost).toLocaleString()}**\n` +
      `**\`[👑]\`**  ยศที่จะได้รับ : <@&${item.role_id}>\n` +
      `**\`[📦]\`**  ไอเทมคงเหลือ : ${stockText}`;

    const blockLen = block.length + 2;

    if (
      currentChunk.length > 0 &&
      (currentLength + blockLen > MAX_CHARS_PER_CHUNK || currentChunk.length >= MAX_ITEMS_PER_CHUNK)
    ) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentLength = 0;
    }

    currentChunk.push({ item, itemNumber, block });
    currentLength += blockLen;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  // 2. สร้าง Payload สำหรับแต่ละ Chunk
  const payloads = chunks.map((chunk, chunkIndex) => {
    const containerComponents = [];

    // Header เฉพาะ Chunk แรกสุดเท่านั้น!
    if (chunkIndex === 0) {
      containerComponents.push({
        type: 10,
        content: `## <a:shoppingcart:1567249451477901465>︲__\` 𝖬𝖺𝗋𝗄𝖾𝗍 𝖨𝗍𝖾𝗆 ₊ ร้านค้าไอเทม 𓂃 \`__\n-# ยินดีต้อนร้อนเข้าสู่ร้านค้าของ **${serverName}** ที่นี่เรามีไอเทมมากมายให้คุณได้เลิอกซื้อ มากถึง **__${totalItems} ชิ้น__** <:cuteplant:1152834055528783872>`,
      });
      containerComponents.push({
        type: 14,
        spacing: 2,
      });
    }

    // Items Block
    const itemsContent = chunk.map((c) => c.block).join("\n");
    containerComponents.push({
      type: 10,
      content: itemsContent,
    });

    // Divider
    containerComponents.push({
      type: 14,
      divider: false,
    });

    // Select Menu สำหรับไอเทมใน Chunk นี้
    const options = chunk.map((c) => ({
      label: `${Number(c.item.points_cost).toLocaleString()} แต้ม`,
      value: String(c.item.id),
      description: `ไอเทม #${c.itemNumber} : ${c.item.name}`.slice(0, 100),
      emoji: strawberryEmoji,
    }));

    containerComponents.push({
      type: 1,
      components: [
        {
          type: 3,
          custom_id: "item_store_select_redeem",
          placeholder: "🎁︲เลือกไอเทมที่ต้องการแลก",
          min_values: 1,
          max_values: 1,
          options: options,
        },
      ],
    });

    return {
      flags: FLAG_V2,
      components: [
        {
          type: 17,
          components: containerComponents,
        },
      ],
    };
  });

  return payloads;
}

/**
 * สร้างการ์ดยืนยันการแลกยศ (Ephemeral Component V2)
 */
function buildItemRedeemConfirmPayload(guild, member, item, currentPoints, currencyEmoji = DEFAULT_CURRENCY_EMOJI) {
  const cost = Number(item.points_cost) || 0;
  const remaining = Math.max(0, currentPoints - cost);
  const stockText =
    typeof item.stock === "number" && item.stock > 0
      ? `\n> 📦 **สต็อกคงเหลือ:** เหลืออีก **${item.stock.toLocaleString()}** ชิ้น`
      : "";

  return {
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content:
              `## ${GIFT_EMOJI}︲__\` 𝖱𝖾𝖽𝖾𝖾𝗆 ₊ ยืนยันการแลกยศ 𓂃 \`__\n` +
              `> คุณกำลังจะแลกรับ: **${item.emoji || "🎁"} ${item.name}**\n\n` +
              `👑 **บทบาทยศ:** <@&${item.role_id}>\n` +
              `💰 **ค่าใช้จ่าย:** **${cost.toLocaleString()}** ${currencyEmoji}\n` +
              `📊 **แต้มสะสมปัจจุบัน:** **${currentPoints.toLocaleString()}** ${currencyEmoji}\n` +
              `✨ **แต้มคงเหลือหลังแลก:** **${remaining.toLocaleString()}** ${currencyEmoji}` +
              stockText +
              `\n\n-# ⚠️ กรุณาตรวจสอบข้อมูลให้เรียบร้อยก่อนกดยืนยัน ระบบจะหักแต้มและมอบยศทันทีครับ`,
          },
          {
            type: 14,
            spacing: 2,
            divider: true,
          },
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 3, // Success (Green)
                label: "✅ ยืนยันการแลกยศ",
                custom_id: `item_redeem_confirm:${item.id}`,
              },
              {
                type: 2,
                style: 2, // Secondary
                label: "❌ ยกเลิก",
                custom_id: "item_redeem_cancel",
              },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * สร้างการ์ดข้อมูลไอเทมสำหรับ /item info (Component V2)
 */
function buildItemInfoPayload(item, itemNumber = 1, redemptionCount = 0, currencyEmoji = DEFAULT_CURRENCY_EMOJI) {
  const stockText =
    item.stock === -1
      ? "👥 **ไม่จำกัดคน**"
      : item.stock === 0
      ? "❌ **สินค้าหมด (0 คน)**"
      : `👥 **${item.stock.toLocaleString()} คน**`;

  const statusText = item.is_active ? "🟢 เปิดให้แลกอยู่" : "🔴 ปิดการแลกชั่วคราว";
  const toggleLabel = item.is_active ? "🔴 ปิดการแลกชั่วคราว" : "🟢 เปิดให้แลก";

  return {
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content: "## 📦︲__` 𝖨𝗍𝖾𝗆 𝗂𝗇𝖿𝗈 ₊ ข้อมูลไอเทม 𓂃 `__",
          },
          {
            type: 14,
            spacing: 2,
          },
          {
            type: 10,
            content:
              `### ข้อมูลไอเทม #${itemNumber}\n` +
              `**\`[🏷️]\`** ​ ชื่อไอเทม : **${item.name}**\n` +
              `**\`[💰]\`** ​ ราคาไอเทม : ${currencyEmoji} **${item.points_cost.toLocaleString()}**\n` +
              `**\`[👑]\`** ​ ยศที่จะได้รับ : <@&${item.role_id}>\n` +
              `**\`[👥]\`** ​ จำกัดการแลก : ${stockText}\n` +
              `**\`[📊]\`** ​ สถิติการแลก : มีคนแลกไปแล้ว **${redemptionCount.toLocaleString()}** ครั้ง\n` +
              `**\`[⚙️]\`** ​ สถานะในร้าน : ${statusText}`,
          },
          {
            type: 14,
            divider: false,
          },
          {
            type: 1,
            components: [
              {
                style: 1,
                type: 2,
                custom_id: `item_info_quick_edit:${item.id}`,
                label: "✏️ แก้ไขข้อมูล",
              },
              {
                style: 2,
                type: 2,
                custom_id: `item_info_toggle_active:${item.id}`,
                label: toggleLabel,
              },
              {
                style: 4,
                type: 2,
                custom_id: `item_info_quick_delete:${item.id}`,
                label: "🗑️ ลบไอเทม",
              },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * สร้างการ์ดยืนยันการลบไอเทมสำหรับ /item delete (Component V2)
 */
function buildItemDeleteConfirmPayload(item, itemNumber = 1, currencyEmoji = DEFAULT_CURRENCY_EMOJI) {
  const stockText =
    item.stock === -1
      ? "👥 **ไม่จำกัดคน**"
      : item.stock === 0
      ? "❌ **สินค้าหมด (0 คน)**"
      : `👥 **${item.stock.toLocaleString()} คน**`;

  return {
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content:
              "## ⚠️︲__` 𝖣𝖾𝗅𝖾𝗍𝖾 𝗂𝗍𝖾𝗆 ₊ ยืนยันการลบไอเทม 𓂃 `__\n" +
              "-# คุณแน่ใจหรือไม่ว่าต้องการลบไอเทมนี้ออกจากร้านค้าของเซิร์ฟเวอร์?",
          },
          {
            type: 14,
            spacing: 2,
          },
          {
            type: 10,
            content:
              `### รายละเอียดไอเทมที่จะลบ\n` +
              `**\`[🏷️]\`** ​ ชื่อไอเทม : **${item.name}**\n` +
              `**\`[💰]\`** ​ ราคาไอเทม : ${currencyEmoji} **${item.points_cost.toLocaleString()}**\n` +
              `**\`[👑]\`** ​ ยศที่จะได้รับ : <@&${item.role_id}>\n` +
              `**\`[👥]\`** ​ จำกัดการแลก : ${stockText}\n\n` +
              `> ⚠️ **คำเตือน:** เมื่อลบแล้ว สมาชิกจะไม่สามารถแลกไอเทมนี้ได้อีก ข้อมูลที่ลบจะไม่สามารถกู้คืนได้`,
          },
          {
            type: 14,
            divider: false,
          },
          {
            type: 1,
            components: [
              {
                style: 4, // Danger
                type: 2,
                custom_id: `item_delete_confirm:${item.id}`,
                label: "🗑️ ยืนยันการลบไอเทม",
              },
              {
                style: 2, // Secondary
                type: 2,
                custom_id: `item_delete_cancel:${item.id}`,
                label: "ยกเลิก",
              },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * สร้างการ์ดแจ้งลบไอเทมสำเร็จ (Component V2)
 */
function buildItemDeleteSuccessPayload(itemName) {
  return {
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content:
              `## <:50121checkmark:1358584609087946867>︲__\` 𝖨𝗍𝖾𝗆 𝖽𝖾𝗅𝖾𝗍𝖾𝖽 𝗌𝗎𝖼𝖼𝖾𝗌𝗌𝖿𝗎𝗅𝗅𝗒 ₊ ลบไอเทมเรียบร้อย 𓂃 \`__\n` +
              `> ลบไอเทม **${itemName}** ออกจากร้านค้าของเซิร์ฟเวอร์เรียบร้อยแล้วครับ\n\n` +
              `-# หลังจากนั้นใช้คำสั่ง /reload market เพื่อส่งข้อมูลไอเทมใหม่ขึ้นร้านค้าของเซิร์ฟเวอร์คุณ <:cuteplant:1152834055528783872>`,
          },
        ],
      },
    ],
  };
}

/**
 * สร้างการ์ด Interactive Field Dashboard สำหรับ /item edit
 */
function buildItemEditDashboardPayload(session, itemNumber = 1, currencyEmoji = DEFAULT_CURRENCY_EMOJI) {
  const stockText =
    session.stock === -1
      ? "👥 **ไม่จำกัดคน**"
      : session.stock === 0
      ? "❌ **สินค้าหมด (0 คน)**"
      : `👥 **${session.stock.toLocaleString()} คน**`;

  return {
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content:
              "## <a:kumapencil:1573216098285912094>︲__` 𝖤𝖽𝗂𝗍 𝗂𝗍𝖾𝗆 ₊ แก้ไขไอเทม 𓂃 `__\n" +
              "-# กดเลือกปุ่มด้านล่างเพื่อแก้ไขข้อมูลเฉพาะจุดที่ต้องการ แล้วกด 'บันทึกการแก้ไข'",
          },
          {
            type: 14,
            spacing: 2,
          },
          {
            type: 10,
            content:
              `### ข้อมูลไอเทม #${itemNumber}\n` +
              `**\`[✅]\`** ​ ชื่อไอเทม : **${session.name}**\n` +
              `**\`[✅]\`** ​ ราคาไอเทม : ${currencyEmoji} **${session.points.toLocaleString()}**\n` +
              `**\`[✅]\`** ​ ยศที่จะได้รับ : <@&${session.roleId}>\n` +
              `**\`[✅]\`** ​ จำกัดการแลก : ${stockText}`,
          },
          {
            type: 14,
            divider: false,
          },
          {
            type: 1,
            components: [
              {
                style: 2,
                type: 2,
                custom_id: `item_edit_field_name:${session.id}`,
                label: "✏️ ชื่อไอเทม",
              },
              {
                style: 2,
                type: 2,
                custom_id: `item_edit_field_points:${session.id}`,
                label: "💰 ราคาไอเทม",
              },
              {
                style: 2,
                type: 2,
                custom_id: `item_edit_field_role:${session.id}`,
                label: "👑 ยศที่จะได้รับ",
              },
              {
                style: 2,
                type: 2,
                custom_id: `item_edit_field_stock:${session.id}`,
                label: "👥 จำกัดการแลก",
              },
            ],
          },
          {
            type: 1,
            components: [
              {
                style: 3, // Success (Green)
                type: 2,
                custom_id: `item_edit_save:${session.id}`,
                label: "💾 บันทึกการแก้ไข",
              },
              {
                style: 2, // Secondary
                type: 2,
                custom_id: `item_edit_cancel:${session.id}`,
                label: "❌ ยกเลิก",
              },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * สร้างการ์ดแจ้งอัปเดตไอเทมสำเร็จ (Component V2)
 */
function buildItemEditSuccessPayload(session, itemNumber = 1, currencyEmoji = DEFAULT_CURRENCY_EMOJI) {
  const stockText =
    session.stock === -1
      ? "👥 **ไม่จำกัดคน**"
      : session.stock === 0
      ? "❌ **สินค้าหมด (0 คน)**"
      : `👥 **${session.stock.toLocaleString()} คน**`;

  return {
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content:
              "## <:50121checkmark:1358584609087946867>︲__` 𝖨𝗍𝖾𝗆 𝗎𝗉𝖽𝖺𝗍𝖾𝖽 𝗌𝗎𝖼𝖼𝖾𝗌𝗌𝖿𝗎𝗅𝗅𝗒 ₊ อัปเดตไอเทมเรียบร้อย 𓂃 `__\n" +
              "-# หลังจากนั้นใช้คำสั่ง /reload market เพื่อส่งข้อมูลไอเทมใหม่ขึ้นร้านค้าของเซิร์ฟเวอร์คุณ <:cuteplant:1152834055528783872> ",
          },
          {
            type: 14,
            spacing: 2,
          },
          {
            type: 10,
            content:
              `### ข้อมูลไอเทม #${itemNumber}\n` +
              `**\`[✅]\`** ​ ชื่อไอเทม : **${session.name}**\n` +
              `**\`[✅]\`** ​ ราคาไอเทม : ${currencyEmoji} **${session.points.toLocaleString()}**\n` +
              `**\`[✅]\`** ​ ยศที่จะได้รับ : <@&${session.roleId}>\n` +
              `**\`[✅]\`** ​ จำกัดการแลก : ${stockText}`,
          },
        ],
      },
    ],
  };
}

/**
 * สร้างการ์ดใบเสร็จส่งเข้า Log Channel เมื่อมีการแลกสำเร็จ
 */
function buildStoreReceiptPayload(member, item, remainingPoints, currencyEmoji = DEFAULT_CURRENCY_EMOJI) {
  return {
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content:
              `## 🧾︲__\` บันทึกการแลกของรางวัล ₊ 𝖪𝗎𝗆𝖺 𝖲𝗍𝗈𝗋𝖾 𓂃 \`__\n` +
              `> 👤 **ผู้แลกรางวัล:** <@${member.id}> (\`${member.user?.tag || member.id}\`)\n` +
              `> ${item.emoji || "🎁"} **ไอเทมที่แลก:** **${item.name}**\n` +
              `> 👑 **บทบาทยศที่ได้รับ:** <@&${item.role_id}>\n` +
              `> 💰 **แต้มที่ใช้ไป:** **${item.points_cost.toLocaleString()}** ${currencyEmoji}\n` +
              `> 📊 **แต้มคงเหลือปัจจุบัน:** **${remainingPoints.toLocaleString()}** ${currencyEmoji}\n` +
              `> ⏰ **เวลาที่ทำรายการ:** <t:${Math.floor(Date.now() / 1000)}:F>`,
          },
        ],
      },
    ],
  };
}

/**
 * สร้างการ์ดแจ้งเตือนแลกยศสำเร็จ (Ephemeral Component V2)
 */
function buildRedeemSuccessPayload(member, item, newPoints, currencyEmoji = DEFAULT_CURRENCY_EMOJI) {
  return {
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content:
              `## ${SUCCESS_EMOJI}︲__\` 𝖲𝗎𝖼𝖼𝖾𝗌𝗌 ₊ แลกรับยศสำเร็จ! 𓂃 \`__\n` +
              `> ขอแสดงความยินดีด้วยครับ! คุณได้รับบทบาทยศ **<@&${item.role_id}>** เรียบร้อยแล้ว 🎉\n\n` +
              `> 🎁 **ไอเทม:** **${item.emoji || "🎁"} ${item.name}**\n` +
              `> 💰 **แต้มที่หัก:** **${item.points_cost.toLocaleString()}** ${currencyEmoji}\n` +
              `> ✨ **แต้มสะสมคงเหลือ:** **${newPoints.toLocaleString()}** ${currencyEmoji}\n\n` +
              `-# 💡 ขอบคุณที่ร่วมสนุกกับมินิเกมของพวกเราครับ! 🧸💛`,
          },
        ],
      },
    ],
  };
}

/**
 * สร้างการ์ด Error ทั่วไป (Component V2)
 */
function buildErrorPayload(title, description) {
  return {
    flags: FLAG_V2 | (MessageFlags.Ephemeral || 64),
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content:
              `## ${WARNING_EMOJI}︲__\` ${title} 𓂃 \`__\n` +
              `> ${description}`,
          },
        ],
      },
    ],
  };
}

/**
 * สร้างการ์ด Success ทั่วไป (Component V2)
 */
function buildSuccessPayload(title, description) {
  return {
    flags: FLAG_V2 | (MessageFlags.Ephemeral || 64),
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content:
              `## ${SUCCESS_EMOJI}︲__\` ${title} 𓂃 \`__\n` +
              `> ${description}`,
          },
        ],
      },
    ],
  };
}

/**
 * สร้างการ์ด Wizard 4 ขั้นตอน สำหรับการสร้างไอเทม (/item create)
 * ตรงตามสเปก Component V2 ใน แผนการแก้ไขคำสั่งไอเทม.md
 */
function buildItemCreateWizardPayload(step, session, currencyEmoji = DEFAULT_CURRENCY_EMOJI) {
  const name = session.name || "ไม่มีชื่อ";
  const pointsStr = session.points ? `${currencyEmoji} **${session.points.toLocaleString()}**` : "";
  const roleStr = session.roleId ? `<@&${session.roleId}>` : "";
  const stockStr =
    session.stock === undefined || session.stock === null
      ? ""
      : session.stock === -1
      ? "👥 **ไม่จำกัดคน**"
      : `👥 **${session.stock} คน**`;

  let itemInfoContent = "";
  let actionRowComponents = [];

  if (step === 1) {
    itemInfoContent = `### ข้อมูลไอเทม\n**\`[✅]\`** ​ ชื่อไอเทม : **${name}**\n**\`[❌]\`** ​ ราคาไอเทม : `;
    actionRowComponents = [
      {
        style: 2,
        type: 2,
        custom_id: "p_step_noop_1",
        label: "1/4",
        disabled: true,
      },
      {
        style: 1,
        type: 2,
        custom_id: `item_wiz_price:${session.id}`,
        label: "ราคาไอเทม",
      },
    ];
  } else if (step === 2) {
    itemInfoContent = `### ข้อมูลไอเทม\n**\`[✅]\`** ​ ชื่อไอเทม : **${name}**\n**\`[✅]\`** ​ ราคาไอเทม : ${pointsStr}\n**\`[❌]\`** ​ ยศที่จะได้รับ : `;
    actionRowComponents = [
      {
        style: 2,
        type: 2,
        custom_id: "p_step_noop_2",
        label: "2/4",
        disabled: true,
      },
      {
        style: 1,
        type: 2,
        custom_id: `item_wiz_role:${session.id}`,
        label: "ยศที่จะได้รับ",
      },
    ];
  } else if (step === 3) {
    itemInfoContent = `### ข้อมูลไอเทม\n**\`[✅]\`** ​ ชื่อไอเทม : **${name}**\n**\`[✅]\`** ​ ราคาไอเทม : ${pointsStr}\n**\`[✅]\`** ​ ยศที่จะได้รับ : ${roleStr}\n**\`[❌]\`** ​ จำกัดการแลก : `;
    actionRowComponents = [
      {
        style: 2,
        type: 2,
        custom_id: "p_step_noop_3",
        label: "3/4",
        disabled: true,
      },
      {
        style: 1,
        type: 2,
        custom_id: `item_wiz_stock:${session.id}`,
        label: "จำกัดการแลก",
      },
    ];
  } else if (step === 4) {
    itemInfoContent = `### ข้อมูลไอเทม\n**\`[✅]\`** ​ ชื่อไอเทม : **${name}**\n**\`[✅]\`** ​ ราคาไอเทม : ${pointsStr}\n**\`[✅]\`** ​ ยศที่จะได้รับ : ${roleStr}\n**\`[✅]\`** ​ จำกัดการแลก : ${stockStr}`;
    actionRowComponents = [
      {
        style: 2,
        type: 2,
        custom_id: "p_step_noop_4",
        label: "4/4",
        disabled: true,
      },
      {
        style: 3, // Success / Green
        type: 2,
        custom_id: `item_wiz_confirm:${session.id}`,
        label: "ยืนยัน",
      },
    ];
  }

  return {
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content: "## <a:kumapencil:1573216098285912094>︲__` 𝖠𝖽𝖽 𝗂𝗍𝖾𝗆 ₊ เพิ่มไอเทม 𓂃 `__",
          },
          {
            type: 14,
            spacing: 2,
          },
          {
            type: 10,
            content: itemInfoContent,
          },
          {
            type: 14,
            divider: false,
          },
          {
            type: 1,
            components: actionRowComponents,
          },
        ],
      },
    ],
  };
}

/**
 * สร้างการ์ดแจ้งเพิ่มไอเทมสำเร็จ (Component V2)
 */
function buildItemCreateSuccessPayload(session, itemNumber, currencyEmoji = DEFAULT_CURRENCY_EMOJI) {
  const name = session.name || "ไม่มีชื่อ";
  const pointsStr = session.points ? `${currencyEmoji} **${session.points.toLocaleString()}**` : "";
  const roleStr = session.roleId ? `<@&${session.roleId}>` : "";
  const stockStr =
    session.stock === undefined || session.stock === null || session.stock === -1
      ? "👥 **ไม่จำกัดคน**"
      : `👥 **${session.stock} คน**`;

  return {
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content:
              "## <:50121checkmark:1358584609087946867>︲__` 𝖨𝗍𝖾𝗆 𝖺𝖽𝖽𝖾𝖽 𝗌𝗎𝖼𝖼𝖾𝗌𝗌𝖿𝗎𝗅𝗅𝗒 ₊ เพิ่มไอเทมเรียบร้อย 𓂃 `__\n" +
              "-# หลังจากนั้นใช้คำสั่ง /reload market เพื่อส่งข้อมูลไอเทมใหม่ขึ้นร้านค้าของเซิร์ฟเวอร์คุณ <:cuteplant:1152834055528783872> ",
          },
          {
            type: 14,
            spacing: 2,
          },
          {
            type: 10,
            content:
              `### ข้อมูลไอเทม #${itemNumber}\n` +
              `**\`[✅]\`** ​ ชื่อไอเทม : **${name}**\n` +
              `**\`[✅]\`** ​ ราคาไอเทม : ${pointsStr}\n` +
              `**\`[✅]\`** ​ ยศที่จะได้รับ : ${roleStr}\n` +
              `**\`[✅]\`** ​ จำกัดการแลก : ${stockStr}`,
          },
        ],
      },
    ],
  };
}

/**
 * สร้าง RoleSelectMenu แบบซ่อนเพียวๆ (Ephemeral) ไม่ต้องมีข้อความประกอบ
 */
function buildItemRoleSelectPayload(sessionId, customIdOverride = null) {
  return {
    flags: MessageFlags.Ephemeral || 64,
    components: [
      {
        type: 1,
        components: [
          {
            type: 6, // RoleSelectMenu
            custom_id: customIdOverride || `item_wiz_select_role:${sessionId}`,
            placeholder: "เลือกยศ Discord ที่สมาชิกจะได้รับเมื่อแลก...",
            min_values: 1,
            max_values: 1,
          },
        ],
      },
    ],
  };
}

module.exports = {
  buildMarketPayloads,
  buildItemStoreShowPayload: buildMarketPayloads,
  buildItemRedeemConfirmPayload,
  buildItemInfoPayload,
  buildItemDeleteConfirmPayload,
  buildItemDeleteSuccessPayload,
  buildItemEditDashboardPayload,
  buildItemEditSuccessPayload,
  buildStoreReceiptPayload,
  buildRedeemSuccessPayload,
  buildErrorPayload,
  buildSuccessPayload,
  buildItemCreateWizardPayload,
  buildItemCreateSuccessPayload,
  buildItemRoleSelectPayload,
  parseEmojiForDiscord,
};
