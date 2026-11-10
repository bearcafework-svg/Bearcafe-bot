// src/commands/colorRoles.js
// ระบบเปลี่ยนยศสีผู้ใช้งาน (Color Role System)
// ใช้ Discord Component V2, บันทึกประวัติลง Supabase, และรองรับ Cooldown 10 วินาที

const { createClient } = require("@supabase/supabase-js");
const { MessageFlags } = require("discord.js");
const cfg = require("./settingColorRoles.json");
const sharedConfig = require("../sharedSettings.json");
cfg.role_blacklist = sharedConfig.role_blacklist;
const { safeRespond } = require("../../utils/discordSafety");
const { getCooldown, setCooldown } = require("../utils/cooldownManager");
const { cooldownContent, blacklistPayload } = require("../features/shared/tarotComponents");
const { setupRoleColorRotator, rotateRoleColor } = require("../services/roleColorRotator");

// Discord Flags
const FLAG_V2 = MessageFlags.IsComponentsV2; // 32768
const FLAG_EPHEMERAL = MessageFlags.Ephemeral; // 64
const FLAG_V2_EPH = FLAG_V2 | FLAG_EPHEMERAL; // 32832

// Component IDs จากที่ผู้ใช้กำหนด
const COLOR_SELECT_ID = "p_322736558815842375";
const TOOLS_SELECT_ID = "p_322751210127888385";
const RANDOM_BUTTON_ID = "p_322752340668977153";
const RANDOM_COLOR_BUTTON_ID = "p_367346693940711440";
const REMOVE_COLOR_BUTTON_ID = "p_367346770335764497";

// ค่าคงที่ของระบบสุ่มและถอดสี
const RANDOM_COLOR_VALUE = "uHZmEDv8tH";
const REMOVE_COLOR_VALUE = "ayRZEIVabO";

// ฟังก์ชันแกะอีโมจิเป็นออบเจกต์สำหรับ Select Menu
function parseEmojiForSelect(emojiStr) {
  if (!emojiStr) return undefined;
  if (!emojiStr.startsWith("<")) {
    return { name: emojiStr };
  }
  const match = emojiStr.match(/<a?:([^:]+):(\d+)>/);
  if (match) {
    return {
      name: match[1],
      id: match[2],
      animated: emojiStr.startsWith("<a:")
    };
  }
  return undefined;
}

// ฟังก์ชันหลักในการถอดสีเก่า และใส่สีใหม่ พร้อมเซฟลง Supabase
async function changeColorRole(member, targetColorValue, supabase) {
  const guild = member.guild;

  // 1. ค้นหายศสีทั้งหมดที่อยู่ในระบบ (c01-c20) ที่ผู้ใช้อาจมีอยู่เดิม
  const rolesToRemove = [];
  for (const c of cfg.colors) {
    if (member.roles.cache.has(c.roleId)) {
      rolesToRemove.push(c.roleId);
    }
  }

  // 2. ถอดยศสีเดิมออกทั้งหมด
  if (rolesToRemove.length > 0) {
    try {
      await member.roles.remove(rolesToRemove);
    } catch (err) {
      console.error(`[colorRoles] Failed to remove old color roles for ${member.id}:`, err.message);
    }
  }

  let targetColorObj = null;

  // 3. ใส่ยศสีใหม่ (หากระบุ)
  if (targetColorValue) {
    targetColorObj = cfg.colors.find(c => c.value === targetColorValue);
    if (targetColorObj && targetColorObj.roleId) {
      try {
        if (guild.roles.cache.has(targetColorObj.roleId)) {
          await member.roles.add(targetColorObj.roleId);
        } else {
          console.warn(`[colorRoles] Role ${targetColorObj.roleId} not found in guild`);
        }
      } catch (err) {
        console.error(`[colorRoles] Failed to add color role ${targetColorObj.roleId} to ${member.id}:`, err.message);
      }
    }
  }

  // 4. อัปเดตข้อมูลลงฐานข้อมูล Supabase
  if (supabase) {
    try {
      await supabase.from("user_color_roles").upsert(
        { discord_id: member.id, color_code: targetColorObj ? targetColorObj.code : null },
        { onConflict: "discord_id" }
      );
    } catch (dbErr) {
      console.error(`[colorRoles] Database error updating color for ${member.id}:`, dbErr.message);
    }
  }

  return targetColorObj;
}

