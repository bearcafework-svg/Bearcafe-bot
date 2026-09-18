// ===================================================
// utils/permissionPresets.js — ระบบจัดการ Preset สิทธิ์และโควต้าห้องเสียง
// ===================================================

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  OverwriteType,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const { getSupabaseClient } = require("../src/services/supabaseClient");
const config = require("../config");

const SPECIAL_IMAGE_ROLE_ID = "1383998275711012956";

/**
 * คำนวณโควต้าสิทธิ์ตามประเภทห้องและบทบาทยศของผู้ใช้
 */
function getMemberRoomQuota(member, isRentHouse = false) {
  if (isRentHouse) {
    return {
      canUsePresets: true,
      maxTrusted: 15,
      maxBlocked: 10,
      maxPresets: 3,
      roleName: "บ้านเช่าส่วนตัว",
    };
  }

  const hasSpecialRole = member?.roles?.cache?.has(SPECIAL_IMAGE_ROLE_ID);
  if (hasSpecialRole) {
    return {
      canUsePresets: true,
      maxTrusted: 15,
      maxBlocked: 10,
      maxPresets: 3,
      roleName: "VIP ยศพิเศษ",
    };
  }

  return {
    canUsePresets: false,
    maxTrusted: 8,
    maxBlocked: 5,
    maxPresets: 0,
    roleName: "VIP ทั่วไป",
  };
}

/**
 * โครงสร้าง Preset เริ่มต้น 3 ชุด
 */
const DEFAULT_PRESETS = [
  { id: "preset_1", name: "Preset 1", limit: 0, locked: false, hidden: false, trustedUserIds: [], blockedUserIds: [] },
  { id: "preset_2", name: "Preset 2", limit: 0, locked: false, hidden: false, trustedUserIds: [], blockedUserIds: [] },
  { id: "preset_3", name: "Preset 3", limit: 0, locked: false, hidden: false, trustedUserIds: [], blockedUserIds: [] },
];

/**
 * ตรวจสอบและจัดระเบียบ Preset ให้อยู่ในรูปแบบที่ถูกต้องเสมอ
 */
function normalizePresets(presets = []) {
  if (!Array.isArray(presets)) presets = [];
  return [1, 2, 3].map((num) => {
    const id = `preset_${num}`;
    const found = presets.find((p) => p && p.id === id) || {};
    return {
      id,
      name: typeof found.name === "string" && found.name.trim() ? found.name.trim().slice(0, 50) : `Preset ${num}`,
      limit: Number.isInteger(found.limit) && found.limit >= 0 && found.limit <= 99 ? found.limit : 0,
      locked: Boolean(found.locked),
      hidden: Boolean(found.hidden),
      trustedUserIds: Array.isArray(found.trustedUserIds)
        ? found.trustedUserIds.filter((id) => typeof id === "string" && /^\d{17,20}$/.test(id)).slice(0, 15)
        : [],
      blockedUserIds: Array.isArray(found.blockedUserIds)
        ? found.blockedUserIds.filter((id) => typeof id === "string" && /^\d{17,20}$/.test(id)).slice(0, 10)
        : [],
    };
  });
}

/**
 * ดึงรายการ Presets ของห้อง VIP จาก Supabase (Auto-Save ห้องปัจจุบันลง Preset 1 หากยังไม่เคยตั้งค่า)
 */
