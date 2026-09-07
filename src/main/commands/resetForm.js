// src/main/commands/resetForm.js
// ระบบส่งแบบฟอร์มรับสมัครทีมงาน (Recruitment Form System Component V2)
// รองรับคำสั่ง b!reset-form (Owner เท่านั้น) และ role_blacklist
// ข้อมูลข้อความ ข้อตกลง คุณสมบัติ และรูปภาพทั้งหมดถูกแยกไว้ที่ ./resetFormData.json เพื่อให้แก้ไขได้ง่าย

const { MessageFlags } = require("discord.js");
const sharedConfig = require("../../sharedSettings.json");
const { safeRespond } = require("../../../utils/discordSafety");
const { blacklistPayload } = require("../features/shared/tarotComponents");

// โหลดข้อมูลแบบฟอร์ม ข้อตกลง คุณสมบัติ จากไฟล์ JSON (รองรับทั้งโฟลเดอร์ปัจจุบันและ fallback ไปยัง commands/)
let formData;
try {
  formData = require("./resetFormData.json");
} catch {
  formData = require("../../commands/resetFormData.json");
}

// Discord Flags
const FLAG_V2 = MessageFlags.IsComponentsV2; // 32768
const FLAG_EPHEMERAL = MessageFlags.Ephemeral; // 64
const FLAG_V2_EPH = FLAG_V2 | FLAG_EPHEMERAL; // 32832

// ─── Component Payloads Builder ──────────────────────────────────────────────

// Main Panel 1
function buildMainPanel1() {
  const p1 = formData.mainPanels.panel1;
  const inner = [
    {
      type: 12,
      items: [{ media: { url: p1.bannerUrl } }]
    },
    { type: 14, spacing: 2, divider: true },
    {
      type: 10,
      content: p1.introText
    },
    { type: 14, spacing: 2, divider: true }
  ];

  for (const item of p1.items) {
    inner.push(
      {
        type: 12,
        items: [{ media: { url: item.imageUrl } }]
      },
      {
        type: 9,
        components: [
          {
            type: 10,
            content: item.criteriaText
          }
        ],
        accessory: {
          style: 3,
          type: 2,
          label: item.buttonLabel || "︲สนใจตำหน่ง",
          emoji: { id: "1372837492205555812", name: "3602exclamationmarkbubble", animated: true },
          flow: { actions: [] },
          custom_id: item.customId
        }
      },
      { type: 14, spacing: 2, divider: true }
    );
  }

  return {
    flags: FLAG_V2,
    components: [{ type: 17, components: inner }]
  };
}

// Main Panel 2
function buildMainPanel2() {
  const p2 = formData.mainPanels.panel2;
  const inner = [];

  for (const item of p2.items) {
    inner.push(
      {
        type: 12,
        items: [{ media: { url: item.imageUrl } }]
      },
      {
        type: 9,
        components: [
          {
            type: 10,
            content: item.criteriaText
          }
        ],
        accessory: {
          style: 3,
          type: 2,
          label: item.buttonLabel || "︲สนใจตำหน่ง",
          emoji: { id: "1372837492205555812", name: "3602exclamationmarkbubble", animated: true },
          flow: { actions: [] },
          custom_id: item.customId
        }
      },
      { type: 14, spacing: 2, divider: true }
    );
  }

  return {
    flags: FLAG_V2,
    components: [{ type: 17, components: inner }]
  };
}

// Response สำหรับแต่ละตำแหน่ง (Barista, Service, Content, Graphic, Cozy)
function buildRolePayload(roleConfig) {
  return {
    flags: FLAG_V2_EPH,
    components: [
      {
        type: 17,
        components: [
          {
            type: 12,
            items: [{ media: { url: roleConfig.bannerUrl } }]
          },
          {
            type: 9,
            components: [
              {
                type: 10,
                content: "## <:bear_star1:1152782839671169184>︲**__`รบกวนอ่านข้อตกลงก่อนสมัคร`__**"
              }
            ],
            accessory: {
              style: 1,
              type: 2,
              label: "︲อ่านข้อตกลง",
              emoji: { id: "1533982607170080819", name: "445181discordorbsbook", animated: false },
              custom_id: roleConfig.customIdTerms,
              flow: { actions: [] }
            }
          },
          { type: 14, spacing: 2 },
          {
            type: 9,
            components: [
              {
                type: 10,
                content: roleConfig.roleText
              }
            ],
            accessory: {
              style: 3,
              type: 2,
              label: "︲สมัครตำแหน่งนี้",
              emoji: { id: "1396016002818506754", name: "bearg23", animated: true },
              custom_id: roleConfig.customIdApply,
              flow: { actions: [] }
            }
          },
          { type: 14, spacing: 2 }
        ]
      }
    ]
  };
}