// สร้างพาเนลหลักส่งหาผู้ใช้
function buildMainPanel() {
  return {
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 12,
            items: [
              {
                media: {
                  url: "https://media.discordapp.net/attachments/1565840974737973428/1567595341522407484/64f55885cca18dc8.jpg?ex=6af400ad&is=6af2af2d&hm=0a9218dbff05f04c3d3da85ca9e232ca365f1bc00230b4dea7df63f95f80a5ff&=&format=webp&width=1006&height=1006"
                }
              }
            ]
          },
          {
            type: 10,
            content: "## <:bee20000:1256669436350562355>︲__` 𝖱𝖺𝗂𝗇𝖾𝗒 𝖻𝖾𝖾 ₊ ยศเปลี่ยนสีชื่อ 𓂃 `__\n-# เบื่อสีชื่อเดิม ๆ แล้วหรือยัง? เปลี่ยนสีชื่อให้เป็นสไตล์ที่ชอบได้ตามใจ จะสีสด สีพาสเทล หรือโทนไหนก็เลือกได้ แถมยังสุ่มสีชื่อได้อีกด้วย! <:cuteplant:1152834055528783872>"
          },
          {
            type: 14,
            spacing: 2
          },
          {
            type: 10,
            content: "- **` ❔วิธีใช้งาน `** *!*\n  - *กดตัวเลือก **\"เลือกสีที่คุณต้องการเปลี่ยน\"** เพื่อเปลี่ยนสีชื่อของคุณ <:cuteplant:1152834055528783872>*\n  - *สุ่มสีชื่อ / สุ่มชื่อขำ ๆ / ลบสีชื่ออก กดตัวเลือก **\"เครื่องมือเพิ่มเติม\"** เพื่อดูเครื่องมือต่าง ๆ <a:99322sparkles:1372427884479778908>*"
          },
          {
            type: 14,
            spacing: 1,
            divider: false
          },
          {
            type: 1,
            components: [
              {
                type: 3,
                custom_id: COLOR_SELECT_ID,
                options: cfg.colors.map(c => ({
                  label: c.name,
                  value: c.value,
                  emoji: parseEmojiForSelect(c.emoji)
                })),
                placeholder: "🎨︲เลือกสีที่คุณต้องการเปลี่ยน",
                min_values: 1,
                max_values: 1
              }
            ]
          },
          {
            type: 14,
            divider: false
          },
          {
            type: 1,
            components: [
              {
                style: 1,
                type: 2,
                custom_id: RANDOM_COLOR_BUTTON_ID,
                label: "ระบบสุ่มสีชื่อ"
              },
              {
                type: 2,
                style: 3,
                custom_id: RANDOM_BUTTON_ID,
                label: "คลิกเพื่อสุ่มชื่อ (ฟรี)"
              },
              {
                style: 4,
                type: 2,
                custom_id: REMOVE_COLOR_BUTTON_ID,
                label: "ถอดสียศออก"
              }
            ]
          }
        ]
      }
    ]
  };
}

// ตัวจัดการเมื่อมีคนเปลี่ยนสีสำเร็จ
async function handleColorChange(interaction, targetColorValue, supabase) {
  const member = interaction.member;
  const username = member.displayName || member.user.username;

  // ดำเนินการเปลี่ยนสียศ
  const colorObj = await changeColorRole(member, targetColorValue, supabase);
  if (!colorObj) {
    return safeRespond(interaction, {
      flags: FLAG_EPHEMERAL,
      content: "❌ เกิดข้อผิดพลาดในการตั้งค่ายศสีนี้ กรุณาติดต่อแอดมินค่ะ"
    });
  }

  // สุ่มประโยคคำชม
  const randomMsg = cfg.random_messages[Math.floor(Math.random() * cfg.random_messages.length)];

  // ตอบกลับเป็น Ephemeral Component V2
  return safeRespond(interaction, {
    flags: FLAG_V2_EPH,
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content: `## ${colorObj.emoji}︲__\` ${username} ₊ ${colorObj.name} 𓂃 \`__\n${randomMsg} <:cuteplant:1152834055528783872>`
          }
        ]
      }
    ]
  });
}