async function getVipPresets(ownerId, currentSettings = null) {
  const client = getSupabaseClient();
  if (!client) return normalizePresets([]);

  const { data, error } = await client
    .from("smart_room_presets")
    .select("permission_presets")
    .eq("owner_id", ownerId)
    .eq("zone_id", "vip")
    .maybeSingle();

  const existing = data?.permission_presets;
  const hasValidPresets = Array.isArray(existing) && existing.length > 0 && existing.some((p) => p && p.id);

  if (!hasValidPresets && currentSettings) {
    // Auto-Save การตั้งค่าห้องปัจจุบันลง Preset 1 ในครั้งแรก
    const initialPresets = [
      {
        id: "preset_1",
        name: "Preset 1",
        limit: Number.isInteger(currentSettings.limit) ? currentSettings.limit : 0,
        locked: Boolean(currentSettings.locked),
        hidden: Boolean(currentSettings.hidden),
        trustedUserIds: (currentSettings.trustedUserIds || []).slice(0, 15),
        blockedUserIds: (currentSettings.blockedUserIds || []).slice(0, 10),
      },
      { id: "preset_2", name: "Preset 2", limit: 0, locked: false, hidden: false, trustedUserIds: [], blockedUserIds: [] },
      { id: "preset_3", name: "Preset 3", limit: 0, locked: false, hidden: false, trustedUserIds: [], blockedUserIds: [] },
    ];
    await saveVipPresets(ownerId, initialPresets);
    return initialPresets;
  }

  if (error || !existing) {
    return normalizePresets([]);
  }

  return normalizePresets(existing);
}

/**
 * บันทึกรายการ Presets ของห้อง VIP ลง Supabase
 */