// Response สำหรับ "อ่านข้อตกลง"
function buildTermsPayload() {
  const t = formData.terms;
  return {
    flags: FLAG_V2_EPH,
    components: [
      {
        type: 17,
        components: [
          {
            type: 12,
            items: [{ media: { url: t.bannerUrl } }]
          },
          { type: 14, spacing: 2 },
          { type: 10, content: t.agreements },
          { type: 14, spacing: 2 },
          { type: 10, content: t.qualifications },
          { type: 14, spacing: 2 },
          { type: 10, content: t.probation },
          { type: 14, spacing: 2 },
          { type: 10, content: t.benefits },
          { type: 14, spacing: 2 }
        ]
      }
    ]
  };
}

// Response สำหรับ "สมัครตำแหน่งนี้"
function buildFormPayload() {
  const f = formData.form;
  return {
    flags: FLAG_V2_EPH,
    components: [
      {
        type: 17,
        components: [
          { type: 10, content: f.instructions },
          { type: 14, spacing: 2 },
          { type: 10, content: f.template }
        ]
      }
    ]
  };
}

// ฟังก์ชันค้นหา Response ตาม Custom ID ที่ผู้ใช้กด
function getResponseByCustomId(customId) {
  const termsPayload = buildTermsPayload();
  const formPayload = buildFormPayload();

  // ตรวจสอบกับตำแหน่งทั้งหมดใน config
  for (const key of Object.keys(formData.roles)) {
    const role = formData.roles[key];
    if (customId === role.customIdInterest) {
      return buildRolePayload(role);
    }
    if (customId === role.customIdTerms) {
      return termsPayload;
    }
    if (customId === role.customIdApply) {
      return formPayload;
    }
  }

  // ตรวจสอบกับปุ่มของ Main Panels
  for (const panel of [formData.mainPanels.panel1, formData.mainPanels.panel2]) {
    for (const item of panel.items) {
      if (customId === item.customId && item.roleKey && formData.roles[item.roleKey]) {
        return buildRolePayload(formData.roles[item.roleKey]);
      }
    }
  }

  return null;
}

// ─── Setup Feature Function ──────────────────────────────────────────────────

function setupResetForm(client) {
  // 1. คำสั่งสร้างพาเนล b!reset-form (Owner เท่านั้น)
  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (message.content.trim().toLowerCase() !== "b!reset-form") return;
    if (!message.guild) return;

    const OWNER_ID = process.env.OWNER_ID;
    const isOwner = (message.author.id === OWNER_ID || message.author.id === message.guild.ownerId);

    if (!isOwner) {
      return message.reply({ content: "❌ คำสั่งนี้ใช้ได้เฉพาะ Owner เท่านั้นค่ะ", flags: FLAG_EPHEMERAL });
    }

    try {
      await message.delete().catch(() => { });
      await message.channel.send(buildMainPanel1());
      await message.channel.send(buildMainPanel2());
    } catch (err) {
      console.error("[resetForm] reset-form panel error:", err);
      message.channel.send("❌ เกิดข้อผิดพลาดในการสร้างแบบฟอร์มรับสมัครทีมงานค่ะ").catch(() => { });
    }
  });

  // 2. ตรวจสอบการกดปุ่ม Interaction
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;

    const { customId, member } = interaction;

    // ตรวจสอบว่า customId ตรงกับปุ่มในระบบ recruitment form หรือไม่
    const responsePayload = getResponseByCustomId(customId);
    if (!responsePayload) return;

    if (!interaction.guild || !member) return;

    // ── ตรวจสอบ Blacklist ───────────────────────────────────────────
    const isBlacklisted = sharedConfig.role_blacklist?.some(id => member.roles.cache.has(id));
    if (isBlacklisted) {
      const payload = blacklistPayload(member.id);
      payload.flags = FLAG_V2_EPH; // Ephemeral V2
      return safeRespond(interaction, payload);
    }

    // ตอบกลับ Component V2 แบบ Ephemeral V2
    return safeRespond(interaction, responsePayload);
  });
}

module.exports = {
  setupResetForm,
  buildMainPanel1,
  buildMainPanel2,
  buildTermsPayload,
  buildFormPayload,
  buildRolePayload,
  getResponseByCustomId
};