function setupColorRoles(client) {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  );

  // เริ่มต้นระบบเปลี่ยนสียศแบบไล่สี (Gradient) อัตโนมัติทุก 1 ชม.
  setupRoleColorRotator(client);

  // 1. คำสั่งสร้างพาเนล b!reset-color และคำสั่งทดสอบ b!test-rotate-color (Owner เท่านั้น)
  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (!message.guild) return;

    const content = message.content.trim().toLowerCase();

    // คำสั่งทดสอบสลับสียศไล่สีทันที (Manual Test)
    if (content === "b!test-rotate-color") {
      const OWNER_ID = process.env.OWNER_ID;
      if (message.author.id !== OWNER_ID) {
        return message.reply({ content: "❌ คำสั่งนี้ใช้ได้เฉพาะ Owner เท่านั้นค่ะ", flags: 64 });
      }
      const res = await rotateRoleColor(client);
      if (res) {
        return message.reply({ content: `✅ สลับสียศ "${res.roleName}" สำเร็จ!\n🎨 สีไล่เฉดใหม่: \`${res.primaryColor}\` ➔ \`${res.secondaryColor}\`` });
      } else {
        return message.reply({ content: `❌ ไม่สามารถเปลี่ยนสียศได้ กรุณาตรวจสอบสิทธิ์ของบอท หรือดูรายละเอียดใน Console Log ค่ะ` });
      }
    }

    if (content !== "b!reset-color") return;

    const OWNER_ID = process.env.OWNER_ID;
    if (message.author.id !== OWNER_ID) {
      return message.reply({ content: "❌ คำสั่งนี้ใช้ได้เฉพาะ Owner เท่านั้นค่ะ", flags: 64 });
    }

    try {
      await message.delete().catch(() => {});
      await message.channel.send(buildMainPanel());
    } catch (err) {
      console.error("[colorRoles] reset-color panel error:", err);
      message.channel.send("❌ เกิดข้อผิดพลาดในการสร้างพาเนลเปลี่ยนยศสีค่ะ").catch(() => {});
    }
  });

  // 2. ตรวจสอบการกดปุ่มและเมนู
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isStringSelectMenu() && !interaction.isButton()) return;

    const { customId, member } = interaction;

    // ตรวจสอบว่าเป็น Interaction ของระบบเปลี่ยนสีหรือไม่
    if (
      customId !== COLOR_SELECT_ID &&
      customId !== TOOLS_SELECT_ID &&
      customId !== RANDOM_BUTTON_ID &&
      customId !== RANDOM_COLOR_BUTTON_ID &&
      customId !== REMOVE_COLOR_BUTTON_ID
    ) {
      return;
    }

    if (!interaction.guild || !member) return;

    // ── ตรวจสอบ Blacklist ───────────────────────────────────────────
    const isBlacklisted = cfg.role_blacklist.some(id => member.roles.cache.has(id));
    if (isBlacklisted) {
      const payload = blacklistPayload(member.id);
      payload.flags = FLAG_V2_EPH; // ตั้งค่าแสดงผลแบบซ่อน (ephemeral) และใช้ Component V2 (32832)
      return safeRespond(interaction, payload);
    }

    // ตรวจสอบประเภท Action
    let actionType = "change"; // "change", "random", "remove", "random_name"
    let selectedColorValue = null;

    if (customId === COLOR_SELECT_ID) {
      selectedColorValue = interaction.values[0];
      actionType = "change";
    } else if (customId === RANDOM_COLOR_BUTTON_ID) {
      actionType = "random";
    } else if (customId === REMOVE_COLOR_BUTTON_ID) {
      actionType = "remove";
    } else if (customId === TOOLS_SELECT_ID) {
      const selectedValue = interaction.values[0];
      if (selectedValue === RANDOM_COLOR_VALUE) {
        actionType = "random";
      } else if (selectedValue === REMOVE_COLOR_VALUE) {
        actionType = "remove";
      }
    } else if (customId === RANDOM_BUTTON_ID) {
      actionType = "random_name";
    }

    // ── ตรวจสอบ Whitelist (ข้ามกรณีถอดสีออก และสุ่มชื่อฟรี) ────────────
    if (actionType !== "remove" && actionType !== "random_name") {
      const isWhitelisted = cfg.role_whitelist.some(id => member.roles.cache.has(id));
      if (!isWhitelisted) {
        return safeRespond(interaction, {
          flags: FLAG_EPHEMERAL,
          content: "คุณต้องซื้อยศก่อนใช้งานน้า <#1524124116053917747>"
        });
      }
    }

    // ── ตรวจสอบสิทธิ์เฉพาะของแต่ละสียศ (เช่น c21 ต้องมี role 1383998275711012956) ────
    if (actionType === "change" && selectedColorValue) {
      const targetColor = cfg.colors.find(c => c.value === selectedColorValue);
      if (targetColor?.requiredRoleId && !member.roles.cache.has(targetColor.requiredRoleId)) {
        return safeRespond(interaction, {
          flags: FLAG_EPHEMERAL,
          content: `❌ สียศ **${targetColor.name}** สงวนสิทธิ์เฉพาะสมาชิกที่มีบทบาท <@&${targetColor.requiredRoleId}> เท่านั้นค่ะ`
        });
      }
    }

    // ── ตรวจสอบ Cooldown 10 วินาที ──────────────────────────────────
    const now = Date.now();
    const cdExpiry = await getCooldown(supabase, member.id, "colorRoles");
    if (now < cdExpiry) {
      const readyTimestamp = Math.floor(cdExpiry / 1000);
      return safeRespond(interaction, {
        flags: FLAG_EPHEMERAL,
        content: cooldownContent(member.id, readyTimestamp)
      });
    }

    // หากผ่านการตรวจสอบทั้งหมดแล้ว และเป็น Select Menu ให้รีเซ็ตสถานะหน้าต่างหลักเพื่อไม่ให้เมนูค้าง
    if (interaction.isStringSelectMenu()) {
      try {
        await interaction.update({
          components: buildMainPanel().components
        });
      } catch (err) {
        console.error("[colorRoles] Failed to reset select menu:", err.message);
      }
    }

    // ตั้งค่า Cooldown 10 วินาทีล่วงหน้า ป้องกันสแปม
    await setCooldown(supabase, member.id, "colorRoles", now + 10000);

    // ── ดำเนินงานตามประเภท Action ──────────────────────────────────
    if (actionType === "change") {
      await handleColorChange(interaction, selectedColorValue, supabase);
    } else if (actionType === "random") {
      // สุ่มสีเฉพาะรายการที่สมาชิกมีสิทธิ์ใช้งาน
      const availableColors = cfg.colors.filter(c => !c.requiredRoleId || member.roles.cache.has(c.requiredRoleId));
      if (availableColors.length === 0) {
        return safeRespond(interaction, {
          flags: FLAG_EPHEMERAL,
          content: "❌ ไม่พบสียศที่คุณสามารถใช้งานได้ค่ะ"
        });
      }
      const randomColor = availableColors[Math.floor(Math.random() * availableColors.length)];
      await handleColorChange(interaction, randomColor.value, supabase);
    } else if (actionType === "random_name") {
      // สุ่มชื่อจาก config: หมี + ชื่อกลาง + ชื่อท้าย
      const randomMiddle = cfg.random_names.middle[Math.floor(Math.random() * cfg.random_names.middle.length)];
      const randomLast = cfg.random_names.last[Math.floor(Math.random() * cfg.random_names.last.length)];
      const newNickname = `หมี${randomMiddle}${randomLast}`;

      let nameChangeSuccess = true;
      try {
        await member.setNickname(newNickname);
      } catch (err) {
        nameChangeSuccess = false;
        console.error(`[colorRoles] Failed to set nickname for ${member.id}:`, err.message);
      }

      const username = member.user.username;

      const replyContent = nameChangeSuccess
        ? `## 🐻︲__\` ${username} ₊ สุ่มชื่อสำเร็จ 𓂃 \`__\nสุ่มได้ชื่อใหม่เป็น: **${newNickname}** เรียบร้อยแล้วค่ะ <:cuteplant:1152834055528783872>`
        : `## 🐻︲__\` ${username} ₊ สุ่มชื่อสำเร็จ 𓂃 \`__\nสุ่มได้ชื่อ: **${newNickname}** แต่ระบบไม่สามารถอัปเดตชื่อในเซิร์ฟเวอร์ให้คุณได้ (อาจเนื่องจากสิทธิ์ของยศของคุณสูงกว่าบอท) <:cuteplant:1152834055528783872>`;

      await safeRespond(interaction, {
        flags: FLAG_V2_EPH,
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content: replyContent
              }
            ]
          }
        ]
      });
    } else if (actionType === "remove") {
      // ถอดยศสีออกทั้งหมด
      await changeColorRole(member, null, supabase);

      const username = member.displayName || member.user.username;
      await safeRespond(interaction, {
        flags: FLAG_V2_EPH,
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content: `## 🗑️︲__\` ${username} ₊ ถอดสียศออก 𓂃 \`__\nถอดสียศสีเรียบร้อยแล้วค่ะ <:cuteplant:1152834055528783872>`
              }
            ]
          }
        ]
      });
    }
  });

  console.log("[colorRoles] ✅ ระบบเปลี่ยนยศสีผู้ใช้งานพร้อมใช้งาน");
}

module.exports = {
  setupColorRoles,
  buildMainPanel
};