async function saveVipPresets(ownerId, presets) {
  const client = getSupabaseClient();
  if (!client) return false;

  const normalized = normalizePresets(presets);
  const { error } = await client
    .from("smart_room_presets")
    .upsert(
      {
        owner_id: ownerId,
        zone_id: "vip",
        permission_presets: normalized,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_id,zone_id" }
    );

  if (error) {
    console.error(`[permissionPresets] Failed to save VIP presets for ${ownerId}:`, error.message);
    return false;
  }
  return true;
}

/**
 * ดึงรายการ Presets ของห้องบ้านเช่าจาก Supabase (Auto-Save ห้องปัจจุบันลง Preset 1 หากยังไม่เคยตั้งค่า)
 */
async function getRentHousePresets(channelId, currentSettings = null) {
  const client = getSupabaseClient();
  if (!client) return normalizePresets([]);

  const { data, error } = await client
    .from("rent_house_settings")
    .select("permission_presets")
    .eq("channel_id", channelId)
    .maybeSingle();

  const existing = data?.permission_presets;
  const hasValidPresets = Array.isArray(existing) && existing.length > 0 && existing.some((p) => p && p.id);

  if (!hasValidPresets && currentSettings) {
    // Auto-Save การตั้งค่าบ้านเช่าปัจจุบันลง Preset 1 ในครั้งแรก
    const trustedIds = currentSettings.trusted_user_ids || currentSettings.trustedUserIds || [];
    const blockedIds = currentSettings.blocked_user_ids || currentSettings.blockedUserIds || [];
    const initialPresets = [
      {
        id: "preset_1",
        name: "Preset 1",
        limit: Number.isInteger(currentSettings.limit) ? currentSettings.limit : 0,
        locked: Boolean(currentSettings.locked),
        hidden: Boolean(currentSettings.hidden),
        trustedUserIds: trustedIds.slice(0, 15),
        blockedUserIds: blockedIds.slice(0, 10),
      },
      { id: "preset_2", name: "Preset 2", limit: 0, locked: false, hidden: false, trustedUserIds: [], blockedUserIds: [] },
      { id: "preset_3", name: "Preset 3", limit: 0, locked: false, hidden: false, trustedUserIds: [], blockedUserIds: [] },
    ];
    await saveRentHousePresets(channelId, initialPresets);
    return initialPresets;
  }

  if (error || !existing) {
    return normalizePresets([]);
  }

  return normalizePresets(existing);
}

/**
 * บันทึกรายการ Presets ของห้องบ้านเช่าลง Supabase
 */
async function saveRentHousePresets(channelId, presets) {
  const client = getSupabaseClient();
  if (!client) return false;

  const normalized = normalizePresets(presets);
  const { error } = await client
    .from("rent_house_settings")
    .upsert(
      {
        channel_id: channelId,
        permission_presets: normalized,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "channel_id" }
    );

  if (error) {
    console.error(`[permissionPresets] Failed to save rent house presets for ${channelId}:`, error.message);
    return false;
  }
  return true;
}

/**
 * สร้าง Component V2 Response Card
 */
function createV2CardResponse(title, textContent, icon = "ℹ️") {
  return {
    flags: 32768 | 64, // Component v2 Ephemeral
    components: [
      {
        type: 17, // Container
        components: [
          {
            type: 10, // Text Section
            content: `## ${icon}︲__\` ${title} \`__\n${textContent}`,
          },
        ],
      },
    ],
  };
}

/**
 * สร้างการ์ดแจ้งเตือนเมื่อโควต้าเต็ม (Quota Exceeded Card)
 */
function createQuotaFullResponse(type, maxLimit, roleName = "VIP ทั่วไป") {
  const isTrusted = type.toLowerCase().includes("trust");
  const typeLabel = isTrusted ? "สมาชิกที่อนุญาต (Trust)" : "สมาชิกที่ถูกซ่อน/บล็อค (Block)";
  const hintUpgrade = roleName === "VIP ทั่วไป"
    ? "\n\n> 👑 *ต้องการเพิ่มเพื่อนได้สูงสุด 15 คน และปลดล็อค 3 Presets? สามารถดูรายละเอียดการรับยศพิเศษ <@&1383998275711012956> ได้ที่ห้องประกาศค่ะ*"
    : "";

  return createV2CardResponse(
    "ไม่สามารถเพิ่มสมาชิกได้ — โควต้าเต็มแล้วค่ะ",
    `คุณได้เพิ่ม${typeLabel}ครบตามจำนวนสูงสุดที่กำหนดแล้วค่ะ\n\n` +
    `📊 **โควต้าปัจจุบัน:** \`${maxLimit} / ${maxLimit} คน\` (${roleName})\n` +
    `💡 **วิธีแก้ไข:** กรุณากดปุ่ม **\`➖ ยกเลิกสิทธิ์สมาชิก\`** เพื่อถอดรายชื่อเดิมออกก่อนเพิ่มคนใหม่นะคะ${hintUpgrade}`,
    "⚠️"
  );
}


/**
 * สร้าง Component V2 Payload สำหรับหน้าสลับ Preset (Preset Switcher)
 */
function buildPresetSwitchPayload(presets, selectCustomId, activePresetId = null) {
  const options = presets.map((p, idx) => {
    const num = idx + 1;
    const trustedCount = p.trustedUserIds?.length || 0;
    const lockText = p.locked ? "🔒" : "🔓";
    const limitText = p.limit > 0 ? `${p.limit} คน` : "ไม่จำกัด";
    return {
      label: `Preset ${num}: ${p.name}`.slice(0, 100),
      description: `เพื่อน ${trustedCount} คน | ${lockText} | ${limitText}`.slice(0, 100),
      value: p.id,
      emoji: { name: num === 1 ? "1️⃣" : num === 2 ? "2️⃣" : "3️⃣" },
      default: activePresetId === p.id,
    };
  });

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(selectCustomId)
    .setPlaceholder("เลือก Preset ที่ต้องการสลับใช้งาน...")
    .addOptions(options);

  const row = new ActionRowBuilder().addComponents(selectMenu);

  const textContent = presets.map((p, idx) => {
    const num = idx + 1;
    const trustedCount = p.trustedUserIds?.length || 0;
    const blockedCount = p.blockedUserIds?.length || 0;
    const lockText = p.locked ? "🔒 ล็อคห้อง" : "🔓 ไม่ล็อค";
    const hideText = p.hidden ? "👀 ซ่อนห้อง" : "👁️ แสดงห้อง";
    const limitText = p.limit > 0 ? `จำกัด ${p.limit} คน` : "ไม่จำกัดจำนวนคน";
    return `### [Preset ${num}] ︲ __\` ${p.name} \`__\n` +
           `> 👥 สมาชิกที่อนุญาต: \`${trustedCount} คน\` • สมาชิกที่บล็อค: \`${blockedCount} คน\`\n` +
           `> ⚙️ สถานะ: \`${lockText} / ${hideText}\` • ขีดจำกัด: \`${limitText}\``;
  }).join("\n\n");

  return {
    flags: 32768 | 64, // Component V2 Ephemeral
    components: [
      {
        type: 17, // Container
        components: [
          {
            type: 10,
            content: `## 🔀︲__\` สลับ Preset สิทธิ์ห้อง \`__\n` +
                     `เลือกชุดสิทธิ์และจำนวนคนที่ต้องการสลับใช้งานจากเมนูด้านล่างได้ทันทีค่ะ\n\n${textContent}`,
          },
          { type: 14, spacing: 2 },
          row.toJSON(),
        ],
      },
    ],
  };
}

/**
 * สร้าง Component V2 Payload สำหรับหน้าจัดการ Preset (Preset Manager)
 */
function buildPresetManagePayload(presets, prefix = "vip_p") {
  const textContent = presets.map((p, idx) => {
    const num = idx + 1;
    const trustedCount = p.trustedUserIds?.length || 0;
    const lockText = p.locked ? "🔒" : "🔓";
    const limitText = p.limit > 0 ? `${p.limit} คน` : "ไม่จำกัด";
    return `**Preset ${num}:** __\`${p.name}\`__ (เพื่อน ${trustedCount} คน | ${lockText} | ${limitText})`;
  }).join("\n");

  const rows = [1, 2, 3].map((num) => {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${prefix}_rename_${num}`)
        .setLabel(`✏️ ตั้งชื่อ P${num}`)
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${prefix}_save_${num}`)
        .setLabel(`💾 เซฟห้องนี้ลง P${num}`)
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`${prefix}_reset_${num}`)
        .setLabel(`🗑️ ล้าง P${num}`)
        .setStyle(ButtonStyle.Danger)
    );
  });

  const containerComponents = [
    {
      type: 10,
      content: `## ⚙️︲__\` จัดการ Preset สิทธิ์ \`__\n` +
               `คุณสามารถเปลี่ยนชื่อ Preset, บันทึกสิทธิ์ห้องปัจจุบันลง Preset หรือล้างค่าได้ค่ะ\n\n` +
               `📋 **รายการ Preset ปัจจุบัน:**\n${textContent}`,
    },
  ];

  rows.forEach((r) => {
    containerComponents.push({ type: 14, spacing: 1, divider: false });
    containerComponents.push(r.toJSON());
  });

  return {
    flags: 32768 | 64, // Component V2 Ephemeral
    components: [
      {
        type: 17, // Container
        components: containerComponents,
      },
    ],
  };
}

