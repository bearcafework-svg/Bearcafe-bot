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

// Discord Flags
const FLAG_V2 = MessageFlags.IsComponentsV2; // 32768
const FLAG_EPHEMERAL = MessageFlags.Ephemeral; // 64
const FLAG_V2_EPH = FLAG_V2 | FLAG_EPHEMERAL; // 32832

// Component IDs จากที่ผู้ใช้กำหนด
const COLOR_SELECT_ID = "p_322736558815842375";
const TOOLS_SELECT_ID = "p_322751210127888385";
const RANDOM_BUTTON_ID = "p_322752340668977153";

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
                  url: "https://cdn.discordapp.com/attachments/1524704267015819274/1524758921233825852/-_6.png?ex=6a523b67&is=6a50e9e7&hm=484197e906e52adfc62a6f67f0a34cc107f9185435225448d39681b30ac6107c&"
                }
              }
            ]
          },
          {
            type: 14,
            spacing: 2
          },
          {
            type: 10,
            content: "## <:lgbeet:1202930121149775914>︲__` Rainey Bee ₊ ยศเปลี่ยนสีชื่อ 𓂃 `__\n> (<:cuteplant:1152834055528783872>)⠀กดตัวเลือก **\"เลือกสีที่คุณต้องการเปลี่ยน\"** เพื่อเปลี่ยนสีชื่อของคุณ\n> (<a:99322sparkles:1372427884479778908>)⠀กดตัวเลือก **\"เครื่องมือเพิ่มเติม\"** เพื่อดูเครื่องมือต่าง ๆ"
          },
          {
            type: 14,
            spacing: 2
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
                placeholder: "🐻︲เลือกสีที่คุณต้องการเปลี่ยน",
                min_values: 1,
                max_values: 1
              }
            ]
          },
          {
            type: 1,
            components: [
              {
                type: 3,
                custom_id: TOOLS_SELECT_ID,
                options: [
                  {
                    label: "ระบบสุ่มสีชื่อ",
                    value: RANDOM_COLOR_VALUE,
                    emoji: {
                      id: "1150845686628229151",
                      name: "rollingstar",
                      animated: true
                    }
                  },
                  {
                    label: "ถอดสียศออก",
                    value: REMOVE_COLOR_VALUE,
                    emoji: {
                      name: "🗑️"
                    }
                  }
                ],
                placeholder: "🐻︲เครื่องมือเพิ่มเติม",
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
                style: 3,
                type: 2,
                label: "︲คลิกเพื่อสุ่มชื่อ (ฟรี)",
                emoji: {
                  id: "1212856675053346897",
                  name: "bearcafe_star",
                  animated: false
                },
                custom_id: RANDOM_BUTTON_ID
              },
              {
                type: 2,
                style: 5,
                label: "︲สนใจซื้อยศ",
                emoji: { id: "1520507942842007694", name: "54879croissant", animated: true },
                url: "https://discord.com/channels/1144251788493602848/1524124116053917747"
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

  // 1. คำสั่งสร้างพาเนล b!reset-color (Owner เท่านั้น)
  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (message.content.trim().toLowerCase() !== "b!reset-color") return;
    if (!message.guild) return;

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
      customId !== RANDOM_BUTTON_ID
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
    let actionType = "change"; // "change", "random", "remove"
    let selectedColorValue = null;

    if (customId === COLOR_SELECT_ID) {
      selectedColorValue = interaction.values[0];
      actionType = "change";
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
      // สุ่มสีจากรายการ 20 สี
      const randomColor = cfg.colors[Math.floor(Math.random() * cfg.colors.length)];
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

module.exports = { setupColorRoles };