function buildPresetRenameModal(customId, presetNum, currentName = "") {
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(`ตั้งชื่อ Preset ${presetNum}`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("preset_name_input")
          .setLabel("ชื่อ Preset ใหม่")
          .setStyle(TextInputStyle.Short)
          .setValue(currentName || `Preset ${presetNum}`)
          .setPlaceholder("เช่น 🎮 ตี้เล่นเกม, ☕ คุยส่วนตัว")
          .setMaxLength(50)
          .setRequired(true)
      )
    );
}

const PRESET_SWITCH_COOLDOWN_MS = 15 * 1000;
const presetSwitchCooldowns = new Map();

/**
 * ตรวจสอบสถานะ Cooldown การสลับ Preset (15 วินาที)
 */
function checkPresetSwitchCooldown(channelId) {
  const now = Date.now();
  const lastTime = presetSwitchCooldowns.get(channelId);
  if (lastTime && now - lastTime < PRESET_SWITCH_COOLDOWN_MS) {
    const remainingSeconds = Math.ceil((PRESET_SWITCH_COOLDOWN_MS - (now - lastTime)) / 1000);
    return { onCooldown: true, remainingSeconds };
  }
  return { onCooldown: false, remainingSeconds: 0 };
}

/**
 * บันทึกเวลาที่สลับ Preset ล่าสุด
 */
function setPresetSwitchCooldown(channelId) {
  presetSwitchCooldowns.set(channelId, Date.now());
}

/**
 * สร้าง Component V2 Card แจ้งเตือนคูลดาวน์ 15 วินาที
 */
function createCooldownResponse(remainingSeconds) {
  return createV2CardResponse(
    "ระบบกำลังคูลดาวน์",
    `> ⏳ กรุณารอสักครู่นะคะ คุณสามารถสลับ Preset ได้อีกครั้งในอีก **\`${remainingSeconds} วินาที\`** ค่ะ\n\n` +
    `> 🛡️ *ระบบจำกัดการเปลี่ยนสิทธิ์ 15 วินาทีต่อครั้ง เพื่อป้องกันห้องติด Rate Limit ของ Discord ค่ะ*`,
    "⏳"
  );
}

/**
 * ตรวจสอบสมาชิกในห้องเสียงที่ไม่มีสิทธิ์ตามการตั้งค่าของ Preset ใหม่
 */
function getUnauthorizedVoiceMembers(channel, targetPreset, ownerId) {
  if (!channel || !channel.members) return [];

  const unauthorized = [];
  const trustedSet = new Set(targetPreset.trustedUserIds || []);
  const blockedSet = new Set(targetPreset.blockedUserIds || []);

  for (const member of channel.members.values()) {
    if (member.id === ownerId || member.user?.bot) continue;

    // 1. ถ้าถูกบล็อคใน Preset ใหม่
    if (blockedSet.has(member.id)) {
      unauthorized.push(member);
      continue;
    }

    // 2. ถ้าห้องล็อคหรือซ่อน แล้วสมาชิกคนนั้นไม่ได้อยู่ใน Trusted
    if ((targetPreset.locked || targetPreset.hidden) && !trustedSet.has(member.id)) {
      unauthorized.push(member);
      continue;
    }
  }

  return unauthorized;
}

/**
 * สร้าง Component V2 Confirmation Dialog เมื่อมีสมาชิกที่ไม่มีสิทธิ์อยู่ในห้องเสียง
 */
function buildEvictionConfirmPayload(targetPreset, unauthorizedMembers, prefix = "vip_confirm") {
  const memberCount = unauthorizedMembers.length;
  const memberListText = unauthorizedMembers
    .slice(0, 10)
    .map((m) => `> • <@${m.id}> (\`${m.displayName || m.user?.username}\`)`)
    .join("\n");
  const moreText = memberCount > 10 ? `\n> *...และอีก ${memberCount - 10} คน*` : "";

  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${prefix}_kick_${targetPreset.id}`)
      .setLabel("🚪 เตะออกจากห้องทันที (Kick)")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`${prefix}_keep_${targetPreset.id}`)
      .setLabel("⏳ ให้อยู่ต่อจนกว่าจะออกเอง (Soft Lock)")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${prefix}_cancel`)
      .setLabel("❌ ยกเลิก")
      .setStyle(ButtonStyle.Secondary)
  );

  return {
    flags: 32768 | 64, // Component V2 Ephemeral
    components: [
      {
        type: 17, // Container
        components: [
          {
            type: 10, // Text Section
            content:
              `## ⚠️︲__\` ตรวจพบสมาชิกที่ไม่มีสิทธิ์ใน Preset ใหม่ \`__\n` +
              `ขณะนี้กำลังจะสลับไปยัง **[${targetPreset.name}]**\n` +
              `แต่ตรวจพบสมาชิกที่**ไม่มีสิทธิ์ตามการตั้งค่าใหม่**อยู่ในห้องเสียงค่ะ:\n\n` +
              `> 👤 **สมาชิกที่ได้รับผลกระทบ (${memberCount} คน):**\n` +
              `${memberListText}${moreText}\n\n` +
              `คุณต้องการจัดการกับสมาชิกกลุ่มนี้อย่างไรคะ?`,
          },
          { type: 14, spacing: 2 },
          actionRow.toJSON(),
        ],
      },
    ],
  };
}

module.exports = {
  SPECIAL_IMAGE_ROLE_ID,
  PRESET_SWITCH_COOLDOWN_MS,
  getMemberRoomQuota,
  DEFAULT_PRESETS,
  normalizePresets,
  getVipPresets,
  saveVipPresets,
  getRentHousePresets,
  saveRentHousePresets,
  createV2CardResponse,
  createQuotaFullResponse,
  checkPresetSwitchCooldown,
  setPresetSwitchCooldown,
  createCooldownResponse,
  getUnauthorizedVoiceMembers,
  buildEvictionConfirmPayload,
  buildPresetSwitchPayload,
  buildPresetManagePayload,
  buildPresetRenameModal,
};
