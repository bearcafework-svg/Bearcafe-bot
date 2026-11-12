// ===================================================
// src/akari/commands/minigamesCommands.js
// ระบบคำสั่งผู้ดูแลระบบสำหรับ Akari Bot (/setup-games, /setting-games, /clear)
// รองรับการตอบกลับด้วย Discord Component V2 (Type 17 Container) ตกแต่งสไตล์ตรงตาม EMOJIS.md
// ===================================================

const {
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require("discord.js");
const {
  spawnQuestion,
  invalidateSettingsCache,
  clearActiveTenantSession,
  getActiveTenantSession,
  getTenantPlan,
  invalidateTenantPlanCache,
  validateGameAccess,
  LIGHTWEIGHT_GAMES,
  HEAVYWEIGHT_GAMES,
  FREE_QUOTA_LIMIT,
} = require("../minigames/minigamesEngine");
const { isExcludedGuild } = require("../filters/guildIgnoreFilter");
const {
  getTenantStoreConfig,
  saveTenantStoreConfig,
} = require("../store/storeEngine");
const { safeDeferReply } = require("../../../utils/discordSafety");
const {
  STORE_SLASH_COMMANDS,
  handleSettingStore,
  handleOpenStore,
  handleStoreButtonInteraction,
  handleStoreModalSubmit,
  handleStoreSelectMenus,
} = require("./storeCommands");
const {
  POINTS_SLASH_COMMANDS,
  handlePointsCommand,
  handleLeaderboardCommand,
  handlePointsButtonInteraction,
} = require("./pointsCommands");
const {
  HELP_SLASH_COMMANDS,
  handleHelpCommand,
} = require("./helpCommands");
const {
  PREVIEW_SLASH_COMMANDS,
  handlePreviewCommand,
  handlePreviewButtonInteraction,
} = require("./previewCommands");
const { SETTING_VOICE_SLASH_COMMAND } = require("./voiceCommands");
const {
  WELCOME_ALLOWED_GUILD_ID,
  SET_SLASH_COMMAND,
} = require("../services/memberWelcomeService");

const FLAG_V2 = MessageFlags.IsComponentsV2 || 32768;

// ── Cache และ Helper สำหรับการตั้งค่าคูลดาวน์และเทมเพลตเมื่อตอบผิด ──
const tenantPenaltyConfigCache = new Map();

/**
 * แปลงหน่วย string (เช่น '10s', '5m') เป็นข้อความภาษาไทย
 */
function formatCooldownDisplay(val) {
  if (!val) return "10 วินาที";
  const match = String(val).trim().match(/^(\d+)([sm])$/i);
  if (!match) return "10 วินาที";
  const num = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  if (unit === "s") return `${num} วินาที`;
  if (unit === "m") return `${num} นาที`;
  return `${num} วินาที`;
}

/**
 * แปลงหน่วย string (เช่น '10s', '5m') เป็นมิลลิวินาที
 */
function parseCooldownMs(val) {
  if (!val) return 10000;
  const match = String(val).trim().match(/^(\d+)([sm])$/i);
  if (!match) return 10000;
  const num = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  if (unit === "s") return Math.min(Math.max(num, 1), 60) * 1000;
  if (unit === "m") return Math.min(Math.max(num, 1), 60) * 60 * 1000;
  return 10000;
}

/**
 * ดึงข้อมูลการตั้งค่าคูลดาวน์และเทมเพลตของกิลด์ (มี In-Memory Cache)
 */
async function getTenantPenaltyConfig(supabase, guildId) {
  if (tenantPenaltyConfigCache.has(guildId)) {
    return tenantPenaltyConfigCache.get(guildId);
  }

  let cooldownStr = "10s";
  let penaltyTemplate = "## <:68440x:1358584606911369226> {user} ตอบไม่ถูก โดนหัก {emoji} **{point}** ติดคูลดาวน์ {cooldown}";

  if (supabase) {
    try {
      const { data } = await supabase
        .from("tenant_configs")
        .select("minigame_wrong_cooldown, minigame_penalty_template")
        .eq("guild_id", guildId)
        .maybeSingle();

      if (data) {
        if (data.minigame_wrong_cooldown) cooldownStr = data.minigame_wrong_cooldown;
        if (data.minigame_penalty_template) penaltyTemplate = data.minigame_penalty_template;
      }
    } catch (err) {
      console.warn(`[getTenantPenaltyConfig] Error loading for guild ${guildId}:`, err.message);
    }
  }

  const config = {
    cooldownStr,
    penaltyTemplate,
    cooldownMs: parseCooldownMs(cooldownStr),
  };
  tenantPenaltyConfigCache.set(guildId, config);
  return config;
}

const DEFAULT_ACCESSORY = {
  type: 2,
  style: 5,
  label: "︲เชิญบอทฟรี",
  emoji: {
    id: "1276130500410605609",
    name: "68492gift",
    animated: false,
  },
  url: "https://discord.com/oauth2/authorize?client_id=1538896195253178409",
};

const DEV_STAR_EMOJI_ID = "1212856675053346897";
const DEVELOPER_CONTACT_URL = "https://discord.gg/EHHybsbHxD";

const SUPPORT_ACCESSORY = {
  type: 2,
  style: 5,
  label: "︲ติดต่อผู้พัฒนา",
  emoji: {
    id: DEV_STAR_EMOJI_ID,
    name: "bearcafe_star",
    animated: false,
  },
  url: DEVELOPER_CONTACT_URL,
};

function buildNoPermissionPayload(customText = "คุณต้องมีสิทธิ์ **ผู้ดูแลระบบ (Administrator)** เพื่อใช้คำสั่งนี้นะครับ!") {
  return {
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content: `## <:lowwarning:1548772721679278180>︲__\` 𝖶𝖺𝗋𝗇𝗂𝗇𝗀 ₊ คุณไม่มีสิทธิ์ใช้คำสั่งนี้ 𓂃 \`__\n> ${customText}`,
          },
        ],
      },
    ],
  };
}

const DEFAULT_GAMES_CATEGORY_NAME = "🎮・โซนมินิเกม (Kuma bot)";

const SETUP_GAMES_CATALOG = [
  {
    id: 15,
    value: "p6uH7vTg5i",
    label: "ทายธงประเทศ (⭐ใหม่)",
    description: "ดูภาพธงชาติแล้วเลือกชื่อประเทศให้ถูกต้อง",
    emoji: { id: "1566435496438145094", name: "game14", animated: false },
    isPremium: false,
    defaultChannelName: "🚩︲ทายธงประเทศ",
  },
  {
    id: 16,
    value: "jS7PO64zKX",
    label: "นับจำนวนอีโมจิ (⭐ใหม่)",
    description: "นับอีโมจิเป้าหมายในตารางแล้วเลือกจำนวนที่ถูกต้อง",
    emoji: { id: "1566435515790528552", name: "game15", animated: false },
    isPremium: false,
    defaultChannelName: "🔢︲นับจำนวนอีโมจิ",
  },
  {
    id: 3,
    value: "4fgpXxYeed",
    label: "สุ่มโจทย์คณิตศาสตร์",
    description: "แก้โจทย์บวก ลบ คูณ ให้ถูกต้องและรวดเร็ว",
    emoji: { id: "1566435114437705858", name: "game3", animated: false },
    isPremium: false,
    defaultChannelName: "🎲︲สุ่มโจทย์คณิต",
  },
  {
    id: 4,
    value: "jZCcBoveOM",
    label: "ทายคำจากคำใบ้",
    description: "อ่านคำใบ้ 3 ข้อ แล้วทายคำตอบให้ถูกต้อง",
    emoji: { id: "1566435284005159022", name: "game4", animated: false },
    isPremium: false,
    defaultChannelName: "💡︲ทายคำจากคำใบ้",
  },
  {
    id: 11,
    value: "k2qUFE5oKJ",
    label: "ฟังเสียงแล้วพิมพ์ตอบ (ไทย)",
    description: "ฟังเสียงภาษาไทยแล้วพิมพ์คำศัพท์ที่ได้ยิน",
    emoji: { id: "1566435436568641638", name: "game11", animated: false },
    diamondEmoji: { id: "1521245223311769673", name: "618492diamond", animated: false },
    isPremium: true,
    defaultChannelName: "🔊︲ฟังเสียงตอบ-ไทย",
  },
  {
    id: 5,
    value: "OR0JJEio3T",
    label: "ฟังเสียงแล้วพิมพ์ตอบ (อังกฤษ)",
    description: "ฟังเสียงภาษาอังกฤษแล้วพิมพ์คำศัพท์ที่ได้ยิน",
    emoji: { id: "1566435307635609630", name: "game5", animated: false },
    diamondEmoji: { id: "1521245223311769673", name: "618492diamond", animated: false },
    isPremium: true,
    defaultChannelName: "🔊︲ฟังเสียงตอบ-อังกฤษ",
  },
  {
    id: 6,
    value: "BeEwG69L39",
    label: "พิมพ์คำต่อไปนี้ (ไทย)",
    description: "แข่งพิมพ์คำหรือประโยคภาษาไทยตามภาพโจทย์",
    emoji: { id: "1566435330129793176", name: "game6", animated: false },
    diamondEmoji: { id: "1521245223311769673", name: "618492diamond", animated: false },
    isPremium: true,
    defaultChannelName: "✏️︲พิมพ์ตามคำ-ไทย",
  },
  {
    id: 7,
    value: "NwXktr4n5S",
    label: "พิมพ์คำต่อไปนี้ (อังกฤษ)",
    description: "แข่งพิมพ์คำหรือประโยคภาษาอังกฤษตามภาพโจทย์",
    emoji: { id: "1566435348882530388", name: "game7", animated: false },
    diamondEmoji: { id: "1521245223311769673", name: "618492diamond", animated: false },
    isPremium: true,
    defaultChannelName: "✏️︲พิมพ์ตามคำ-อังกฤษ",
  },
  {
    id: 9,
    value: "59oWjpExQ5",
    label: "ทายคำแปลภาษาไทย ",
    description: "เลือกคำศัพท์ภาษาอังกฤษที่ตรงกับคำภาษาไทย",
    emoji: { id: "1566435385708511272", name: "game9", animated: false },
    isPremium: false,
    defaultChannelName: "🔤︲ทายคำแปล-ไทย",
  },
  {
    id: 8,
    value: "9tmdhK25Dj",
    label: "ทายคำแปลภาษาอังกฤษ",
    description: "เลือกคำแปลภาษาไทยที่ตรงกับคำศัพท์ภาษาอังกฤษ",
    emoji: { id: "1566435368213938317", name: "game8", animated: false },
    isPremium: false,
    defaultChannelName: "🔤︲ทายคำแปล-อังกฤษ",
  },
  {
    id: 10,
    value: "dNMFmLLoQn",
    label: "เกมต่อคำ",
    description: "เลือกคำมาต่อกับคำตั้งต้นให้เกิดเป็นคำที่มีความหมาย",
    emoji: { id: "1566435414867320972", name: "game10", animated: false },
    isPremium: false,
    defaultChannelName: "🔀︲เกมต่อคำ",
  },
  {
    id: 12,
    value: "uOpyD7sATl",
    label: "จริงหรือเท็จ",
    description: "อ่านข้อความแล้วเลือกว่าข้อความนั้นจริงหรือเท็จ",
    emoji: { id: "1566435456718078052", name: "game12", animated: false },
    isPremium: false,
    defaultChannelName: "⚖️︲จริงหรือเท็จ",
  },
  {
    id: 13,
    value: "EgerlsN3Qi",
    label: "เรียงประโยคภาษาอังกฤษ",
    description: "เรียงคำศัพท์ให้เป็นประโยคภาษาอังกฤษที่ถูกต้อง",
    emoji: { id: "1566435476741685259", name: "game13", animated: false },
    diamondEmoji: { id: "1521245223311769673", name: "618492diamond", animated: false },
    isPremium: true,
    defaultChannelName: "🧩︲เรียงประโยค-อังกฤษ",
  },
];

const GAME_VALUE_TO_ID = {};
const GAME_ID_TO_VALUE = {};
const SETUP_CATALOG_BY_ID = {};
const SETUP_CATALOG_BY_VALUE = {};
const DIAMOND_GAME_VALUES = ["k2qUFE5oKJ", "OR0JJEio3T", "BeEwG69L39", "NwXktr4n5S", "EgerlsN3Qi"];

for (const g of SETUP_GAMES_CATALOG) {
  GAME_VALUE_TO_ID[g.value] = g.id;
  GAME_ID_TO_VALUE[g.id] = g.value;
  SETUP_CATALOG_BY_ID[g.id] = g;
  SETUP_CATALOG_BY_VALUE[g.value] = g;
}

const AKARI_GAME_NAMES = {
  1: "🎮︲เติมคำศัพท์-ไทย",
  2: "🎮︲เติมคำศัพท์-อังกฤษ",
  3: "🎲︲สุ่มโจทย์คณิตศาสตร์",
  4: "💡︲ทายคำจากคำใบ้",
  5: "🔊︲ฟังเสียงแล้วพิมพ์ตอบ (อังกฤษ)",
  6: "✏️︲พิมพ์คำต่อไปนี้ (ไทย)",
  7: "✏️︲พิมพ์คำต่อไปนี้ (อังกฤษ)",
  8: "🔤︲ทายคำแปลภาษาอังกฤษ",
  9: "🔤︲ทายคำแปลภาษาไทย ",
  10: "🔀︲เกมต่อคำ",
  11: "🔊︲ฟังเสียงแล้วพิมพ์ตอบ (ไทย)",
  12: "⚖️︲จริงหรือเท็จ",
  13: "🧩︲เรียงประโยคภาษาอังกฤษ",
  15: "🚩︲ทายธงประเทศ (⭐ใหม่)",
  16: "🔢︲นับจำนวนอีโมจิ (⭐ใหม่)",
};

// รายการมินิเกมที่ปิดปรับปรุงชั่วคราว (ซ่อนออกจาก /setting-games และตัวเลือกคำสั่ง)
const TEMPORARY_DISABLED_GAME_IDS = [1, 2];

const GAME_DESCRIPTIONS = {
  1: "เติมคำศัพท์ภาษาไทยที่ถูกซ่อนอยู่",
  2: "เติมคำศัพท์ภาษาอังกฤษที่ถูกซ่อนอยู่",
  3: "สุ่มโจทย์คณิตศาสตร์ คิดเลขเร็ว",
  4: "ทายคำศัพท์ลับจากคำใบ้ที่กำหนด",
  5: "ฟังเสียงภาษาอังกฤษแล้วพิมพ์ตอบให้ถูกต้อง",
  6: "แข่งพิมพ์ข้อความภาษาไทยตามโจทย์",
  7: "แข่งพิมพ์ข้อความภาษาอังกฤษตามโจทย์",
  8: "ทายคำแปลคำศัพท์ภาษาอังกฤษเป็นไทย",
  9: "ทายคำแปลคำศัพท์ภาษาไทยเป็นอังกฤษ",
  10: "เกมพยางค์ต่อพยางค์",
  11: "ฟังเสียงภาษาไทยแล้วพิมพ์ตอบให้ถูกต้อง",
  12: "ทายข้อความโจทย์ว่าจริงหรือเท็จ",
  13: "เลือกคำศัพท์ภาษาอังกฤษมาเรียงให้เป็นประโยคที่ถูกต้อง",
  15: "เลือกทายชื่อประเทศจากภาพธงชาติ ใครตอบถูกคนแรกชนะ",
  16: "นับจำนวนอีโมจิเป้าหมายในตาราง ใครตอบถูกคนแรกชนะ",
};

const {
  KUMA_SLASH_COMMANDS,
  AKARI_SLASH_COMMANDS,
  KUMA_CLEAR_SLASH_COMMAND,
  KUMA_REVEAL_SLASH_COMMAND,
  KUMA_STORE_SLASH_COMMANDS,
  KUMA_CLEAR_ALLOWED_GUILD_ID,
  KUMA_REVEAL_ALLOWED_GUILD_ID,
  KUMA_STORE_ALLOWED_GUILD_ID,
} = require("../../commands/kumaSlashCommands");

/**
 * เปรียบเทียบชุดคำสั่งที่มีอยู่ใน Discord กับคำสั่งเป้าหมายว่าตรงกันหรือไม่
 */
function areCommandsEqual(existingCollection, targetCommands) {
  if (!existingCollection || existingCollection.size !== targetCommands.length) return false;
  for (const cmd of targetCommands) {
    const existingCmd = existingCollection.find((c) => c.name === cmd.name);
    if (!existingCmd) return false;
    if (existingCmd.description !== cmd.description) return false;
    const existingOpts = existingCmd.options || [];
    const targetOpts = cmd.options || [];
    if (existingOpts.length !== targetOpts.length) return false;
    const existingPerm = existingCmd.defaultMemberPermissions?.bitfield?.toString() || null;
    const targetPerm = cmd.default_member_permissions ? BigInt(cmd.default_member_permissions).toString() : null;
    if (existingPerm !== targetPerm) return false;
    for (let i = 0; i < targetOpts.length; i++) {
      const tOpt = targetOpts[i];
      const eOpt = existingOpts[i];
      if (
        !eOpt ||
        tOpt.name !== eOpt.name ||
        tOpt.type !== eOpt.type ||
        Boolean(tOpt.required) !== Boolean(eOpt.required) ||
        Boolean(tOpt.autocomplete) !== Boolean(eOpt.autocomplete)
      ) {
        return false;
      }
      const tChoices = tOpt.choices || [];
      const eChoices = eOpt.choices || [];
      if (tChoices.length !== eChoices.length) return false;
      for (let c = 0; c < tChoices.length; c++) {
        if (tChoices[c].name !== eChoices[c].name || tChoices[c].value !== eChoices[c].value) {
          return false;
        }
      }
    }
  }
  return true;
}

/**
 * ลงทะเบียน Global Slash Commands สำหรับ Akari Bot (ยิงครั้งเดียวครอบคลุมทุกเซิร์ฟเวอร์ทั่วโลก)
 * @param {import('discord.js').Client} client 
 */
async function registerAkariCommands(client) {
  const syncCommands = async () => {
    try {
      if (!client.application) return;

      // 1. ตรวจสอบและลงทะเบียน Global Slash Commands ของ Kuma
      const existingGlobal = await client.application.commands.fetch().catch(() => null);
      if (!existingGlobal || !areCommandsEqual(existingGlobal, AKARI_SLASH_COMMANDS)) {
        await client.application.commands.set(AKARI_SLASH_COMMANDS);
        console.log(`🏮 [KumaCommands] ลงทะเบียน Global Slash Commands (${AKARI_SLASH_COMMANDS.length} คำสั่ง) สำเร็จแล้ว!`);
      } else {
        console.log("⚡ [KumaCommands] Global Slash Commands เป็นปัจจุบันแล้ว (ข้ามการ sync ซ้ำ)");
      }

      // 2. ลงทะเบียนคำสั่งเฉพาะเซิร์ฟเวอร์ (Guild-Scoped Only)
      const guildCommandsMap = new Map();
      const addGuildCommand = (guildId, cmd) => {
        if (!guildCommandsMap.has(guildId)) guildCommandsMap.set(guildId, []);
        guildCommandsMap.get(guildId).push(cmd);
      };
      addGuildCommand(KUMA_CLEAR_ALLOWED_GUILD_ID, KUMA_CLEAR_SLASH_COMMAND);
      addGuildCommand(KUMA_REVEAL_ALLOWED_GUILD_ID, KUMA_REVEAL_SLASH_COMMAND);
      if (Array.isArray(KUMA_STORE_SLASH_COMMANDS) && KUMA_STORE_ALLOWED_GUILD_ID) {
        for (const storeCmd of KUMA_STORE_SLASH_COMMANDS) {
          addGuildCommand(KUMA_STORE_ALLOWED_GUILD_ID, storeCmd);
        }
      }

      for (const [gId, cmds] of guildCommandsMap.entries()) {
        try {
          const targetGuild = client.guilds.cache.get(gId) ||
            await client.guilds.fetch(gId).catch(() => null);
          if (targetGuild) {
            await targetGuild.commands.set(cmds);
            console.log(`🏮 [KumaCommands] ลงทะเบียน Guild Commands (${cmds.map((c) => c.name).join(", ")}) ให้กิลด์ ${gId} เรียบร้อยแล้ว!`);
          }
        } catch (guildCmdErr) {
          console.warn(`⚠️ [KumaCommands] Failed to register guild-specific commands for ${gId}:`, guildCmdErr.message);
        }
      }

      // ล้างคำสั่งที่อาจค้างอยู่ในกิลด์เก่าที่ยกเลิกการทดสอบ
      const staleGuildsToClear = ["1536199707922141254"];
      for (const staleGuildId of staleGuildsToClear) {
        if (!guildCommandsMap.has(staleGuildId)) {
          try {
            const staleGuild = client.guilds.cache.get(staleGuildId) ||
              await client.guilds.fetch(staleGuildId).catch(() => null);
            if (staleGuild) {
              const currentGuildCmds = await staleGuild.commands.fetch().catch(() => null);
              if (currentGuildCmds && currentGuildCmds.size > 0) {
                await staleGuild.commands.set([]);
                console.log(`🧹 [KumaCommands] ล้างคำสั่ง Guild เก่าออกจากกิลด์ ${staleGuildId} เรียบร้อยแล้ว`);
              }
            }
          } catch (staleErr) {
            // ignore
          }
        }
      }
    } catch (e) {
      console.error("❌ [KumaCommands] Register Slash Commands Error:", e.message);
    }
  };

  if (client.isReady()) {
    await syncCommands();
  } else {
    client.once("clientReady", syncCommands);
  }
}

const setupGameSessions = new Map();

/**
 * สร้าง Component V2 แจ้งเตือนเมื่อพบการตั้งค่าเดิมในระบบ (/setup-games)
 */
function buildSetupGamesWarningPayload() {
  return {
    flags: 32768,
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content:
              "## <:warning_1:1562067612135981217>︲พบการตั้งค่าเดิมในระบบต้องการลบทั้งหมดก่อนหรือไม่ ?\n> หากต้องการเพิ่มหรือลบเกมแนะนำให้ใช้คำสั่ง `/setting-games` ",
          },
          {
            type: 14,
            spacing: 2,
          },
          {
            type: 1,
            components: [
              {
                style: 3,
                type: 2,
                flow: {
                  actions: [],
                },
                custom_id: "p_364041959792185353",
                label: "ยืนยัน",
              },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * สร้าง Component V2 หน้าตั้งค่าหลัก (/setup-games) รองรับทั้งแบบฟรีและพรีเมียม
 */
function buildSetupGamesMainPayload(guild, isPremium, selectedGameValues = new Set(), selectedCategoryId = "create_new", client = null) {
  const serverIconUrl =
    guild.iconURL({ dynamic: true, size: 256 }) ||
    client?.user?.displayAvatarURL({ dynamic: true, size: 256 }) ||
    "https://cdn.discordapp.com/embed/avatars/0.png";

  const maxLimit = isPremium ? 13 : 5;

  // กรองความปลอดภัย: ป้องกันไม่ให้มีเกมเพชรในเซิร์ฟเวอร์แบบฟรี และจำกัดจำนวนไม่เกิน maxLimit เพื่อไม่ให้เกิด COMPONENT_TOO_MANY_DEFAULT_VALUES
  const safeSelectedValues = new Set();
  for (const val of selectedGameValues) {
    if (!isPremium && DIAMOND_GAME_VALUES.includes(val)) {
      continue;
    }
    if (safeSelectedValues.size >= maxLimit) {
      break;
    }
    safeSelectedValues.add(val);
  }
  const selectedCount = safeSelectedValues.size;

  // รายการตัวเลือกมินิเกม 13 เกม
  const gameOptions = SETUP_GAMES_CATALOG.map((g) => {
    let emoji = g.emoji;
    if (!isPremium && g.isPremium && g.diamondEmoji) {
      emoji = g.diamondEmoji;
    }
    return {
      label: g.label,
      value: g.value,
      default: safeSelectedValues.has(g.value),
      description: g.description,
      emoji: {
        id: emoji.id,
        name: emoji.name,
        animated: Boolean(emoji.animated),
      },
    };
  });

  // ชื่อหมวดหมู่ที่แสดงในหัวข้อที่ 4
  let categoryNameDisplay = "สร้างใหม่";
  if (selectedCategoryId && selectedCategoryId !== "create_new") {
    const chosenCat = guild.channels?.cache?.get(selectedCategoryId);
    if (chosenCat) {
      categoryNameDisplay = chosenCat.name;
    }
  }

  const bannerUrl =
    "https://media.discordapp.net/attachments/1566075967334518915/1566423425004732538/MainbannerKuma.png?ex=6ae87cff&is=6ae72b7f&hm=d9f7133a1e1df4ac1066753ab5c406c6d4711c907eb1948fefc71013bef259c7&=&format=webp&quality=lossless";

  if (!isPremium) {
    // ── Component V2: แบบฟรี (Standard) ──
    return {
      flags: 32768,
      components: [
        {
          type: 17,
          components: [
            {
              type: 12,
              items: [
                {
                  media: {
                    url: bannerUrl,
                  },
                },
              ],
            },
            {
              type: 10,
              content:
                "## <a:pinkloading:1562052463878602802>︲__` 𝖨𝗇𝗌𝗍𝖺𝗅𝗅𝖺𝗍𝗂𝗈𝗇 𝖲𝗍𝖾𝗉𝗌 ₊ เลือกเกมที่ต้องการติดตั้ง 𓂃 `__\n-# เลือกมินิเกมที่ต้องการติดตั้งลงในเซิร์ฟเวอร์ของคุณได้ตามต้องการ เมื่อติดตั้งเรียบร้อยแล้ว สามารถปรับเปลี่ยนการตั้งค่า เปิด-ปิดเกม หรือจัดการรูปแบบการเล่นได้ทุกเมื่อ <:cuteplant:1152834055528783872>",
            },
            {
              type: 14,
              spacing: 2,
            },
            {
              type: 9,
              components: [
                {
                  type: 10,
                  content: `1. **\` 📝 สถานะเซิร์ฟเวอร์ \` *!***\n  - ชื่อเซิร์ฟเวอร์ : ${guild.name}\n  - แพ็กเกจเซิร์ฟเวอร์ : Standard (ฟรี) — \` 5 เกม \``,
                },
              ],
              accessory: {
                type: 11,
                media: {
                  url: serverIconUrl,
                },
              },
            },
            {
              type: 14,
              spacing: 2,
              divider: true,
            },
            {
              type: 10,
              content:
                "2. **\` 🎮 เลือกมินิเกม \` *!***\n  - *คุณสามารถเลือกติดตั้งมินิเกมได้สูงสุด __5 เกมต่อเซิร์ฟเวอร์__ โดยเกมที่มีสัญลักษณ์ <:618492diamond:1521245223311769673> จำเป็นต้องปลดล็อกแพ็กเกจพรีเมียมก่อน **เพียง 59 บาท** เพื่อเข้าถึงเกมและฟีเจอร์พิเศษทั้งหมด*",
            },
            {
              type: 1,
              components: [
                {
                  type: 3,
                  options: gameOptions,
                  flows: {},
                  custom_id: "p_364022146659258369",
                  min_values: 0,
                  max_values: 5,
                  placeholder: `✏️︲เลือกเกม... (${selectedCount}/5)`,
                },
              ],
            },
            {
              type: 14,
              spacing: 2,
              divider: true,
            },
            {
              type: 10,
              content:
                "3. **\` 📂 เลือกหมวดหมู่ (ไม่จำเป็นต้องเลือก) \` *!***\n  - *เลือกหมวดหมู่ที่ต้องการให้บอทสร้างห้องแชทสำหรับเล่นมินิเกมได้ตามต้องการ หากไม่เลือก ระบบจะสร้างหมวดหมู่ใหม่ให้อัตโนมัติ*",
            },
            {
              type: 1,
              components: [
                {
                  type: 2,
                  style: (!selectedCategoryId || selectedCategoryId === "create_new") ? 3 : 2,
                  custom_id: "kuma_setup_games_btn_create_category",
                  label: (!selectedCategoryId || selectedCategoryId === "create_new")
                    ? "✨ โหมด: สร้างหมวดหมู่ใหม่อัตโนมัติ (เลือกแล้ว)"
                    : "✨ คลิกเพื่อเปลี่ยนเป็น: สร้างหมวดหมู่ใหม่อัตโนมัติ",
                  emoji: { name: "✨" },
                },
              ],
            },
            {
              type: 1,
              components: [
                {
                  type: 8, // ChannelSelectMenu (Discord native category picker)
                  custom_id: "p_364035091917180932",
                  channel_types: [ChannelType.GuildCategory],
                  min_values: 1,
                  max_values: 1,
                  placeholder: (selectedCategoryId && selectedCategoryId !== "create_new")
                    ? `📁︲เลือกแล้ว: ${categoryNameDisplay.slice(0, 50)}`
                    : "📁︲หรือเลือกหมวดหมู่เดิมที่มีอยู่แล้วในเซิร์ฟเวอร์...",
                  default_values: (selectedCategoryId && selectedCategoryId !== "create_new" && guild.channels?.cache?.has(selectedCategoryId))
                    ? [{ id: selectedCategoryId, type: "channel" }]
                    : [],
                },
              ],
            },
            {
              type: 14,
              spacing: 2,
              divider: true,
            },
            {
              type: 10,
              content: `4. **\` ✅ ยืนยันการติดตั้ง \` *!***\n  - หมวดหมู่ : ${categoryNameDisplay}\n  - จำนวนเกม : ${selectedCount} เกม`,
            },
            {
              type: 14,
              spacing: 1,
              divider: false,
            },
            {
              type: 1,
              components: [
                {
                  style: 3,
                  type: 2,
                  flow: {
                    actions: [],
                  },
                  custom_id: "p_364036843668246533",
                  label: "ยืนยัน",
                  disabled: selectedCount === 0,
                },
              ],
            },
          ],
        },
      ],
    };
  }

  // ── Component V2: แบบพรีเมียม (Premium) ──
  return {
    flags: 32768,
    components: [
      {
        type: 17,
        components: [
          {
            type: 12,
            items: [
              {
                media: {
                  url: bannerUrl,
                },
              },
            ],
          },
          {
            type: 10,
            content:
              "## <a:pinkloading:1562052463878602802>︲__` 𝖨𝗇𝗌𝗍𝖺𝗅𝗅𝖺𝗍𝗂𝗈𝗇 𝖲𝗍𝖾𝗉𝗌 ₊ เลือกเกมที่ต้องการติดตั้ง 𓂃 `__\n-# เลือกมินิเกมที่ต้องการติดตั้งลงในเซิร์ฟเวอร์ของคุณได้ตามต้องการ เมื่อติดตั้งเรียบร้อยแล้ว สามารถปรับเปลี่ยนการตั้งค่า เปิด-ปิดเกม หรือจัดการรูปแบบการเล่นได้ทุกเมื่อ <:cuteplant:1152834055528783872>",
          },
          {
            type: 14,
            spacing: 2,
          },
          {
            type: 9,
            components: [
              {
                type: 10,
                content: `1. **\` 📝 สถานะเซิร์ฟเวอร์ \` *!***\n  - ชื่อเซิร์ฟเวอร์ : ${guild.name}\n  - แพ็กเกจเซิร์ฟเวอร์ : Premium (พรีเมียม) — \` 13 เกม \``,
              },
            ],
            accessory: {
              type: 11,
              media: {
                url: serverIconUrl,
              },
            },
          },
          {
            type: 14,
            spacing: 2,
            divider: true,
          },
          {
            type: 10,
            content:
              "2. **\` 🎮 เลือกมินิเกม \` *!***\n  - *คุณสามารถเลือกติดตั้งมินิเกมได้สูงสุด __13 เกมต่อเซิร์ฟเวอร์__ ระบบพบว่าคุณมีพรีเมียม <:618492diamond:1521245223311769673> คุณเลยสามารถเล่นเกมทั้งหมดได้ สุดยอดไปเลย!*",
          },
          {
            type: 1,
            components: [
              {
                type: 3,
                options: gameOptions,
                flows: {},
                custom_id: "p_364022146659258369",
                min_values: 0,
                max_values: 13,
                placeholder: `✏️︲เลือกเกม... (${selectedCount}/13)`,
              },
            ],
          },
          {
            type: 14,
            spacing: 2,
            divider: true,
          },
          {
            type: 10,
            content:
              "3. **\` 📂 เลือกหมวดหมู่ (ไม่จำเป็นต้องเลือก) \` *!***\n  - *เลือกหมวดหมู่ที่ต้องการให้บอทสร้างห้องแชทสำหรับเล่นมินิเกมได้ตามต้องการ หากไม่เลือก ระบบจะสร้างหมวดหมู่ใหม่ให้อัตโนมัติ*",
          },
          {
            type: 1,
            components: [
              {
                type: 2,
                style: (!selectedCategoryId || selectedCategoryId === "create_new") ? 3 : 2,
                custom_id: "kuma_setup_games_btn_create_category",
                label: (!selectedCategoryId || selectedCategoryId === "create_new")
                  ? "✨ โหมด: สร้างหมวดหมู่ใหม่อัตโนมัติ (เลือกแล้ว)"
                  : "✨ คลิกเพื่อเปลี่ยนเป็น: สร้างหมวดหมู่ใหม่อัตโนมัติ",
                emoji: { name: "✨" },
              },
            ],
          },
          {
            type: 1,
            components: [
              {
                type: 8, // ChannelSelectMenu (Discord native category picker)
                custom_id: "p_364035091917180932",
                channel_types: [ChannelType.GuildCategory],
                min_values: 1,
                max_values: 1,
                placeholder: (selectedCategoryId && selectedCategoryId !== "create_new")
                  ? `📁︲เลือกแล้ว: ${categoryNameDisplay.slice(0, 50)}`
                  : "📁︲หรือเลือกหมวดหมู่เดิมที่มีอยู่แล้วในเซิร์ฟเวอร์...",
                default_values: (selectedCategoryId && selectedCategoryId !== "create_new" && guild.channels?.cache?.has(selectedCategoryId))
                  ? [{ id: selectedCategoryId, type: "channel" }]
                  : [],
              },
            ],
          },
          {
            type: 14,
            spacing: 2,
            divider: true,
          },
          {
            type: 10,
            content: `4. **\` ✅ ยืนยันการติดตั้ง \` *!***\n  - หมวดหมู่ : ${categoryNameDisplay}\n  - จำนวนเกม : ${selectedCount} เกม`,
          },
          {
            type: 14,
            spacing: 1,
            divider: false,
          },
          {
            type: 1,
            components: [
              {
                style: 3,
                type: 2,
                flow: {
                  actions: [],
                },
                custom_id: "p_364036843668246533",
                label: "ยืนยัน",
                disabled: selectedCount === 0,
              },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * สร้าง Component V2 หลังติดตั้งมินิเกมเสร็จสิ้น
 */
function buildPostSetupPayload(categoryName, createdChannels, isPremium) {
  const channelListText = createdChannels
    .map((ch) => `  - ${ch.emoji} **\` ${ch.gameTitle} \`** — <#${ch.id}> *(พร้อมเล่น)*`)
    .join("\n");

  const actionButtons = [];
  if (!isPremium) {
    actionButtons.push({
      type: 2,
      style: 3,
      custom_id: "p_364041142276194304",
      label: "︲ปลดล็อค 13 เกมเพียง 59 บาท",
      emoji: {
        id: "1372837492205555812",
        name: "3602exclamationmarkbubble",
        animated: true,
      },
    });
  }
  actionButtons.push({
    type: 2,
    style: 5,
    label: "︲ติดต่อผู้พัฒนา",
    emoji: {
      id: "1212856675053346897",
      name: "bearcafe_star",
      animated: false,
    },
    url: "https://discord.gg/EHHybsbHxD",
  });

  return {
    flags: 32768,
    components: [
      {
        type: 17,
        components: [
          {
            type: 12,
            items: [
              {
                media: {
                  url: "https://cdn.discordapp.com/attachments/1566075967334518915/1566448175730925648/readytoplay.png?ex=6ae8940c&is=6ae7428c&hm=98ede7bde62ab57c56130eb9d24cceba0db8a1897dfd490998526bd9fe42b2a0&",
                },
              },
            ],
          },
          {
            type: 10,
            content:
              "## <:50121checkmark:1358584609087946867>︲__` 𝖲𝖾𝗍𝗎𝗉 𝖼𝗈𝗆𝗉𝗅𝖾𝗍𝖾 ₊ ติดตั้งมินิเกมสำเร็จ! 𓂃 `__\n-# คุมะติดตั้งระบบมินิเกมเรียบร้อยแล้ว ตอนนี้คุณสามารถเริ่มสนุกกับเกมต่าง ๆ ได้ทันที ดูรายละเอียดและวิธีเล่นได้จากด้านล่างเลยค่ะ <:cuteplant:1152834055528783872>",
          },
          {
            type: 14,
            spacing: 2,
          },
          {
            type: 10,
            content:
              "1. **` 📝 ข้อมูลการติดตั้ง ` *!***\n" +
              `  - ชื่อหมวดหมู่ : ${categoryName}\n` +
              `  - จำนวนเกม : ${createdChannels.length} เกม`,
          },
          {
            type: 14,
            spacing: 2,
            divider: true,
          },
          {
            type: 10,
            content:
              "2. **` 🎮 รายการช่องมินิเกมที่เปิดใช้งาน ` *!***\n" +
              `${channelListText}\n\n` +
              "> 💡 **วิธีเล่น:** สมาชิกทุกคนสามารถเข้าไปยังห้องเกมด้านบน และพิมพ์คำตอบหรือกดปุ่มเพื่อร่วมสนุกและสะสมแต้มได้ทันที!",
          },
          {
            type: 14,
            spacing: 2,
            divider: true,
          },
          {
            type: 10,
            content:
              "3. **` 🛠️ คำสั่งที่เกี่ยวข้อง ` *!***\n" +
              "  - `/setting-games` — แผงควบคุมเปิด/ปิดมินิเกม รีเซ็ตโจทย์ และปรับแต่งแต้ม\n" +
              "  - `/set-game` — ผูกหรือย้ายมินิเกมไปยังห้องที่ต้องการแบบกำหนดเอง\n" +
              "  - `/points` — ตรวจสอบคะแนนสะสมและสถิติของตนเองหรือเพื่อน\n" +
              "  - `/leaderboard` — ตรวจสอบกระดานจัดอันดับผู้เล่นคะแนนสูงสุดในเซิร์ฟเวอร์",
          },
          {
            type: 14,
            spacing: 2,
            divider: true,
          },
          {
            type: 1,
            components: actionButtons,
          },
        ],
      },
    ],
  };
}

/**
 * จัดการคำสั่ง /setup-games (Pre-setup check & Setup Flow)
 */
async function handleSetupGames(interaction, supabase, client) {
  const { member, guild } = interaction;

  if (!member.permissions.has(PermissionFlagsBits.ManageChannels) && !member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply(buildNoPermissionPayload());
  }

  await guild.channels.fetch().catch(() => { });

  // 1. ตรวจสอบว่ามีข้อมูลการตั้งค่าเกมเดิมอยู่แล้วหรือไม่
  let hasExisting = false;
  if (supabase) {
    const { data: rows } = await supabase
      .from("tenant_minigame_channels")
      .select("game_id, channel_id")
      .eq("guild_id", guild.id);

    if (rows && rows.length > 0) {
      hasExisting = true;
    }
  }

  // กรณีพบข้อมูลเดิม: ให้ส่ง Component v2 แจ้งเตือนยืนยันลบข้อมูลก่อน
  if (hasExisting) {
    return interaction.reply(buildSetupGamesWarningPayload());
  }

  // 2. กรณีไม่มีข้อมูลเดิม: แสดงหน้าตั้งค่าหลักตามแพ็กเกจทันที
  const planInfo = await getTenantPlan(guild.id, supabase);
  const isPremium = planInfo.isPremium;
  const initialSelected = new Set();
  const initialCategory = "create_new";

  const mainPayload = buildSetupGamesMainPayload(guild, isPremium, initialSelected, initialCategory, client);
  await interaction.reply(mainPayload);
  const reply = await interaction.fetchReply();

  setupGameSessions.set(reply.id, {
    guildId: guild.id,
    isPremium,
    selectedGameValues: initialSelected,
    selectedCategoryId: initialCategory,
  });
}

/**
 * จัดการปุ่มกดในโฟลว์ /setup-games (p_364041959792185353, p_364036843668246533)
 */
async function handleSetupGamesButton(interaction, supabase, client) {
  const { member, guild, customId, message } = interaction;

  if (!member.permissions.has(PermissionFlagsBits.ManageChannels) && !member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply(buildNoPermissionPayload());
  }

  // ── ปุ่มยืนยันลบการตั้งค่าเดิม (Pre-setup Warning Confirm) ──
  if (customId === "p_364041959792185353" || customId === "kuma_setup_games_confirm_reset") {
    // 1. แก้ไขข้อความเป็นหน้า Loading
    await interaction.update({
      flags: 32768,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: "## <a:pinkloading:1562052463878602802>︲` กำลังลบข้อมูลการตั้งค่าเดิมและรีเซ็ตระบบ . . . `",
            },
          ],
        },
      ],
    });

    // 2. ลบข้อมูลและช่องเดิมในเซิร์ฟเวอร์
    if (supabase) {
      const { data: boundRows } = await supabase
        .from("tenant_minigame_channels")
        .select("game_id, channel_id")
        .eq("guild_id", guild.id);

      if (boundRows && boundRows.length > 0) {
        for (const r of boundRows) {
          if (r.channel_id) {
            const ch = guild.channels.cache.get(r.channel_id) || (await guild.channels.fetch(r.channel_id).catch(() => null));
            if (ch) {
              await ch.delete("Kuma Bot Setup-Games Reset").catch(() => { });
            }
          }
        }
      }

      await supabase.from("tenant_minigame_channels").delete().eq("guild_id", guild.id);
      await supabase.from("tenant_minigame_settings").delete().eq("guild_id", guild.id);
      await supabase.from("tenant_minigame_active_sessions").delete().eq("guild_id", guild.id);
      clearActiveTenantSession(guild.id);
      invalidateSettingsCache(guild.id);
    }

    // 3. ปลดล็อกและอัปเดตเข้าสู่หน้าตั้งค่าหลัก /setup-games ทันที
    const planInfo = await getTenantPlan(guild.id, supabase);
    const isPremium = planInfo.isPremium;
    const initialSelected = new Set();
    const initialCategory = "create_new";

    const mainPayload = buildSetupGamesMainPayload(guild, isPremium, initialSelected, initialCategory, client);
    await interaction.editReply(mainPayload);

    setupGameSessions.set(message.id, {
      guildId: guild.id,
      isPremium,
      selectedGameValues: initialSelected,
      selectedCategoryId: initialCategory,
    });
    return;
  }

  // ── ปุ่มสลับไปสร้างหมวดหมู่ใหม่อัตโนมัติ (Create New Category Button) ──
  if (customId === "kuma_setup_games_btn_create_category") {
    let session = setupGameSessions.get(message.id);
    if (!session) {
      const planInfo = await getTenantPlan(guild.id, supabase);
      session = {
        guildId: guild.id,
        isPremium: planInfo.isPremium,
        selectedGameValues: new Set(),
        selectedCategoryId: "create_new",
      };
      setupGameSessions.set(message.id, session);
    }
    session.selectedCategoryId = "create_new";

    const updatedPayload = buildSetupGamesMainPayload(
      guild,
      session.isPremium,
      session.selectedGameValues,
      session.selectedCategoryId,
      client
    );
    await interaction.update(updatedPayload);
    return;
  }

  // ── ปุ่มยืนยันการติดตั้งมินิเกม (Main Setup Confirm) ──
  if (customId === "p_364036843668246533" || customId === "kuma_setup_games_confirm_install") {
    let session = setupGameSessions.get(message.id);
    if (!session) {
      const planInfo = await getTenantPlan(guild.id, supabase);
      session = {
        guildId: guild.id,
        isPremium: planInfo.isPremium,
        selectedGameValues: new Set(),
        selectedCategoryId: "create_new",
      };
      try {
        const comp = message.components?.[0]?.components || [];
        for (const c of comp) {
          const innerComp = c.components?.[0];
          if (!innerComp) continue;
          if (innerComp.custom_id === "p_364022146659258369" || innerComp.custom_id === "kuma_setup_games_select_game") {
            (innerComp.options || []).forEach((opt) => {
              if (opt.default) session.selectedGameValues.add(opt.value);
            });
          }
          if (innerComp.custom_id === "p_364035091917180932" || innerComp.custom_id === "kuma_setup_games_select_category") {
            const defVal = innerComp.default_values?.[0]?.id || innerComp.values?.[0];
            if (defVal) session.selectedCategoryId = defVal;
          }
        }
      } catch (e) { }
    }

    if (session.selectedGameValues.size === 0) {
      return interaction.reply({
        content: "⚠️ กรุณาเลือกมินิเกมอย่างน้อย 1 เกมก่อนกดยืนยันครับ!",
        flags: MessageFlags.Ephemeral,
      });
    }

    // 1. แก้ไข Component เดิมให้เปลี่ยนเป็นหน้า Loading
    await interaction.update({
      flags: 32768,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: "## <a:pinkloading:1562052463878602802>︲` กำลังสร้างหมวดหมู่และช่องมินิเกม . . . `",
            },
          ],
        },
      ],
    });

    // 2. จัดการหมวดหมู่
    let targetCategory = null;
    if (session.selectedCategoryId && session.selectedCategoryId !== "create_new") {
      targetCategory =
        guild.channels.cache.get(session.selectedCategoryId) ||
        (await guild.channels.fetch(session.selectedCategoryId).catch(() => null));
    }

    if (!targetCategory) {
      targetCategory = guild.channels.cache.find(
        (c) => c.type === ChannelType.GuildCategory && c.name === DEFAULT_GAMES_CATEGORY_NAME
      );
      if (!targetCategory) {
        try {
          targetCategory = await guild.channels.create({
            name: DEFAULT_GAMES_CATEGORY_NAME,
            type: ChannelType.GuildCategory,
            reason: "Kuma Bot Auto Setup Games Category",
          });
        } catch (catErr) {
          console.error("[SetupGames] Category creation error:", catErr.message);
        }
      }
    }

    const createdChannels = [];
    for (const val of session.selectedGameValues) {
      const item = SETUP_CATALOG_BY_VALUE[val];
      if (!item) continue;
      const gameId = item.id;
      const channelName = item.defaultChannelName;
      const topic = GAME_DESCRIPTIONS[gameId] || "มินิเกม Kuma Bot";

      try {
        const chOptions = {
          name: channelName,
          type: ChannelType.GuildText,
          topic: `🎮 ${topic} | ขับเคลื่อนโดย บอทคุมะ 🐻`,
          reason: `Kuma Setup Minigame #${gameId}`,
        };
        if (targetCategory && targetCategory.id) {
          chOptions.parent = targetCategory.id;
        }

        const channel = await guild.channels.create(chOptions);

        if (supabase) {
          await supabase.from("tenant_minigame_channels").upsert(
            {
              guild_id: guild.id,
              game_id: gameId,
              channel_id: channel.id,
              channel_name: channel.name,
              created_at: new Date().toISOString(),
            },
            { onConflict: "guild_id,game_id" }
          );

          await supabase.from("tenant_configs").upsert(
            {
              guild_id: guild.id,
              guild_name: guild.name,
              icon_url: guild.iconURL({ dynamic: true, size: 128 }) || null,
              member_count: Number(guild.memberCount) || 0,
              owner_id: guild.ownerId || null,
              status: "active",
              updated_at: new Date().toISOString(),
            },
            { onConflict: "guild_id" }
          );

          await supabase.from("tenant_minigame_settings").upsert(
            {
              guild_id: guild.id,
              game_id: gameId,
              enabled: true,
              canvas_theme: "cyber",
              points_per_win: 10,
            },
            { onConflict: "guild_id,game_id" }
          );
          invalidateSettingsCache(guild.id);
        }

        await spawnQuestion(client, channel, gameId, guild.id, supabase);

        const emojiStr = item.emoji.id
          ? `<:${item.emoji.name}:${item.emoji.id}>`
          : item.emoji.name;

        createdChannels.push({
          id: channel.id,
          name: channel.name,
          gameTitle: item.label.replace(/^[^︲]+︲/, "").trim(),
          emoji: emojiStr,
        });
      } catch (err) {
        console.error(`[SetupGames] Error creating channel for ${item.label}:`, err.message);
      }
    }

    // 3. ลบข้อความคำสั่ง /setup-games เดิมทิ้ง
    await message.delete().catch(() => { });
    setupGameSessions.delete(message.id);

    // 4. ส่งข้อความ Component v2 แจ้งเตือนติดตั้งสำเร็จแทน
    const finalCategoryName = targetCategory ? targetCategory.name : DEFAULT_GAMES_CATEGORY_NAME;
    const postPayload = buildPostSetupPayload(finalCategoryName, createdChannels, session.isPremium);
    await interaction.channel.send(postPayload).catch(() => { });
  }
}

/**
 * จัดการ Select Menus ในโฟลว์ /setup-games (p_364022146659258369, p_364035091917180932)
 */
async function handleSetupGamesSelect(interaction, supabase, client) {
  const { member, guild, customId, message } = interaction;

  if (!member.permissions.has(PermissionFlagsBits.ManageChannels) && !member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply(buildNoPermissionPayload());
  }

  let session = setupGameSessions.get(message.id);
  if (!session) {
    const planInfo = await getTenantPlan(guild.id, supabase);
    session = {
      guildId: guild.id,
      isPremium: planInfo.isPremium,
      selectedGameValues: new Set(),
      selectedCategoryId: "create_new",
    };
    try {
      const comp = message.components?.[0]?.components || [];
      for (const c of comp) {
        const innerComp = c.components?.[0];
        if (!innerComp) continue;
        if (innerComp.custom_id === "p_364022146659258369" || innerComp.custom_id === "kuma_setup_games_select_game") {
          (innerComp.options || []).forEach((opt) => {
            if (opt.default) session.selectedGameValues.add(opt.value);
          });
        }
        if (innerComp.custom_id === "p_364035091917180932" || innerComp.custom_id === "kuma_setup_games_select_category") {
          const defVal = innerComp.default_values?.[0]?.id || innerComp.values?.[0];
          if (defVal) session.selectedCategoryId = defVal;
        }
      }
    } catch (e) { }
    setupGameSessions.set(message.id, session);
  }

  // 1. เมนูเลือกเกม (custom_id: "p_364022146659258369")
  if (customId === "p_364022146659258369" || customId === "kuma_setup_games_select_game") {
    let chosenValues = interaction.values || [];
    let hitDiamond = false;

    // หากเซิร์ฟเวอร์แบบ Standard (ฟรี) ตรวจสอบว่ามีเกมที่ติดสัญลักษณ์เพชรหรือไม่
    if (!session.isPremium) {
      const filtered = [];
      for (const val of chosenValues) {
        if (DIAMOND_GAME_VALUES.includes(val)) {
          hitDiamond = true;
        } else {
          filtered.push(val);
        }
      }
      chosenValues = filtered.slice(0, 5);
    } else {
      chosenValues = chosenValues.slice(0, 13);
    }

    session.selectedGameValues = new Set(chosenValues);

    const updatedPayload = buildSetupGamesMainPayload(
      guild,
      session.isPremium,
      session.selectedGameValues,
      session.selectedCategoryId,
      client
    );

    if (hitDiamond) {
      await interaction.reply(buildPremiumUpsellPayload());
      await message.edit(updatedPayload).catch(() => { });
      return;
    }

    await interaction.update(updatedPayload);
    return;
  }

  // 2. เมนูเลือกหมวดหมู่ (custom_id: "p_364035091917180932")
  if (customId === "p_364035091917180932" || customId === "kuma_setup_games_select_category") {
    session.selectedCategoryId = interaction.values[0] || "create_new";
    const updatedPayload = buildSetupGamesMainPayload(
      guild,
      session.isPremium,
      session.selectedGameValues,
      session.selectedCategoryId,
      client
    );
    await interaction.update(updatedPayload);
    return;
  }
}

/**
 * แปลง String ของ Emoji ให้เป็น Object สำหรับ Button ของ Discord
 */
function parseEmojiObject(emojiStr) {
  if (!emojiStr) return { id: "1548976664090779650", name: "strawberryv2" };
  const customMatch = emojiStr.match(/^<(a)?:([a-zA-Z0-9_]+):(\d+)>$/);
  if (customMatch) {
    return {
      animated: Boolean(customMatch[1]),
      name: customMatch[2],
      id: customMatch[3],
    };
  }
  return { name: emojiStr.trim() };
}

/**
 * ดึงชื่อเกมแบบไม่มี Emoji นำหน้า
 */
function getCleanGameName(gId) {
  if (SETUP_CATALOG_BY_ID[gId]) {
    return SETUP_CATALOG_BY_ID[gId].label;
  }
  const raw = AKARI_GAME_NAMES[gId] || `มินิเกม #${gId}`;
  return raw.replace(/^[^︲]+︲/, "").trim();
}

const GAME_UNICODE_EMOJIS = {
  1: "🎮",
  2: "🎮",
  3: "🎲",
  4: "💡",
  5: "🔊",
  6: "✏️",
  7: "✏️",
  8: "🔤",
  9: "🔤",
  10: "🔀",
  11: "🔊",
  12: "⚖️",
  13: "🧩",
  15: "🚩",
  16: "🔢",
};

const FREE_GAME_IDS = [15, 16, 3, 4, 9, 8, 10, 12];
const PREMIUM_GAME_IDS = [11, 5, 6, 7, 13];
const ALL_DISPLAYABLE_IDS = [15, 16, 3, 4, 11, 5, 6, 7, 9, 8, 10, 12, 13];

/**
 * สร้าง Payload สำหรับแจ้งเตือนเกมพรีเมี่ยม (Ephemeral Component V2)
 */
function buildPremiumUpsellPayload() {
  return {
    flags: FLAG_V2 | MessageFlags.Ephemeral,
    components: [
      {
        type: 17,
        components: [
          {
            type: 12,
            items: [
              {
                media: {
                  url: "https://cdn.discordapp.com/attachments/1566090110775328788/1566090183181598823/59_.png?ex=6ae746a4&is=6ae5f524&hm=2cabd14a51b04c031887d55ac6ec94a255e1aab5f90491775e6a5923819661ca&",
                },
              },
            ],
          },
          {
            type: 10,
            content:
              "## <:bee20000:1256669436350562355>︲__` 𝖯𝗋𝗈𝗆𝗈𝗍𝗂𝗈𝗇 ₊ ข้อเสนอจากทางเรา! 𓂃 `__\n" +
              "-# การปลดล็อกมินิเกมจะช่วยให้คุณเข้าถึงเกมและความสามารถพิเศษต่าง ๆ ของบอทคุมะได้มากยิ่งขึ้น อย่าพลาดโอกาสที่จะปลดล็อกความสนุกและฟีเจอร์ใหม่ ๆ มาเพิ่มสีสันให้เซิร์ฟเวอร์ของคุณ เริ่มปลดล็อกได้เลย! <:cuteplant:1152834055528783872> ",
          },
          {
            type: 14,
            spacing: 2,
          },
          {
            type: 10,
            content:
              "## <:68492gift:1276130500410605609>︲สิทธิพิเศษเมื่อปลดล็อค:\n" +
              "1. **ปลดล็อกเกมทั้งหมด** รวมถึงมินิเกมใหม่ ๆ ที่จะเพิ่มเข้ามาในอนาคต\n" +
              "2. **ปรับแต่งระบบคะแนน** กำหนดจำนวนแต้มที่สมาชิกจะได้รับจากการเล่นเกมได้ตามต้องการ\n" +
              "3. **ระบบติดตามสมาชิกแบบเรียลไทม์** ดูสถานะการเข้าห้องของสมาชิกผ่านระบบโปรโมทเซิร์ฟเวอร์ (Beta)\n" +
              "4. **ปลดล็อกร้านค้าเซิร์ฟเวอร์** สร้างไอเทมสำหรับแลกยศและของรางวัลได้สูงสุด 10 รายการ\n" +
              "5. **รับฟีเจอร์ใหม่ในอนาคต** พร้อมสิทธิ์เข้าถึงการอัปเดตและความสามารถใหม่ ๆ ที่จะทยอยเพิ่มเข้ามา\n\n" +
              "***ปลดล็อกครั้งเดียว เปิดประสบการณ์ความสนุกและเครื่องมือจัดการเซิร์ฟเวอร์ได้เต็มรูปแบบ!***",
          },
          {
            type: 14,
            spacing: 1,
            divider: false,
          },
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 5,
                url: "https://discord.gg/EHHybsbHxD",
                label: "︲สนใจปลดล็อคพรีเมี่ยม",
                emoji: {
                  id: "1358584609087946867",
                  name: "50121checkmark",
                  animated: false,
                },
              },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * สร้าง Payload แจ้งเตือนให้เลือกห้องสำหรับเล่นมินิเกม (Channel Select Menu แบบ Ephemeral Component V2)
 */
function buildBindChannelPayload(gameId, gameName, cleanName, msgId = "", isMissingRoom = false) {
  const subtitle = isMissingRoom
    ? `ห้องเดิมของมินิเกม **${gameName}** ถูกลบไปแล้ว กรุณาเลือกห้องข้อความใหม่ด้านล่างครับ`
    : `มินิเกม **${gameName}** ยังไม่ได้ผูกกับห้องใดในเซิร์ฟเวอร์`;

  return {
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content:
              `## <:bee20000:1256669436350562355>︲__\` 𝖲𝖾𝗍𝗍𝗂𝗇𝗀 ₊ ผูกห้องมินิเกม 𓂃 \`__\n` +
              `# ${subtitle}\n` +
              `> 💡⠀กรุณาเลือกห้องข้อความ (Text Channel) จากเมนูด้านล่าง เพื่อเริ่มเปิดให้สมาชิกเล่นเกมนี้ได้ทันทีครับ!\n\n` +
              `-# 📌 สามารถสลับหรือเปลี่ยนห้องใหม่ได้ตลอดเวลาผ่านคำสั่ง /setting-games <:cuteplant:1152834055528783872>`,
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
                type: 8, // Channel Select Menu
                custom_id: `akari_setting_bind_channel:${gameId}:${msgId}`,
                placeholder: `📢︲เลือกห้องสำหรับเล่น ${cleanName.slice(0, 50)}`,
                channel_types: [0], // GuildText
                min_values: 1,
                max_values: 1,
              },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * สร้าง Payload แดชบอร์ดสำหรับ /setting-games รองรับ 2 หน้าแบบ In-Place
 * @param {import('discord.js').Guild} guild 
 * @param {any} supabase 
 * @param {number} page 1 หรือ 2
 */
async function buildSettingGamesPayload(guild, supabase, page = 1) {
  let settingsMap = {};
  let pointsMap = {};
  let channelsMap = {}; // gameId -> channelId

  if (supabase) {
    const { data: settingsData } = await supabase
      .from("tenant_minigame_settings")
      .select("game_id, enabled, points_per_win")
      .eq("guild_id", guild.id);

    if (settingsData) {
      settingsData.forEach((row) => {
        settingsMap[row.game_id] = row.enabled;
        if (row.points_per_win != null) {
          pointsMap[row.game_id] = row.points_per_win;
        }
      });
    }

    const { data: channelsData } = await supabase
      .from("tenant_minigame_channels")
      .select("game_id, channel_id")
      .eq("guild_id", guild.id);

    if (channelsData) {
      channelsData.forEach((row) => {
        channelsMap[row.game_id] = row.channel_id;
      });
    }
  }

  // ดึงรายชื่อห้องทั้งหมดในแคชของ Guild เพื่อเช็คความสมบูรณ์ของห้อง
  await guild.channels.fetch().catch(() => { });

  const planInfo = await getTenantPlan(guild.id, supabase);
  const isPremium = planInfo.isPremium;

  let activeCount = 0;
  let missingCount = 0;

  // คำนวณสถานะ 3 แบบ: 🟢 พร้อมเล่น | 🔴 ปิดอยู่ | ⚠️ ห้องหาย
  const gameStatuses = {};
  for (const gId of ALL_DISPLAYABLE_IDS) {
    const boundChannelId = channelsMap[gId];
    const isEnabled = settingsMap[gId] !== false;
    let channelObj = boundChannelId ? guild.channels.cache.get(boundChannelId) : null;
    if (boundChannelId && !channelObj) {
      channelObj = await guild.channels.fetch(boundChannelId).catch(() => null);
    }

    if (boundChannelId && !channelObj) {
      gameStatuses[gId] = { status: "missing", channelId: boundChannelId };
      missingCount++;
    } else if (boundChannelId && channelObj && isEnabled) {
      gameStatuses[gId] = { status: "active", channelObj };
      activeCount++;
    } else {
      gameStatuses[gId] = { status: "disabled", boundChannelId };
    }
  }

  const storeConfig = await getTenantStoreConfig(supabase, guild.id);
  const currencyEmoji = storeConfig?.currency_emoji || "<:strawberryv2:1548976664090779650>";

  const planText = isPremium ? "Premium (พรีเมียม)" : "Standard (ฟรี)";
  const quotaText = isPremium ? `ไม่จำกัด (${activeCount} เกม)` : `${activeCount}/${FREE_QUOTA_LIMIT} เกม`;

  const bannerUrl =
    "https://media.discordapp.net/attachments/1566075967334518915/1566076019142688958/3f4f2698a490b6e2.png?ex=6ae73973&is=6ae5e7f3&hm=87f2d560d65ded6865f37d98f4bf7045334376606430f5ad00f0e792b34fcca8&=&format=webp&quality=lossless";
  const headerContent =
    "## <:bee20000:1256669436350562355>︲__` 𝖲𝖾𝗍𝗍𝗂𝗇𝗀𝗌 ₊ จัดการมินิเกม 𓂃 `__\n" +
    "-# ตั้งค่าและจัดการเกมต่าง ๆ ภายในเซิร์ฟเวอร์ของคุณได้ง่าย ๆ ผ่านคำสั่ง `/setting-games` ไม่ว่าจะเป็นการเปิด-ปิดเกม ปรับแต่งรูปแบบการเล่น และกำหนดค่าระบบเกมให้เหมาะกับชุมชนของคุณ เพื่อสร้างประสบการณ์ความสนุกที่ลงตัวสำหรับสมาชิกทุกคน <:cuteplant:1152834055528783872> ";

  // ══════════════════════════════════════════════════════════════════════
  // ── หน้า 2/2 (รีเซ็ตเกม & แต้มรางวัล) ──────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════
  if (page === 2) {
    const activeGameIds = ALL_DISPLAYABLE_IDS.filter(
      (gId) => gameStatuses[gId]?.status === "active"
    );

    const resetOptions = [
      {
        label: "รีเซ็ตโจทย์ใหม่ทุกเกมที่เปิดอยู่ ",
        value: "reset_all",
        emoji: { name: "🔄" },
      },
      ...activeGameIds.map((gId) => {
        const item = SETUP_CATALOG_BY_ID[gId];
        return {
          label: `รีเซ็ตโจทย์ใหม่: ${getCleanGameName(gId)}`,
          value: `reset_${gId}`,
          emoji: item?.emoji || { name: GAME_UNICODE_EMOJIS[gId] || "🎮" },
        };
      }),
    ];

    const pointsLines = ALL_DISPLAYABLE_IDS.map((gId) => {
      const clean = getCleanGameName(gId);
      const pts = (isPremium && pointsMap[gId] != null) ? pointsMap[gId] : 10;
      return `${pts} แต้ม — ${clean}`;
    }).join("\n");

    const penaltyConfig = await getTenantPenaltyConfig(supabase, guild.id);
    const displayCooldown = formatCooldownDisplay(penaltyConfig.cooldownStr);

    const page2Components = [
      {
        type: 12,
        items: [{ media: { url: bannerUrl } }],
      },
      {
        type: 10,
        content: headerContent,
      },
      {
        type: 14,
        spacing: 2,
      },
      {
        type: 10,
        content:
          "4. **` ⚠️ บอทไม่ส่งเกม ` *!***\n" +
          "  - *หากบอทไม่ส่งเกมใหม่ หรือแสดงโจทย์ที่ไม่ตรงกับคำตอบ ท่านสามารถใช้คำสั่งรีเซ็ตเพื่อเริ่มเกมใหม่ได้ทันที โดยบอทจะสร้างและส่งโจทย์ชุดใหม่เข้าสู่ห้องมินิเกมโดยอัตโนมัติ*",
      },
      {
        type: 1,
        components: [
          {
            type: 3,
            custom_id: "akari_setting_reset_menu",
            placeholder: "✏️︲รีเซ็ตการส่งของมินิเกม",
            options:
              resetOptions.length > 0
                ? resetOptions
                : [
                  {
                    label: "ไม่มีห้องเกมที่เปิดใช้งานอยู่",
                    value: "reset_none",
                    emoji: { name: "⚠️" },
                  },
                ],
          },
        ],
      },
      {
        type: 14,
        spacing: 2,
      },
      {
        type: 10,
        content: `5. **\` 🪙 แต้มที่ได้จากมินิเกม \` *!***\n\`\`\`\n${pointsLines}\n\`\`\``,
      },
    ];

    if (!isPremium) {
      page2Components.push({
        type: 1,
        components: [
          {
            type: 2,
            style: 3,
            label: "︲ปลดล็อคการแก้ไขเพียง 59 บาท",
            custom_id: "akari_setting_promo_59",
            disabled: false,
            emoji: {
              id: "1372837492205555812",
              name: "3602exclamationmarkbubble",
              animated: true,
            },
          },
        ],
      });
    } else {
      const pointsOptions = ALL_DISPLAYABLE_IDS.map((gId) => {
        const clean = getCleanGameName(gId);
        const pts = (isPremium && pointsMap[gId] != null) ? pointsMap[gId] : 10;
        return {
          label: clean,
          value: `points_${gId}`,
          description: `แต้มปัจจุบัน: ${pts} แต้ม (คลิกเพื่อแก้ไข)`,
          emoji: { name: GAME_UNICODE_EMOJIS[gId] || "🎮" },
        };
      });

      page2Components.push({
        type: 1,
        components: [
          {
            type: 3,
            custom_id: "akari_setting_points_menu",
            placeholder: "✏️︲จัดการแต้มมินิเกม",
            options: pointsOptions,
          },
        ],
      });
    }

    // 6. ตั้งค่าคูลดาวน์เมื่อตอบผิด
    page2Components.push(
      {
        type: 14,
        spacing: 2,
        divider: true,
      },
      {
        type: 10,
        content: `6. **\` ⏰ ตั้งค่าคูลดาวน์เมื่อตอบผิด \` *!***\n  - ติดคูลดาวน์: ${displayCooldown}\n  > \`{user}\` : แสดงแท็กสมาชิก Discord เพื่อให้สามารถกดเรียกหรือแจ้งเตือนสมาชิกได้\n  > \`{emoji}\` : แสดงสกุลเงินของมินิเกม\n  > \`{point}\` : แสดงจำนวนแต้มที่ถูกหัก เช่น -10\n  > \`{cooldown}\` : แสดงเวลาคูลดาวน์`,
      },
      {
        type: 1,
        components: [
          {
            style: 2,
            type: 2,
            custom_id: "akari_setting_cooldown_btn",
            emoji: {
              name: "✏️",
            },
            label: "︲แก้ไขข้อมูล",
          },
        ],
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
            style: 2,
            label: "กลับหน้าแรก 2/2",
            custom_id: "akari_setting_page_1",
            disabled: false,
            emoji: {
              name: "⬅️",
            },
          },
        ],
      }
    );

    return {
      flags: FLAG_V2,
      components: [
        {
          type: 17,
          components: page2Components,
        },
      ],
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // ── หน้า 1/2 (ข้อมูลเซิร์ฟเวอร์, เกมฟรี & เกมพรีเมี่ยม) ───────────────
  // ══════════════════════════════════════════════════════════════════════
  const freeLines = FREE_GAME_IDS.map((gId) => {
    const status = gameStatuses[gId]?.status;
    const clean = getCleanGameName(gId);
    if (status === "active") return `✅ | ${clean}`;
    if (status === "missing") return `⚠️ | ${clean} (ห้องหาย)`;
    return `❌ | ${clean}`;
  }).join("\n");

  const freeSelectOptions = FREE_GAME_IDS.map((gId) => {
    const gameInfo = gameStatuses[gId];
    const item = SETUP_CATALOG_BY_ID[gId];
    let desc = gameInfo.boundChannelId ? "สถานะ: ปิดอยู่ (กดเพื่อเปิด)" : "ยังไม่ได้ผูกห้อง (กดเพื่อผูกห้อง)";
    let label = item ? item.label : (AKARI_GAME_NAMES[gId] || `มินิเกม #${gId}`);

    if (gameInfo.status === "missing") {
      desc = "คลิกเพื่อเลือกห้องใหม่";
    } else if (gameInfo.status === "active") {
      desc = `พร้อมเล่นที่ #${gameInfo.channelObj?.name || "ห้องเกม"} (กดเพื่อปิด)`;
    }

    return {
      label: label.length > 100 ? label.slice(0, 97) + "..." : label,
      description: desc.length > 100 ? desc.slice(0, 97) + "..." : desc,
      value: item ? item.value : `toggle_${gId}`,
      emoji: item?.emoji || { id: "1548760143192260689", name: "conektionbad", animated: false },
    };
  });

  let premiumLines = "";
  if (!isPremium) {
    premiumLines = PREMIUM_GAME_IDS.map((gId) => `🔒 | ${getCleanGameName(gId)}`).join("\n");
  } else {
    premiumLines = PREMIUM_GAME_IDS.map((gId) => {
      const status = gameStatuses[gId]?.status;
      const clean = getCleanGameName(gId);
      if (status === "active") return `✅ | ${clean}`;
      if (status === "missing") return `⚠️ | ${clean} (ห้องหาย)`;
      return `❌ | ${clean}`;
    }).join("\n");
  }

  const page1Components = [
    {
      type: 12,
      items: [{ media: { url: bannerUrl } }],
    },
    {
      type: 10,
      content: headerContent,
    },
    {
      type: 14,
      spacing: 2,
    },
    {
      type: 9,
      components: [
        {
          type: 10,
          content: `1. **\` ☕ ข้อมูลเซิร์ฟเวอร์ \` *!***\n  - ชื่อเซิร์ฟเวอร์ : ${guild.name}\n  - แพ็กเกจ : ${planText}\n  - โควตาที่ใช้ : ${quotaText}\n  - สกุลแต้ม : ${currencyEmoji}`,
        },
      ],
      accessory: {
        style: 1,
        type: 2,
        custom_id: "akari_setting_currency_btn",
        label: "ตั้งค่าสกุลเงินแต้ม",
      },
    },
    {
      type: 14,
      spacing: 2,
      divider: true,
    },
    {
      type: 10,
      content: `2. **\` 🟢 สถานะเกมฟรี \` *!***\n\`\`\`\n${freeLines}\n\`\`\``,
    },
    {
      type: 1,
      components: [
        {
          type: 3,
          custom_id: "akari_setting_toggle_menu",
          placeholder: "✏️︲เลือกมินิเกมเพื่อสลับสถานะ",
          options: freeSelectOptions,
        },
      ],
    },
    {
      type: 14,
      spacing: 2,
      divider: true,
    },
    {
      type: 10,
      content: `3. **\` 💎 สถานะเกมพรีเมี่ยม \` *!***\n\`\`\`\n${premiumLines}\n\`\`\``,
    },
  ];

  if (!isPremium) {
    page1Components.push({
      type: 1,
      components: [
        {
          type: 2,
          style: 3,
          label: "︲ปลดล็อค 13 เกมเพียง 59 บาท",
          custom_id: "akari_setting_promo_59",
          disabled: false,
          emoji: {
            id: "1372837492205555812",
            name: "3602exclamationmarkbubble",
            animated: true,
          },
        },
      ],
    });
  } else {
    const premiumSelectOptions = PREMIUM_GAME_IDS.map((gId) => {
      const gameInfo = gameStatuses[gId];
      const item = SETUP_CATALOG_BY_ID[gId];
      let desc = gameInfo.boundChannelId ? "สถานะ: ปิดอยู่ (กดเพื่อเปิด)" : "ยังไม่ได้ผูกห้อง (กดเพื่อผูกห้อง)";
      let label = item ? item.label : (AKARI_GAME_NAMES[gId] || `มินิเกม #${gId}`);

      if (gameInfo.status === "missing") {
        desc = "คลิกเพื่อเลือกห้องใหม่";
      } else if (gameInfo.status === "active") {
        desc = `พร้อมเล่นที่ #${gameInfo.channelObj?.name || "ห้องเกม"} (กดเพื่อปิด)`;
      }

      return {
        label: label.length > 100 ? label.slice(0, 97) + "..." : label,
        description: desc.length > 100 ? desc.slice(0, 97) + "..." : desc,
        value: item ? item.value : `toggle_${gId}`,
        emoji: isPremium ? (item?.emoji || { name: "🎮" }) : (item?.diamondEmoji || { id: "1521245223311769673", name: "618492diamond", animated: false }),
      };
    });

    page1Components.push({
      type: 1,
      components: [
        {
          type: 3,
          custom_id: "akari_setting_toggle_premium_menu",
          placeholder: "✏️︲เลือกมินิเกมเพื่อสลับสถานะ",
          options: premiumSelectOptions,
        },
      ],
    });
  }

  page1Components.push(
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
          style: 2,
          label: "ไปหน้า 1/2",
          custom_id: "akari_setting_page_2",
          disabled: false,
          emoji: {
            name: "➡️",
          },
        },
      ],
    }
  );

  return {
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: page1Components,
      },
    ],
  };
}

/**
 * จัดการคำสั่ง /setting-games หรือ /setting-game (Component V2 - ตกแต่งสไตล์ EMOJIS.md)
 */
async function handleSettingGames(interaction, supabase) {
  const { member, guild } = interaction;

  if (!member.permissions.has(PermissionFlagsBits.ManageChannels) && !member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply(buildNoPermissionPayload());
  }

  await interaction.deferReply({ flags: FLAG_V2 });
  const payload = await buildSettingGamesPayload(guild, supabase, 1);
  return interaction.editReply(payload);
}

/**
 * สลับหน้าระหว่างหน้า 1 และ 2 ของ /setting-games แบบ In-Place
 */
async function handleSettingPageSwitch(interaction, supabase, targetPage = 1) {
  if (!interaction.member?.permissions?.has(PermissionFlagsBits.ManageChannels) &&
    !interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply(buildNoPermissionPayload());
  }

  const payload = await buildSettingGamesPayload(interaction.guild, supabase, targetPage);
  return interaction.update(payload);
}

/**
 * แสดงการ์ดสิทธิพิเศษพรีเมียม 59 บาท เมื่อกดปุ่มปลดล็อค
 */
async function handleSettingPromoButton(interaction) {
  return interaction.reply(buildPremiumUpsellPayload());
}

/**
 * จัดการเมื่อคลิกปุ่มตั้งค่าสกุลเงินแต้ม (akari_setting_currency_btn)
 */
async function handleSettingCurrencyButton(interaction, supabase) {
  if (!interaction.member?.permissions?.has(PermissionFlagsBits.ManageChannels) &&
    !interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply(buildNoPermissionPayload());
  }

  const storeConfig = await getTenantStoreConfig(supabase, interaction.guildId);
  const currentEmoji = storeConfig?.currency_emoji || "<:strawberryv2:1548976664090779650>";
  const msgId = interaction.message?.id || "";

  const modal = new ModalBuilder()
    .setCustomId(`akari_currency_modal_submit:${msgId}`)
    .setTitle("ตั้งค่าอิโมจิสกุลเงินแต้ม");

  const emojiInput = new TextInputBuilder()
    .setCustomId("currency_input")
    .setLabel("อิโมจิสกุลเงิน (ธรรมดา หรือ Custom Emoji)")
    .setStyle(TextInputStyle.Short)
    .setValue(currentEmoji)
    .setPlaceholder("เช่น 🍓, 🪙, หรือ <:strawberryv2:1548976664090779650>")
    .setRequired(true)
    .setMaxLength(100);

  modal.addComponents(new ActionRowBuilder().addComponents(emojiInput));
  return interaction.showModal(modal);
}

/**
 * จัดการเมื่อส่ง Modal ตั้งค่าสกุลเงินแต้ม (akari_currency_modal_submit)
 */
async function handleSettingCurrencyModalSubmit(interaction, supabase) {
  const customId = interaction.customId;
  if (!customId.startsWith("akari_currency_modal_submit:")) return;

  const msgId = customId.replace("akari_currency_modal_submit:", "");
  let input = interaction.fields.getTextInputValue("currency_input")?.trim() || "";

  // แปลงอัตโนมัติหากผู้ใช้พิมพ์แค่ :strawberryv2: หรือ strawberryv2 หรือ ID เก่าที่บอทเข้าไม่ถึง
  if (input === ":strawberryv2:" || input === "strawberryv2" || input.includes("1520439075100688614")) {
    input = "<:strawberryv2:1548976664090779650>";
  } else {
    // ตรวจสอบชื่ออิโมจิในคลังของบอทหากใส่แค่ชื่อ :name:
    const nameMatch = input.match(/^:?([a-zA-Z0-9_]+):?$/);
    if (nameMatch) {
      const name = nameMatch[1];
      const found = interaction.client.emojis.cache.find(
        (e) => e.name.toLowerCase() === name.toLowerCase()
      );
      if (found) {
        input = found.toString();
      }
    }
  }

  // ตรวจสอบความถูกต้องของอิโมจิ
  // รองรับ Discord Custom Emoji (<:name:id> หรือ <a:name:id>) หรือ Unicode Emoji ทั่วไป
  const isCustomEmoji = /^<a?:[a-zA-Z0-9_]+:\d+>$/.test(input);
  const isUnicodeEmoji = /\p{Extended_Pictographic}/u.test(input) && [...input].length <= 8;

  if (!isCustomEmoji && !isUnicodeEmoji) {
    return interaction.reply({
      flags: MessageFlags.Ephemeral | FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: `## <:lowwarning:1548772721679278180>︲__\` 𝖶𝖺𝗋𝗇𝗂𝗇𝗀 ₊ รูปแบบอิโมจิไม่ถูกต้อง 𓂃 \`__\n` +
                `> กรุณาระบุ **อิโมจิทั่วไป** (เช่น 🍓, 🪙, 💎) หรือ **Discord Custom Emoji** (เช่น \`<:strawberryv2:1548976664090779650>\`) นะครับ!\n\n` +
                `-# 💡 *คำแนะนำ: หากใช้อิโมจิของเซิร์ฟเวอร์ ให้พิมพ์ \\:ชื่ออิโมจิ: ในช่องแชทเพื่อคัดลอกรหัสแบบเต็มได้ครับ* <:cuteplant:1152834055528783872>`,
            },
          ],
        },
      ],
    });
  }

  // 1. รับทราบ interaction ทันทีเพื่อป้องกัน Timeout 3 วินาทีของ Discord
  if (!(await safeDeferReply(interaction, { flags: FLAG_V2 }))) return;

  const currentConfig = await getTenantStoreConfig(supabase, interaction.guildId);

  // Duplicate Check: หากเป็นอิโมจิเดิมที่ใช้อยู่แล้ว ข้ามการบันทึกและข้ามการแก้แดชบอร์ด
  if (currentConfig?.currency_emoji === input) {
    return interaction.editReply({
      flags: FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: `## <:50121checkmark:1358584609087946867>︲__\` 𝖲𝗎𝖼𝖼𝖾𝗌𝗌 ₊ เปลี่ยนสกุลเงินแต้มสำเร็จ 𓂃 \`__\n` +
                `> สกุลเงินแต้มของเซิร์ฟเวอร์ถูกเปลี่ยนเป็น **${input}** เรียบร้อยแล้วครับ! ✨\n\n` +
                `-# หน้าต่างการตั้งค่าได้รับการอัปเดตเรียบร้อยแล้วครับ <:cuteplant:1152834055528783872>`,
            },
          ],
        },
      ],
    });
  }

  // บันทึกลง Supabase / In-Memory Cache
  await saveTenantStoreConfig(supabase, interaction.guildId, {
    currency_emoji: input,
  });

  // อัปเดตแดชบอร์ด /setting-games ในพื้นหลัง
  if (msgId && interaction.channel) {
    (async () => {
      try {
        const originalMsg = await interaction.channel.messages.fetch(msgId).catch(() => null);
        if (originalMsg) {
          const updatedPayload = await buildSettingGamesPayload(interaction.guild, supabase);
          await originalMsg.edit(updatedPayload).catch(() => { });
        }
      } catch (err) { }
    })();
  }

  return interaction.editReply({
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content: `## <:50121checkmark:1358584609087946867>︲__\` 𝖲𝗎𝖼𝖼𝖾𝗌𝗌 ₊ เปลี่ยนสกุลเงินแต้มสำเร็จ 𓂃 \`__\n` +
              `> สกุลเงินแต้มของเซิร์ฟเวอร์ถูกเปลี่ยนเป็น **${input}** เรียบร้อยแล้วครับ! ✨\n\n` +
              `-# หน้าต่างการตั้งค่าได้รับการอัปเดตเรียบร้อยแล้วครับ <:cuteplant:1152834055528783872>`,
          },
        ],
      },
    ],
  });
}

/**
 * จัดการเมื่อคลิกปุ่ม ✏️ แก้ไขข้อมูลคูลดาวน์ (akari_setting_cooldown_btn)
 */
async function handleSettingCooldownButton(interaction, supabase) {
  if (
    !interaction.member?.permissions?.has(PermissionFlagsBits.ManageChannels) &&
    !interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)
  ) {
    return interaction.reply(buildNoPermissionPayload());
  }

  const penaltyConfig = await getTenantPenaltyConfig(supabase, interaction.guildId);
  const msgId = interaction.message?.id || "";

  const modal = new ModalBuilder()
    .setCustomId(`akari_cooldown_modal_submit:${msgId}`)
    .setTitle("ตั้งค่าคูลดาวน์เมื่อตอบผิด");

  const cooldownInput = new TextInputBuilder()
    .setCustomId("cooldown_input")
    .setLabel("เวลาคูลดาวน์ (1s-60s หรือ 1m-60m)")
    .setStyle(TextInputStyle.Short)
    .setValue(penaltyConfig.cooldownStr || "10s")
    .setPlaceholder("เช่น 10s, 30s หรือ 5m (สูงสุด 60s, 60m)")
    .setRequired(true);

  const templateInput = new TextInputBuilder()
    .setCustomId("template_input")
    .setLabel("ข้อความแจ้งเตือนเมื่อตอบผิด")
    .setStyle(TextInputStyle.Paragraph)
    .setValue(penaltyConfig.penaltyTemplate || "## <:68440x:1358584606911369226> {user} ตอบไม่ถูก โดนหัก {emoji} **{point}** ติดคูลดาวน์ {cooldown}")
    .setMinLength(10)
    .setMaxLength(500)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(cooldownInput),
    new ActionRowBuilder().addComponents(templateInput)
  );

  return interaction.showModal(modal);
}

/**
 * จัดการเมื่อส่ง Modal ตั้งค่าคูลดาวน์และเทมเพลต (akari_cooldown_modal_submit)
 */
async function handleSettingCooldownModalSubmit(interaction, supabase) {
  const customId = interaction.customId;
  if (!customId.startsWith("akari_cooldown_modal_submit:") && !customId.startsWith("kuma_cooldown_modal_submit:")) return;

  const msgId = customId.split(":")[1] || "";
  const cooldownRaw = interaction.fields.getTextInputValue("cooldown_input")?.trim() || "";
  const templateRaw = interaction.fields.getTextInputValue("template_input")?.trim() || "";

  // Validate cooldown time: 1s-60s or 1m-60m
  const timeRegex = /^([1-9]|[1-5][0-9]|60)[sm]$/i;
  if (!timeRegex.test(cooldownRaw)) {
    return interaction.reply({
      flags: MessageFlags.Ephemeral | FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content:
                "## <:lowwarning:1548772721679278180>︲__` 𝖶𝖺𝗋𝗇𝗂𝗇𝗀 ₊ รูปแบบเวลาคูลดาวน์ไม่ถูกต้อง 𓂃 `__\n" +
                "> ⚠️ กรุณาระบุเวลาเป็นตัวเลขตามด้วย **s** (วินาที) หรือ **m** (นาที) นะครับ\n\n" +
                "**ช่วงเวลาที่ระบบรองรับ:**\n" +
                "• วินาที: `1s` ถึง `60s` (เช่น `10s`, `30s`, `60s`)\n" +
                "• นาที: `1m` ถึง `60m` (เช่น `1m`, `5m`, `60m`)\n\n" +
                "-# 💡 ตัวอย่างการกรอกที่ถูกต้อง: `10s` หรือ `5m`",
            },
          ],
        },
      ],
    });
  }

  const normalizedCooldown = cooldownRaw.toLowerCase();
  const cooldownMs = parseCooldownMs(normalizedCooldown);

  // Update In-Memory cache
  const newConfig = {
    cooldownStr: normalizedCooldown,
    penaltyTemplate: templateRaw,
    cooldownMs,
  };
  tenantPenaltyConfigCache.set(interaction.guildId, newConfig);

  // Save to Supabase (tenant_configs)
  if (supabase) {
    try {
      await supabase.from("tenant_configs").upsert(
        {
          guild_id: interaction.guildId,
          minigame_wrong_cooldown: normalizedCooldown,
          minigame_penalty_template: templateRaw,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "guild_id" }
      );
    } catch (err) {
      console.error("[handleSettingCooldownModalSubmit] DB error:", err.message);
    }
  }

  // Update Page 2 in background
  if (msgId && interaction.channel) {
    (async () => {
      try {
        const originalMsg = await interaction.channel.messages.fetch(msgId).catch(() => null);
        if (originalMsg) {
          const updatedPayload = await buildSettingGamesPayload(interaction.guild, supabase, 2);
          await originalMsg.edit(updatedPayload).catch(() => { });
        }
      } catch (err) { }
    })();
  }

  const displayCooldown = formatCooldownDisplay(normalizedCooldown);
  return interaction.reply({
    flags: MessageFlags.Ephemeral | FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content:
              `## <:50121checkmark:1358584609087946867>︲__\` 𝖲𝗎𝖼𝖼𝖾𝗌𝗌 ₊ บันทึกการตั้งค่าสำเร็จ 𓂃 \`__\n` +
              `> ตั้งค่าคูลดาวน์เมื่อตอบผิดเป็น **${displayCooldown}** เรียบร้อยแล้วครับ! ✨\n\n` +
              `-# หน้าต่างการตั้งค่าได้รับการอัปเดตเรียบร้อยแล้วครับ <:cuteplant:1152834055528783872>`,
          },
        ],
      },
    ],
  });
}

/**
 * จัดการ Interaction เมื่อกดเปลี่ยนสถานะเปิด/ปิดใน /setting-games (Component V2 - ตกแต่งสไตล์ EMOJIS.md)
 */
async function handleSettingToggle(interaction, supabase) {
  if (!interaction.isStringSelectMenu()) return;
  if (
    interaction.customId !== "akari_setting_toggle_menu" &&
    interaction.customId !== "kuma_setting_toggle_menu" &&
    interaction.customId !== "akari_setting_toggle_premium_menu" &&
    interaction.customId !== "p_363685568665620504"
  ) {
    return;
  }

  if (
    !interaction.member?.permissions?.has(PermissionFlagsBits.ManageChannels) &&
    !interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)
  ) {
    return interaction.reply(buildNoPermissionPayload());
  }

  const selectedValue = interaction.values[0];
  let gameId = null;
  if (selectedValue.startsWith("toggle_")) {
    const rawVal = selectedValue.replace("toggle_", "");
    gameId = GAME_VALUE_TO_ID[rawVal] || parseInt(rawVal, 10);
  } else if (GAME_VALUE_TO_ID[selectedValue]) {
    gameId = GAME_VALUE_TO_ID[selectedValue];
  } else {
    gameId = parseInt(selectedValue, 10);
  }

  if (!gameId || isNaN(gameId)) return;
  const guildId = interaction.guild.id;
  const gameName = AKARI_GAME_NAMES[gameId] || `มินิเกม #${gameId}`;

  if (TEMPORARY_DISABLED_GAME_IDS.includes(gameId)) {
    return interaction.reply({
      content: `⚠️ มินิเกม **${gameName}** ปิดปรับปรุงระบบชั่วคราวครับ`,
      flags: MessageFlags.Ephemeral,
    });
  }

  // แจ้งสถานะกำลังแก้ไขข้อมูลแบบ Ephemeral ทันที
  if (!(await safeDeferReply(interaction, { flags: FLAG_V2 }))) return;

  // 0. ตรวจสอบสถานะ Premium: หากกดเกมที่ติดพรีเมี่ยม และเซิร์ฟเวอร์ยังไม่ได้เป็น Premium ให้แสดงการ์ดแบบ Ephemeral ทันที
  const planInfo = await getTenantPlan(guildId, supabase);
  if (HEAVYWEIGHT_GAMES.includes(gameId) && !planInfo.isPremium) {
    return interaction.editReply(buildPremiumUpsellPayload());
  }

  // 1. ตรวจสอบว่าเกมนี้ห้องหาย หรือยังไม่ได้ผูกห้องหรือไม่
  let boundChannelId = null;
  if (supabase) {
    const { data: channelRow } = await supabase
      .from("tenant_minigame_channels")
      .select("channel_id")
      .eq("guild_id", guildId)
      .eq("game_id", gameId)
      .maybeSingle();
    if (channelRow) {
      boundChannelId = channelRow.channel_id;
    }
  }

  let channelObj = boundChannelId ? interaction.guild.channels.cache.get(boundChannelId) : null;
  if (boundChannelId && !channelObj) {
    channelObj = await interaction.guild.channels.fetch(boundChannelId).catch(() => null);
  }
  const isMissing = Boolean(boundChannelId && !channelObj);

  // กรณี 1: ⚠️ ห้องหาย -> เคลียร์ช่องเก่าที่หายทิ้งทันที + เปิด SelectChannel ให้เลือกห้องใหม่ทันที!
  if (isMissing) {
    if (supabase) {
      await supabase
        .from("tenant_minigame_channels")
        .delete()
        .eq("guild_id", guildId)
        .eq("game_id", gameId);

      await supabase
        .from("tenant_minigame_active_sessions")
        .delete()
        .eq("guild_id", guildId)
        .eq("channel_id", boundChannelId);

      await supabase.from("tenant_minigame_settings").upsert(
        {
          guild_id: guildId,
          game_id: gameId,
          enabled: false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "guild_id,game_id" }
      );
    }

    clearActiveTenantSession(guildId, boundChannelId);
    invalidateSettingsCache(guildId);

    // อัปเดตข้อความแดชบอร์ดเดิมแบบ In-Place (Page 1)
    if (interaction.message) {
      const updatedPayload = await buildSettingGamesPayload(interaction.guild, supabase, 1);
      await interaction.message.edit(updatedPayload).catch(() => { });
    }

    const cleanName = getCleanGameName(gameId);
    const bindPayload = buildBindChannelPayload(gameId, gameName, cleanName, interaction.message?.id || "", true);
    return interaction.editReply(bindPayload);
  }

  // กรณี 2: ยังไม่ได้ผูกห้องใดๆ -> แสดง SelectChannel ขึ้นมาให้เลือกห้องแบบ Ephemeral ทันที!
  if (!boundChannelId) {
    const planInfo = await getTenantPlan(guildId, supabase);
    if (HEAVYWEIGHT_GAMES.includes(gameId) && !planInfo.isPremium) {
      return interaction.editReply(buildPremiumUpsellPayload());
    }

    const cleanName = getCleanGameName(gameId);
    const bindPayload = buildBindChannelPayload(gameId, gameName, cleanName, interaction.message?.id || "", false);
    return interaction.editReply(bindPayload);
  }

  let currentEnabled = true;
  if (supabase) {
    const { data } = await supabase
      .from("tenant_minigame_settings")
      .select("enabled")
      .eq("guild_id", guildId)
      .eq("game_id", gameId)
      .maybeSingle();

    if (data && typeof data.enabled === "boolean") {
      currentEnabled = data.enabled;
    }
  }

  const nextEnabled = !currentEnabled;

  // กรณี 3: พยายามเปิดใช้งาน ให้ตรวจสอบโควตาและสถานะพรีเมียม
  if (nextEnabled) {
    let enabledCount = 0;
    if (supabase) {
      // นับเฉพาะมินิเกมที่มีการผูกห้องอยู่จริงในเซิร์ฟเวอร์ และเปิดใช้งานอยู่
      const { data: boundChannels } = await supabase
        .from("tenant_minigame_channels")
        .select("game_id")
        .eq("guild_id", guildId);

      const boundGameIds = new Set((boundChannels || []).map((c) => Number(c.game_id)));

      const { data: allSettings } = await supabase
        .from("tenant_minigame_settings")
        .select("game_id, enabled")
        .eq("guild_id", guildId);

      if (allSettings && Array.isArray(allSettings)) {
        enabledCount = allSettings.filter(
          (s) => boundGameIds.has(Number(s.game_id)) && s.enabled === true && Number(s.game_id) !== gameId
        ).length;
      }
    }

    const access = await validateGameAccess(guildId, gameId, supabase, enabledCount);
    if (!access.allowed) {
      return interaction.editReply(buildPremiumUpsellPayload());
    }
  }

  if (supabase) {
    await supabase.from("tenant_minigame_settings").upsert(
      {
        guild_id: guildId,
        game_id: gameId,
        enabled: nextEnabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "guild_id,game_id" }
    );
  }

  invalidateSettingsCache(guildId);

  // หากเปิดเกมกลับมา (Toggle ON) และยังไม่มีโจทย์ค้างอยู่ ให้เริ่มสปอว์นโจทย์ใหม่ทันที
  if (nextEnabled && channelObj) {
    const existingSession = getActiveTenantSession(guildId, boundChannelId);
    if (!existingSession) {
      spawnQuestion(interaction.client, channelObj, gameId, guildId, supabase).catch((err) => {
        console.error(`[handleSettingToggle] Auto-spawn error for game ${gameId}:`, err);
      });
    }
  } else if (!nextEnabled && boundChannelId) {
    // หากปิดเกม (Toggle OFF) ให้ล้าง session ค้างเพื่อหยุดเกมอย่างสมบูรณ์
    clearActiveTenantSession(guildId, boundChannelId);
  }

  // อัปเดตข้อความแดชบอร์ดเดิมแบบ In-Place (Page 1)
  if (interaction.message) {
    const updatedPayload = await buildSettingGamesPayload(interaction.guild, supabase, 1);
    await interaction.message.edit(updatedPayload).catch(() => { });
  }

  return interaction.editReply({
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content:
              `## <:50121checkmark:1358584609087946867>︲__\` 𝖲𝗎𝖼𝖼𝖾𝗌𝗌 ₊ แก้ไขสำเร็จ 𓂃 \`__\n` +
              `> สลับสถานะ **${gameName}** เป็น **${nextEnabled ? "เปิดใช้งาน ✅" : "ปิดใช้งาน ❌"}** เรียบร้อยแล้วครับ! ✨\n\n` +
              `-# หน้าต่างการตั้งค่าได้รับการอัปเดตเรียบร้อยแล้วครับ <:cuteplant:1152834055528783872>`,
          },
        ],
      },
    ],
  });
}

/**
 * จัดการเมื่อเลือกห้องจาก Channel Select Menu ใน /setting-games (akari_setting_bind_channel)
 */
async function handleSettingBindChannel(interaction, supabase, client) {
  if (
    !interaction.member?.permissions?.has(PermissionFlagsBits.ManageChannels) &&
    !interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)
  ) {
    return interaction.reply(buildNoPermissionPayload());
  }

  const customId = interaction.customId;
  if (!customId.startsWith("akari_setting_bind_channel:")) return;

  // ตอบรับ Interaction ทันทีด้วยหน้าจอ Loading เพื่อป้องกัน Timeout และให้ Feedback แก่ผู้ใช้ทันที
  await interaction.update({
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content: "## <a:pinkloading:1562052463878602802>︲` กำลังผูกห้องและเริ่มเกม . . . `",
          },
        ],
      },
    ],
  }).catch(() => {});

  const parts = customId.split(":");
  const gameId = parseInt(parts[1], 10);
  const msgId = parts[2] || "";

  const selectedChannelId = interaction.values[0];
  const guildId = interaction.guildId;
  const gameName = AKARI_GAME_NAMES[gameId] || `มินิเกม #${gameId}`;

  const targetChannel =
    interaction.guild.channels.cache.get(selectedChannelId) ||
    (await interaction.guild.channels.fetch(selectedChannelId).catch(() => null));

  if (!targetChannel) {
    return interaction.editReply({
      flags: FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content:
                `## <:lowwarning:1548772721679278180>︲__\` 𝖶𝖺𝗋𝗇𝗂𝗇𝗀 ₊ ไม่พบห้องที่เลือก 𓂃 \`__\n` +
                `> บอทไม่พบห้องดังกล่าวในเซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้งครับ`,
            },
          ],
        },
      ],
    });
  }

  // ตรวจสอบสิทธิ์ของบอทในช่องเป้าหมาย
  const botMember = interaction.guild.members.me || (await interaction.guild.members.fetchMe().catch(() => null));
  const botPerms = targetChannel.permissionsFor(botMember);
  if (!botPerms?.has(PermissionFlagsBits.SendMessages) || !botPerms?.has(PermissionFlagsBits.ViewChannel)) {
    return interaction.editReply({
      flags: FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content:
                `## <:lowwarning:1548772721679278180>︲__\` 𝖶𝖺𝗋𝗇𝗂𝗇𝗀 ₊ สิทธิ์บอทไม่เพียงพอ 𓂃 \`__\n` +
                `> บอทไม่มีสิทธิ์ **ส่งข้อความ (Send Messages)** หรือ **ดูช่อง (View Channel)** ในห้อง <#${selectedChannelId}> ครับ\n` +
                `> กรุณาให้สิทธิ์บอท หรือเลือกห้องข้อความห้องอื่นนะครับ! <:cuteplant:1152834055528783872>`,
            },
          ],
        },
      ],
    });
  }

  // ตรวจสอบ Premium / โควตา
  const planInfo = await getTenantPlan(guildId, supabase);
  if (HEAVYWEIGHT_GAMES.includes(gameId) && !planInfo.isPremium) {
    return interaction.editReply(buildPremiumUpsellPayload());
  }

  let enabledCount = 0;
  if (supabase) {
    const { data: boundChannels } = await supabase
      .from("tenant_minigame_channels")
      .select("game_id, channel_id")
      .eq("guild_id", guildId);

    // คัดกรองห้องที่จะถูกแทนที่ และไม่นับเกมเดิมถ้ากำลังย้ายห้อง เพื่อให้คำนวณโควตาสุทธิได้ถูกต้อง
    const otherChannels = (boundChannels || []).filter(
      (c) => c.channel_id !== targetChannel.id && Number(c.game_id) !== gameId
    );
    const boundGameIds = new Set(otherChannels.map((c) => Number(c.game_id)));

    const { data: allSettings } = await supabase
      .from("tenant_minigame_settings")
      .select("game_id, enabled")
      .eq("guild_id", guildId);

    if (allSettings && Array.isArray(allSettings)) {
      enabledCount = allSettings.filter(
        (s) => boundGameIds.has(Number(s.game_id)) && s.enabled === true
      ).length;
    } else {
      enabledCount = otherChannels.length;
    }
  }

  const access = await validateGameAccess(guildId, gameId, supabase, enabledCount);
  if (!access.allowed) {
    return interaction.editReply(buildPremiumUpsellPayload());
  }

  if (supabase) {
    // 1. ตรวจสอบว่าห้องเป้าหมายเคยผูกกับเกมอื่นในเซิร์ฟเวอร์นี้ไว้หรือไม่ (1 ห้อง = 1 เกม)
    // หากมี ให้ลบเกมเดิมออกจากห้องนี้และล้าง session เพื่อแทนที่ด้วยเกมใหม่
    const { data: existingInChannel } = await supabase
      .from("tenant_minigame_channels")
      .select("game_id")
      .eq("guild_id", guildId)
      .eq("channel_id", targetChannel.id);

    if (existingInChannel && existingInChannel.length > 0) {
      for (const prev of existingInChannel) {
        if (Number(prev.game_id) !== gameId) {
          await supabase
            .from("tenant_minigame_channels")
            .delete()
            .eq("guild_id", guildId)
            .eq("game_id", prev.game_id);
          clearActiveTenantSession(guildId, targetChannel.id);
        }
      }
    }

    // 2. ล้าง session เดิมหากเกมนี้เคยผูกกับห้องอื่นมาก่อน
    const { data: prevRow } = await supabase
      .from("tenant_minigame_channels")
      .select("channel_id")
      .eq("guild_id", guildId)
      .eq("game_id", gameId)
      .maybeSingle();

    if (prevRow?.channel_id && prevRow.channel_id !== targetChannel.id) {
      try {
        await supabase
          .from("tenant_minigame_active_sessions")
          .delete()
          .eq("guild_id", guildId)
          .eq("channel_id", prevRow.channel_id);
      } catch (_) { }
      clearActiveTenantSession(guildId, prevRow.channel_id);
    }
  }

  // บันทึกการผูกห้องลง Supabase พร้อมกันแบบขนานเพื่อความรวดเร็ว
  if (supabase) {
    await Promise.all([
      supabase.from("tenant_minigame_channels").upsert(
        {
          guild_id: guildId,
          game_id: gameId,
          channel_id: targetChannel.id,
          channel_name: targetChannel.name,
          created_at: new Date().toISOString(),
        },
        { onConflict: "guild_id,game_id" }
      ),
      supabase.from("tenant_minigame_settings").upsert(
        {
          guild_id: guildId,
          game_id: gameId,
          enabled: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "guild_id,game_id" }
      ),
    ]);
  }

  invalidateSettingsCache(guildId);
  clearActiveTenantSession(guildId, targetChannel.id);

  // เริ่มสปอว์นโจทย์ข้อแรกทันทีในห้องเป้าหมาย
  spawnQuestion(client, targetChannel, gameId, guildId, supabase).catch((err) => {
    console.error(`[handleSettingBindChannel] Auto-spawn error for game ${gameId}:`, err);
  });

  // อัปเดตแดชบอร์ด /setting-games เดิมในพื้นหลัง (Page 1) แบบ In-Place
  if (msgId && interaction.channel) {
    (async () => {
      try {
        const originalMsg = await interaction.channel.messages.fetch(msgId).catch(() => null);
        if (originalMsg) {
          const updatedPayload = await buildSettingGamesPayload(interaction.guild, supabase, 1);
          await originalMsg.edit(updatedPayload).catch(() => { });
        }
      } catch (err) { }
    })();
  }

  return interaction.editReply({
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content:
              `## <:50121checkmark:1358584609087946867>︲__\` 𝖲𝗎𝖼𝖼𝖾𝗌𝗌 ₊ ผูกห้องสำเร็จ 𓂃 \`__\n` +
              `> ผูกมินิเกม **${gameName}** เข้ากับห้อง <#${targetChannel.id}> และเปิดใช้งานเรียบร้อยแล้วครับ! ✨\n` +
              `> บอทได้ส่งการ์ดโจทย์ข้อแรกเข้าสู่ห้องดังกล่าว เพื่อให้สมาชิกเริ่มเล่นได้ทันทีแล้ว 🎮\n\n` +
              `-# หน้าต่างการตั้งค่าได้รับการอัปเดตเรียบร้อยแล้วครับ <:cuteplant:1152834055528783872>`,
          },
        ],
      },
    ],
  });
}

/**
 * จัดการคำสั่ง /clear (เฉพาะนักพัฒนาบอท Akari / Developer เท่านั้น)
 */
async function handleClearCategory(interaction, supabase) {
  const { guild, member, options } = interaction;

  // ตรวจสอบว่าคำสั่งถูกเรียกใช้ในเซิร์ฟเวอร์ที่อนุญาตเท่านั้น
  if (interaction.guildId !== KUMA_CLEAR_ALLOWED_GUILD_ID) {
    return interaction.reply({
      content: "❌ คำสั่งนี้อนุญาตให้ใช้งานเฉพาะในเซิร์ฟเวอร์ที่กำหนดเท่านั้นครับ",
      flags: MessageFlags.Ephemeral,
    });
  }

  // ตรวจสอบสิทธิ์เฉพาะนักพัฒนาบอท Akari (Developer Only)
  if (!isAkariAdmin(interaction.user.id, interaction.client)) {
    return interaction.reply({
      flags: FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content:
                "## <:lowwarning:1548772721679278180>︲__` 𝖶𝖺𝗋𝗇𝗂𝗇𝗀 ₊ การเข้าถึงถูกปฏิเสธ 𓂃 `__\n" +
                "> คำสั่งนี้สงวนสิทธิ์เฉพาะ **นักพัฒนาหลัก (Developer)** ของบอท Kuma เท่านั้นครับ!",
            },
          ],
        },
      ],
    });
  }

  await interaction.deferReply({ flags: FLAG_V2 });

  const targetCategory = options.getChannel("category");

  if (!targetCategory || targetCategory.type !== ChannelType.GuildCategory) {
    const invalidText = `## <:68440x:1358584606911369226>︲กรุณาเลือกหมวดหมู่ (Guild Category) ที่ถูกต้อง`;
    return interaction.editReply({
      flags: FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 9,
              components: [{ type: 10, content: invalidText }],
              accessory: DEFAULT_ACCESSORY,
            }
          ]
        }
      ]
    });
  }

  // Fetch ช่องทั้งหมดใน Guild เพื่อให้ได้ Cache ครบถ้วนที่สุด
  await guild.channels.fetch().catch(() => { });
  const channelsToDelete = guild.channels.cache.filter((c) => c.parentId === targetCategory.id);

  if (channelsToDelete.size === 0) {
    // พยายามลบ Category ที่ว่างเปล่า
    await targetCategory.delete("Akari Bot /clear Category Cleanup").catch(() => { });

    const emptyText =
      `## <:bee20000:1256669436350562355>︲__\` 𝖢𝗅𝖾𝖺𝗋 ₊ ไม่พบช่องในหมวดหมู่ 𓂃 \`__\n` +
      `# ไม่พบช่องประเภทใดๆ อยู่ในหมวดหมู่ **${targetCategory.name}**\n` +
      `-# ลบหมวดหมู่ที่ว่างเปล่าออกเรียบร้อยแล้ว <:cuteplant:1152834055528783872>`;

    return interaction.editReply({
      flags: FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 9,
              components: [{ type: 10, content: emptyText }],
              accessory: DEFAULT_ACCESSORY,
            }
          ]
        }
      ]
    });
  }

  const startTime = Date.now();
  const totalChannels = channelsToDelete.size;
  let deletedCount = 0;
  let failedCount = 0;

  const channelList = Array.from(channelsToDelete.values());

  for (let i = 0; i < channelList.length; i++) {
    const ch = channelList[i];

    // แสดงผลความคืบหน้า (Progress UI)
    const progressText =
      `## <:bee20000:1256669436350562355>︲__\` 𝖢𝗅𝖾𝖺𝗋 ₊ กำลังลบช่องในหมวดหมู่ . . . 𓂃 \`__\n` +
      `📌 **หมวดหมู่ (Category):** **${targetCategory.name}**\n` +
      `⏳ **ความคืบหน้า:** \`${deletedCount}/${totalChannels}\` ช่อง (\`${Math.round((deletedCount / totalChannels) * 100)}%\`)\n` +
      `🗑️ **กำลังลบ:** **${ch.name}**\n\n` +
      `-# 🛡️ มีการหน่วงเวลา 1.2 วินาทีต่อช่อง เพื่อป้องกัน Discord API Rate Limit ︲ <a:7596clock:1160230591892029510>`;

    await interaction.editReply({
      flags: FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 9,
              components: [{ type: 10, content: progressText }],
              accessory: DEFAULT_ACCESSORY,
            }
          ]
        }
      ]
    }).catch(() => { });

    // ลบช่องทาง Discord
    try {
      await ch.delete("Akari Bot /clear Category Cleanup");
      deletedCount++;

      // ล้างข้อมูลใน Supabase DB (ถ้ามี)
      if (supabase) {
        try {
          const { data: chRow } = await supabase
            .from("tenant_minigame_channels")
            .select("game_id")
            .eq("guild_id", guild.id)
            .eq("channel_id", ch.id)
            .maybeSingle();

          if (chRow && chRow.game_id) {
            await supabase
              .from("tenant_minigame_settings")
              .delete()
              .eq("guild_id", guild.id)
              .eq("game_id", chRow.game_id);
          }

          await supabase.from("tenant_minigame_channels").delete().eq("channel_id", ch.id);
          await supabase.from("tenant_minigame_active_sessions").delete().eq("guild_id", guild.id).eq("channel_id", ch.id);
          invalidateSettingsCache(guild.id);
        } catch (_) { }
      }
    } catch (err) {
      console.error(`❌ [ClearCategory] Error deleting channel ${ch.name} (${ch.id}):`, err.message);
      failedCount++;
    }

    // หน่วงเวลา 1.2 วินาทีต่อช่องเพื่อป้องกัน Discord API Rate Limits (429)
    await new Promise((r) => setTimeout(r, 1200));
  }

  // ลบหมวดหมู่ (Category) หลังจากลบช่องภายในทั้งหมดเรียบร้อยแล้ว
  await targetCategory.delete("Akari Bot /clear Category Cleanup").catch(() => { });

  const timeTakenSeconds = Math.max(1, Math.round((Date.now() - startTime) / 1000));

  const completedText =
    `## <:50121checkmark:1358584609087946867>︲__\` 𝖢𝗅𝖾𝖺𝗋 ₊ เคลียร์หมวดหมู่สำเร็จเรียบร้อย 𓂃 \`__\n` +
    `📌 **หมวดหมู่เดิม:** **${targetCategory.name}**\n` +
    `🗑️ **ลบช่องสำเร็จทั้งหมด:** **${deletedCount}** ช่อง ${failedCount > 0 ? `(ล้มเหลว: ${failedCount})` : ''}\n` +
    `⏱️ **เวลาที่ใช้:** **${timeTakenSeconds}** วินาที\n\n` +
    `-# ✨ ลบช่องทุกประเภทในหมวดหมู่ และล้างข้อมูลตั้งค่าเรียบร้อยแล้ว ︲ ดำเนินการโดย <@${interaction.user.id}> <:cuteplant:1152834055528783872>`;

  return interaction.editReply({
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 9,
            components: [{ type: 10, content: completedText }],
            accessory: DEFAULT_ACCESSORY,
          }
        ]
      }
    ]
  });
}

/**
 * จัดการ Interaction เมื่อกดสั่งสปอว์น/รีเซ็ตโจทย์ใหม่ใน /setting-games
 */
async function handleSettingReset(interaction, supabase, client) {
  if (!interaction.isStringSelectMenu()) return;
  if (
    interaction.customId !== "akari_setting_reset_menu" &&
    interaction.customId !== "kuma_setting_reset_menu"
  ) {
    return;
  }

  if (
    !interaction.member?.permissions?.has(PermissionFlagsBits.ManageChannels) &&
    !interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)
  ) {
    return interaction.reply(buildNoPermissionPayload());
  }

  const selectedValue = interaction.values[0];
  if (selectedValue === "reset_none") {
    return interaction.reply({
      flags: FLAG_V2 | MessageFlags.Ephemeral,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content:
                `## <:lowwarning:1548772721679278180>︲__\` 𝖶𝖺𝗋𝗇𝗂𝗇𝗀 ₊ ไม่มีห้องเกมที่เปิดอยู่ 𓂃 \`__\n` +
                `> กรุณาเปิดใช้งานมินิเกมใน **หน้า 1/2** ก่อนทำการรีเซ็ตโจทย์นะครับ!`,
            },
          ],
        },
      ],
    });
  }

  if (!selectedValue.startsWith("reset_")) return;

  const guild = interaction.guild;
  const guildId = guild.id;

  // แจ้งสถานะกำลังแก้ไขข้อมูลแบบ Ephemeral ทันที
  if (!(await safeDeferReply(interaction, { flags: FLAG_V2 }))) return;

  if (selectedValue === "reset_all") {
    let resetCount = 0;
    if (supabase) {
      const { data: channels } = await supabase
        .from("tenant_minigame_channels")
        .select("game_id, channel_id")
        .eq("guild_id", guildId);

      if (Array.isArray(channels)) {
        for (const row of channels) {
          const channel = client.channels.cache.get(row.channel_id) || (await client.channels.fetch(row.channel_id).catch(() => null));
          if (channel) {
            await spawnQuestion(client, channel, row.game_id, guildId, supabase);
            resetCount++;
          }
        }
      }
    }

    const contentText =
      `## <:50121checkmark:1358584609087946867>︲__\` 𝖲𝖾𝗍𝗍𝗂𝗇𝗀 𝗋𝖾𝗌𝖾𝗍 ₊ รีเซ็ตโจทย์สำเร็จ 𓂃 \`__\n` +
      `> รีเซ็ตและส่งการ์ดโจทย์ใหม่ลงทุกช่องมินิเกมสำเร็จ! (**${resetCount}** ช่อง)\n\n` +
      `-# หน้าต่างการตั้งค่าได้รับการอัปเดตเรียบร้อยแล้วครับ <:cuteplant:1152834055528783872>`;

    // อัปเดตแดชบอร์ดหน้า 2 ในพื้นหลังแบบ In-Place
    if (interaction.message) {
      const updatedPayload = await buildSettingGamesPayload(guild, supabase, 2);
      await interaction.message.edit(updatedPayload).catch(() => { });
    }

    return interaction.editReply({
      flags: FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: contentText,
            },
          ],
        },
      ],
    });
  } else {
    const gameId = parseInt(selectedValue.replace("reset_", ""), 10);
    const gameName = AKARI_GAME_NAMES[gameId] || `มินิเกม #${gameId}`;
    let success = false;

    if (supabase) {
      const { data: row } = await supabase
        .from("tenant_minigame_channels")
        .select("channel_id")
        .eq("guild_id", guildId)
        .eq("game_id", gameId)
        .maybeSingle();

      if (row && row.channel_id) {
        const channel = client.channels.cache.get(row.channel_id) || (await client.channels.fetch(row.channel_id).catch(() => null));
        if (channel) {
          await spawnQuestion(client, channel, gameId, guildId, supabase);
          success = true;
        }
      }
    }

    const contentText = success
      ? `## <:50121checkmark:1358584609087946867>︲__\` 𝖦𝖺𝗆𝖾 𝗋𝖾𝗌𝖾𝗍 ₊ รีเซ็ตโจทย์สำเร็จ 𓂃 \`__\n` +
      `> รีเซ็ตและส่งการ์ดโจทย์ใหม่สำหรับ **${gameName}** สำเร็จ!\n\n` +
      `-# หน้าต่างการตั้งค่าได้รับการอัปเดตเรียบร้อยแล้วครับ <:cuteplant:1152834055528783872>`
      : `## <:lowwarning:1548772721679278180>︲__\` 𝖶𝖺𝗋𝗇𝗂𝗇𝗀 ₊ ไม่พบช่องมินิเกม 𓂃 \`__\n` +
      `> ไม่พบช่องทางสำหรับ **${gameName}** ในเซิร์ฟเวอร์นี้ (กรุณารัน \`/setup-games\` ก่อน)`;

    // อัปเดตแดชบอร์ดหน้า 2 ในพื้นหลังแบบ In-Place
    if (interaction.message) {
      const updatedPayload = await buildSettingGamesPayload(guild, supabase, 2);
      await interaction.message.edit(updatedPayload).catch(() => { });
    }

    return interaction.editReply({
      flags: FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: contentText,
            },
          ],
        },
      ],
    });
  }
}

/**
 * จัดการเมื่อเลือกเกมจากเมนูตั้งค่าแต้มรางวัล (akari_setting_points_menu)
 */
async function handleSettingPointsSelect(interaction, supabase) {
  if (!interaction.isStringSelectMenu()) return;
  if (
    interaction.customId !== "akari_setting_points_menu" &&
    interaction.customId !== "p_363683368786726927"
  ) {
    return;
  }

  if (
    !interaction.member?.permissions?.has(PermissionFlagsBits.ManageChannels) &&
    !interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)
  ) {
    return interaction.reply(buildNoPermissionPayload());
  }

  const planInfo = await getTenantPlan(interaction.guildId, supabase);
  if (!planInfo.isPremium) {
    return interaction.reply(buildPremiumUpsellPayload());
  }

  const selectedValue = interaction.values[0];
  if (!selectedValue.startsWith("points_")) return;

  const gameId = parseInt(selectedValue.replace("points_", ""), 10);
  const cleanName = getCleanGameName(gameId);

  let currentPoints = 10;
  if (supabase) {
    const { data } = await supabase
      .from("tenant_minigame_settings")
      .select("points_per_win")
      .eq("guild_id", interaction.guildId)
      .eq("game_id", gameId)
      .maybeSingle();

    if (data?.points_per_win != null) {
      currentPoints = data.points_per_win;
    }
  }

  const msgId = interaction.message?.id || "";
  const modal = new ModalBuilder()
    .setCustomId(`akari_points_modal_submit:${gameId}:${msgId}`)
    .setTitle(`ตั้งค่าแต้ม: ${cleanName.slice(0, 30)}`);

  const pointsInput = new TextInputBuilder()
    .setCustomId("points_input")
    .setLabel("จำนวนแต้มที่ได้รับเมื่อชนะ (1 - 10,000)")
    .setStyle(TextInputStyle.Short)
    .setValue(String(currentPoints))
    .setPlaceholder("เช่น 10, 20, 50, 100")
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(6);

  modal.addComponents(new ActionRowBuilder().addComponents(pointsInput));
  return interaction.showModal(modal);
}

/**
 * จัดการเมื่อส่ง Modal ตั้งค่าแต้มรางวัลของแต่ละมินิเกม (akari_points_modal_submit)
 */
async function handleSettingPointsModalSubmit(interaction, supabase) {
  const customId = interaction.customId;
  if (!customId.startsWith("akari_points_modal_submit:")) return;

  const parts = customId.split(":");
  const gameId = parseInt(parts[1], 10);
  const msgId = parts[2] || "";

  const planInfo = await getTenantPlan(interaction.guildId, supabase);
  if (!planInfo.isPremium) {
    return interaction.reply(buildPremiumUpsellPayload());
  }

  const gameName = AKARI_GAME_NAMES[gameId] || `มินิเกม #${gameId}`;
  const inputStr = interaction.fields.getTextInputValue("points_input")?.trim() || "";
  const inputVal = parseInt(inputStr, 10);

  if (isNaN(inputVal) || inputVal <= 0 || inputVal > 100000) {
    return interaction.reply({
      flags: MessageFlags.Ephemeral | FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content:
                `## <:lowwarning:1548772721679278180>︲__\` 𝖶𝖺𝗋𝗇𝗂𝗇𝗀 ₊ จำนวนแต้มไม่ถูกต้อง 𓂃 \`__\n` +
                `> กรุณาระบุจำนวนแต้มเป็นตัวเลขจำนวนเต็มบวกระหว่าง **1 ถึง 100,000** นะครับ!`,
            },
          ],
        },
      ],
    });
  }

  if (!(await safeDeferReply(interaction, { flags: FLAG_V2 }))) return;

  if (supabase) {
    await supabase.from("tenant_minigame_settings").upsert(
      {
        guild_id: interaction.guildId,
        game_id: gameId,
        points_per_win: inputVal,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "guild_id,game_id" }
    );
  }

  invalidateSettingsCache(interaction.guildId);

  // อัปเดตแดชบอร์ด /setting-games เดิมในพื้นหลัง (Page 2)
  if (msgId && interaction.channel) {
    (async () => {
      try {
        const originalMsg = await interaction.channel.messages.fetch(msgId).catch(() => null);
        if (originalMsg) {
          const updatedPayload = await buildSettingGamesPayload(interaction.guild, supabase, 2);
          await originalMsg.edit(updatedPayload).catch(() => { });
        }
      } catch (err) { }
    })();
  }

  return interaction.editReply({
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content:
              `## <:50121checkmark:1358584609087946867>︲__\` 𝖲𝗎𝖼𝖼𝖾𝗌𝗌 ₊ แก้ไขสำเร็จ 𓂃 \`__\n` +
              `> กำหนดแต้มที่ได้รับเมื่อชนะของ **${gameName}** เป็น **${inputVal.toLocaleString()} แต้ม** เรียบร้อยแล้วครับ! ✨\n\n` +
              `-# หน้าต่างการตั้งค่าได้รับการอัปเดตเรียบร้อยแล้วครับ <:cuteplant:1152834055528783872>`,
          },
        ],
      },
    ],
  });
}

/**
 * จัดการคำสั่ง /set-game (ผูกห้องเดี่ยวสำหรับมินิเกม)
 */
async function handleSetGame(interaction, supabase, client) {
  const { member, guild, options } = interaction;

  if (!member.permissions.has(PermissionFlagsBits.ManageChannels) && !member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply(buildNoPermissionPayload());
  }

  await interaction.deferReply({ flags: FLAG_V2 });

  const gameId = options.getInteger("game");
  const targetChannel = options.getChannel("channel");
  const gameName = AKARI_GAME_NAMES[gameId] || `มินิเกม #${gameId}`;

  if (TEMPORARY_DISABLED_GAME_IDS.includes(gameId)) {
    return interaction.editReply({
      flags: FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: `## <:lowwarning:1548772721679278180>︲__\` 𝖶𝖺𝗋𝗇𝗂𝗇𝗀 ₊ มินิเกมปิดปรับปรุงชั่วคราว 𓂃 \`__\n` +
                `# มินิเกม **${gameName}** กำลังอยู่ระหว่างการปรับปรุงระบบ ขออภัยในความไม่สะดวกครับ`,
            },
          ],
        },
      ],
    });
  }

  // ตรวจสอบสิทธิ์การใช้งานตามระดับสมาชิกก่อนผูกห้อง (คำนวณจำนวนห้องสุทธิ ไม่นับห้องที่กำลังจะแทนที่)
  let currentChannelCount = null;
  if (supabase) {
    const { data: existingChannels } = await supabase
      .from("tenant_minigame_channels")
      .select("game_id, channel_id")
      .eq("guild_id", guild.id);

    if (Array.isArray(existingChannels)) {
      // คัดกรองช่องที่จะถูกแทนที่ และไม่นับเกมเดิมถ้ากำลังย้ายห้อง เพื่อให้คำนวณโควตาสุทธิได้แม่นยำ
      const otherChannels = existingChannels.filter(
        (c) => c.channel_id !== targetChannel.id && Number(c.game_id) !== gameId
      );
      currentChannelCount = otherChannels.length;
    }
  }

  const access = await validateGameAccess(guild.id, gameId, supabase, currentChannelCount);
  if (!access.allowed) {
    const deniedText =
      `## <:lowwarning:1548772721679278180>︲__\` 𝖶𝖺𝗋𝗇𝗂𝗇𝗀 ₊ ไม่สามารถเปิดใช้งานเกมนี้ได้ 𓂃 \`__\n` +
      `# ${access.message || 'มินิเกมนี้เป็นเกมพิเศษ (มีรูปภาพการ์ด/ไฟล์เสียง) สำหรับสมาชิก Premium เท่านั้น'}\n` +
      `-# <<< หากต้องการปลดล็อกทุกมินิเกมไม่จำกัด กรุณาติดต่อผู้พัฒนาเพื่ออัปเกรดเป็น Premium ครับ >>>`;

    return interaction.editReply({
      flags: FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: deniedText,
            },
          ],
        },
      ],
    });
  }

  try {
    // 1. ตรวจสอบว่าห้องนี้เคยผูกกับเกมอื่นในเซิร์ฟเวอร์นี้ไว้หรือไม่ (1 ห้อง = 1 เกม)
    if (supabase) {
      const { data: existingInChannel } = await supabase
        .from("tenant_minigame_channels")
        .select("game_id")
        .eq("guild_id", guild.id)
        .eq("channel_id", targetChannel.id);

      if (existingInChannel && existingInChannel.length > 0) {
        for (const prev of existingInChannel) {
          if (prev.game_id !== gameId) {
            await supabase
              .from("tenant_minigame_channels")
              .delete()
              .eq("guild_id", guild.id)
              .eq("game_id", prev.game_id);
            clearActiveTenantSession(guild.id, targetChannel.id);
          }
        }
      }

      // 2. ตรวจสอบว่าเกมนี้เคยผูกกับห้องอื่นไว้ก่อนหรือไม่ ถ้าเคย ให้ล้าง session ของห้องเดิมออก
      const { data: prevChannelForGame } = await supabase
        .from("tenant_minigame_channels")
        .select("channel_id")
        .eq("guild_id", guild.id)
        .eq("game_id", gameId)
        .maybeSingle();

      if (prevChannelForGame && prevChannelForGame.channel_id && prevChannelForGame.channel_id !== targetChannel.id) {
        try {
          await supabase
            .from("tenant_minigame_active_sessions")
            .delete()
            .eq("guild_id", guild.id)
            .eq("channel_id", prevChannelForGame.channel_id);
        } catch (delErr) {
          console.warn("[handleSetGame] Warning clearing old active session:", delErr.message);
        }
        clearActiveTenantSession(guild.id, prevChannelForGame.channel_id);
      }

      // บันทึกการผูกเกมใหม่เข้าห้อง
      await supabase.from("tenant_minigame_channels").upsert(
        {
          guild_id: guild.id,
          game_id: gameId,
          channel_id: targetChannel.id,
          channel_name: targetChannel.name,
          created_at: new Date().toISOString(),
        },
        { onConflict: "guild_id,game_id" }
      );

      // อัปเดตข้อมูลเซิร์ฟเวอร์ใน tenant_configs ด้วย
      await supabase.from("tenant_configs").upsert(
        {
          guild_id: guild.id,
          guild_name: guild.name,
          icon_url: guild.iconURL({ dynamic: true, size: 128 }) || null,
          member_count: Number(guild.memberCount) || 0,
          owner_id: guild.ownerId || null,
          status: "active",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "guild_id" }
      );

      // เปิดสถานะเกมใน tenant_minigame_settings
      await supabase.from("tenant_minigame_settings").upsert(
        {
          guild_id: guild.id,
          game_id: gameId,
          enabled: true,
          canvas_theme: "cyber",
          points_per_win: 10,
        },
        { onConflict: "guild_id,game_id" }
      );
      invalidateSettingsCache(guild.id);
    }

    // ล้าง session เดิมก่อนเริ่มเกมใหม่
    clearActiveTenantSession(guild.id, targetChannel.id);

    // 2. สปอว์นโจทย์ข้อแรกทันทีในห้องเป้าหมาย
    await spawnQuestion(client, targetChannel, gameId, guild.id, supabase);

    const contentText =
      `## <:50121checkmark:1358584609087946867>︲__\` 𝖦𝖺𝗆𝖾 𝖼𝗁𝖺𝗇𝗇𝖾𝗅 𝗌𝖾𝗍 ₊ ผูกห้องเกมเรียบร้อยแล้ว 𓂃 \`__\n` +
      `# ผูกเกม **${gameName}** เข้ากับห้อง <#${targetChannel.id}> สำเร็จ!\n`;

    return interaction.editReply({
      flags: FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: contentText,
            },
          ],
        },
      ],
    });
  } catch (err) {
    console.error(`❌ [SetGame] Error setting game #${gameId} to channel #${targetChannel.id}:`, err.message);
    const errText = `## <:lowwarning:1548772721679278180>︲เกิดข้อผิดพลาดในการดำเนินการ: ${err.message}`;
    return interaction.editReply({
      flags: FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 9,
              components: [{ type: 10, content: errText }],
              accessory: SUPPORT_ACCESSORY,
            },
          ],
        },
      ],
    });
  }
}

/**
 * จัดการคำสั่ง /remove-game (ยกเลิกการผูกห้องมินิเกม)
 */
async function handleRemoveGame(interaction, supabase) {
  const { member, guild, options } = interaction;

  if (!member.permissions.has(PermissionFlagsBits.ManageChannels) && !member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply(buildNoPermissionPayload());
  }

  await interaction.deferReply({ flags: FLAG_V2 });

  const gameId = options.getInteger("game");
  const gameName = AKARI_GAME_NAMES[gameId] || `มินิเกม #${gameId}`;

  try {
    let boundChannelId = null;

    if (supabase) {
      // ตรวจสอบห้องเดิมก่อน
      const { data } = await supabase
        .from("tenant_minigame_channels")
        .select("channel_id")
        .eq("guild_id", guild.id)
        .eq("game_id", gameId)
        .maybeSingle();

      if (!data || !data.channel_id) {
        return interaction.editReply({
          flags: FLAG_V2,
          components: [
            {
              type: 17,
              components: [
                {
                  type: 10,
                  content:
                    `## <:lowwarning:1548772721679278180>︲__\` 𝖴𝗇𝗅𝗂𝗇𝗄 𝗀𝖺𝗆𝖾 𝖼𝗁𝖺𝗇𝗇𝖾𝗅 𓂃 \`__\n` +
                    `# มินิเกม **${gameName}** ไม่ได้เปิดใช้งานอยู่ในห้องใดเลยในเซิร์ฟเวอร์นี้ค่ะ\n` +
                    `-# <<< กรุณาเลือกมินิเกมที่เปิดใช้งานอยู่จากรายการที่แนะนำ >>>`,
                },
              ],
            },
          ],
        });
      }

      boundChannelId = data.channel_id;

      // ลบออกจาก tenant_minigame_channels
      await supabase
        .from("tenant_minigame_channels")
        .delete()
        .eq("guild_id", guild.id)
        .eq("game_id", gameId);

      // ลบการตั้งค่าออกจาก tenant_minigame_settings เพื่อคืนโควตา
      await supabase
        .from("tenant_minigame_settings")
        .delete()
        .eq("guild_id", guild.id)
        .eq("game_id", gameId);

      // ล้าง session ที่ค้างอยู่ในห้องนั้น (ถ้ามี)
      if (boundChannelId) {
        await supabase
          .from("tenant_minigame_active_sessions")
          .delete()
          .eq("guild_id", guild.id)
          .eq("channel_id", boundChannelId);
      }
    }

    if (boundChannelId) {
      clearActiveTenantSession(guild.id, boundChannelId);
    }

    // ล้าง settings cache ด้วย
    invalidateSettingsCache(guild.id);

    const channelDesc = boundChannelId ? `จากห้อง <#${boundChannelId}>` : `ในเซิร์ฟเวอร์นี้`;
    const contentText =
      `## <:50121checkmark:1358584609087946867>︲__\` 𝖴𝗇𝗅𝗂𝗇𝗄 𝗀𝖺𝗆𝖾 𝖼𝗁𝖺𝗇𝗇𝖾𝗅 ₊ ยกเลิกการผูกเกมเรียบร้อยแล้ว 𓂃 \`__\n` +
      `# ยกเลิกการผูกเกม **${gameName}** ${channelDesc} เรียบร้อยแล้ว!\n` +
      `-# <<< หากต้องการนำกลับมาเปิดเล่นใหม่ สามารถใช้คำสั่ง \`/set-game\` หรือ \`/setup-games\` ได้ทุกเมื่อครับ >>>`;

    return interaction.editReply({
      flags: FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: contentText,
            },
          ],
        },
      ],
    });
  } catch (err) {
    console.error(`❌ [RemoveGame] Error removing game #${gameId}:`, err.message);
    const errText = `## <:lowwarning:1548772721679278180>︲เกิดข้อผิดพลาดในการดำเนินการ: ${err.message}`;
    return interaction.editReply({
      flags: FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 9,
              components: [{ type: 10, content: errText }],
              accessory: SUPPORT_ACCESSORY,
            },
          ],
        },
      ],
    });
  }
}

/**
 * จัดการ Autocomplete สำหรับคำสั่ง /remove-game
 * แสดงเฉพาะมินิเกมที่กำลังเปิดใช้งานและผูกห้องอยู่ในกิลด์นี้เท่านั้น
 */
async function handleRemoveGameAutocomplete(interaction, supabase) {
  try {
    const focusedOption = interaction.options.getFocused(true);
    if (focusedOption.name !== "game") return;

    if (!supabase || !interaction.guildId) {
      return await interaction.respond([]);
    }

    // ดึงเฉพาะเกมที่มีการผูกห้องไว้ในเซิร์ฟเวอร์นี้
    const { data, error } = await supabase
      .from("tenant_minigame_channels")
      .select("game_id, channel_id")
      .eq("guild_id", interaction.guildId);

    if (error || !data || data.length === 0) {
      return await interaction.respond([]);
    }

    const focusedText = String(focusedOption.value || "").trim().toLowerCase();

    const choices = data
      .map((row) => {
        const gameName = AKARI_GAME_NAMES[row.game_id] || `มินิเกม #${row.game_id}`;
        const channel = interaction.guild?.channels?.cache.get(row.channel_id);
        const channelLabel = channel ? ` (ห้อง #${channel.name})` : "";
        return {
          name: `${gameName}${channelLabel}`.slice(0, 100),
          value: Number(row.game_id),
        };
      })
      .filter((c) => !focusedText || c.name.toLowerCase().includes(focusedText))
      .slice(0, 25);

    await interaction.respond(choices);
  } catch (err) {
    console.error("[handleRemoveGameAutocomplete] Error:", err.message);
    try {
      await interaction.respond([]);
    } catch { }
  }
}

/**
 * ตรวจสอบสิทธิ์ผู้ดูแลระบบ/นักพัฒนาหลักของ Kuma Bot
 */
function isKumaAdmin(userId, client) {
  if (!userId) return false;

  const adminIds = (process.env.KUMA_ADMIN_IDS || process.env.AKARI_ADMIN_IDS || process.env.OWNER_ID || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (adminIds.includes(userId)) return true;

  const appOwner = client?.application?.owner;
  if (appOwner) {
    if (appOwner.id === userId) return true;
    if (appOwner.members && typeof appOwner.members.has === "function" && appOwner.members.has(userId)) {
      return true;
    }
  }

  return false;
}
const isAkariAdmin = isKumaAdmin;

/**
 * จัดการคำสั่ง /kuma-admin (เฉพาะนักพัฒนาบอท Kuma สำหรับจัดการสมาชิกและพรีเมียม)
 */
async function handleKumaAdmin(interaction, supabase, client) {
  const userId = interaction.user.id;

  if (!isKumaAdmin(userId, client)) {
    return interaction.reply({
      flags: FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content:
                "## <:lowwarning:1548772721679278180>︲__` 𝖶𝖺𝗋𝗇𝗂𝗇𝗀 ₊ การเข้าถึงถูกปฏิเสธ 𓂃 `__\n" +
                "> คุณไม่มีสิทธิ์ใช้งานคำสั่งนี้ คำสั่งนี้สงวนสิทธิ์เฉพาะนักพัฒนาและผู้ดูแลระบบหลักของ Kuma Bot เท่านั้น",
            },
          ],
        },
      ],
    });
  }

  await interaction.deferReply({ flags: FLAG_V2 });

  const subCommand = interaction.options.getSubcommand();

  if (subCommand === "set-premium") {
    const targetGuildId = interaction.options.getString("guild_id")?.trim();
    const days = interaction.options.getInteger("days");

    if (!targetGuildId || !days || days <= 0) {
      return interaction.editReply({
        content: "❌ ข้อมูล Guild ID หรือจำนวนวันไม่ถูกต้อง",
      });
    }

    if (!supabase) {
      return interaction.editReply({
        content: "❌ ระบบเชื่อมต่อ Database ไม่ได้ (ทำงานในโหมด RAM Fallback)",
      });
    }

    try {
      // ตรวจสอบวันหมดอายุเดิม หากยังไม่หมด ให้ต่อเวลาเพิ่มจากเดิม
      const { data: currentConfig } = await supabase
        .from("tenant_configs")
        .select("guild_id, plan, expires_at, guild_name")
        .eq("guild_id", targetGuildId)
        .maybeSingle();

      let baseTime = Date.now();
      if (currentConfig?.expires_at) {
        const existingExpires = new Date(currentConfig.expires_at).getTime();
        if (existingExpires > baseTime) {
          baseTime = existingExpires;
        }
      }

      const newExpiresAt = new Date(baseTime + days * 24 * 60 * 60 * 1000).toISOString();
      const targetGuildName = client?.guilds?.cache?.get(targetGuildId)?.name || currentConfig?.guild_name || "ไม่ทราบชื่อเซิร์ฟเวอร์";

      const { error: upsertErr } = await supabase.from("tenant_configs").upsert(
        {
          guild_id: targetGuildId,
          guild_name: targetGuildName,
          plan: "premium",
          status: "active",
          expires_at: newExpiresAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "guild_id" }
      );

      if (upsertErr) {
        throw upsertErr;
      }

      invalidateTenantPlanCache(targetGuildId);

      const formattedExpires = new Date(newExpiresAt).toLocaleString("th-TH", {
        timeZone: "Asia/Bangkok",
        dateStyle: "medium",
        timeStyle: "short",
      });

      const successText =
        `### <:50121checkmark:1358584609087946867>︲__\` 𝖠𝖪𝖠𝖱𝖨 𝖯𝖱𝖤𝖬𝖨𝖴𝖬 𝖠𝖢𝖳𝖨𝖵𝖠𝖳𝖤𝖣 𓂃 \`__\n` +
        `# อัปเกรดสถานะ Premium ให้กับเซิร์ฟเวอร์เรียบร้อยแล้ว! 👑\n` +
        `> 🏷️ **เซิร์ฟเวอร์:** **${targetGuildName}** (\`${targetGuildId}\`)\n` +
        `> 💎 **แผนสมาชิก:** **Premium** (ปลดล็อก 13 มินิเกม ไม่จำกัดโควตา)\n` +
        `> ⏳ **ระยะเวลาที่เพิ่ม:** +**${days}** วัน\n` +
        `> 📅 **ใช้งานได้ถึง:** **${formattedExpires}**\n\n` +
        `-# แคชระบบได้รับการอัปเดตทันที สมาชิกในเซิร์ฟเวอร์ดังกล่าวสามารถเปิดมินิเกมได้ไม่จำกัดแล้วครับ <:cuteplant:1152834055528783872>`;

      return interaction.editReply({
        flags: FLAG_V2,
        components: [
          {
            type: 17,
            components: [
              {
                type: 9,
                components: [{ type: 10, content: successText }],
                accessory: DEFAULT_ACCESSORY,
              },
            ],
          },
        ],
      });
    } catch (err) {
      console.error("[AkariAdmin] set-premium error:", err.message);
      return interaction.editReply({
        content: `❌ เกิดข้อผิดพลาดในการตั้งค่า Premium: ${err.message}`,
      });
    }
  }

  if (subCommand === "remove-premium") {
    const targetGuildId = interaction.options.getString("guild_id")?.trim();

    if (!targetGuildId) {
      return interaction.editReply({
        content: "❌ กรุณาระบุ Guild ID ให้ถูกต้อง",
      });
    }

    if (!supabase) {
      return interaction.editReply({
        content: "❌ ระบบเชื่อมต่อ Database ไม่ได้ (ทำงานในโหมด RAM Fallback)",
      });
    }

    try {
      const targetGuildName = client?.guilds?.cache?.get(targetGuildId)?.name || "ไม่ทราบชื่อเซิร์ฟเวอร์";

      await supabase
        .from("tenant_configs")
        .update({
          plan: "standard",
          status: "active",
          expires_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("guild_id", targetGuildId);

      invalidateTenantPlanCache(targetGuildId);

      const successText =
        `### <:50121checkmark:1358584609087946867>︲__\` 𝖠𝖪𝖠𝖱𝖨 𝖲𝖳𝖠𝖭𝖣𝖠𝖱𝖣 𝖱𝖤𝖲𝖤𝖳 𓂃 \`__\n` +
        `# ปรับสถานะเซิร์ฟเวอร์กลับเป็น Standard เรียบร้อยแล้ว!\n` +
        `> 🏷️ **เซิร์ฟเวอร์:** **${targetGuildName}** (\`${targetGuildId}\`)\n` +
        `> 📦 **แผนสมาชิก:** **Standard (ฟรี)**\n` +
        `> ℹ️ **ข้อจำกัด:** จำกัดสูงสุด ${FREE_QUOTA_LIMIT} มินิเกม (เฉพาะเกมทั่วไป)\n\n` +
        `-# ช่องมินิเกมเดิมและประวัติข้อความจะไม่ถูกลบ แต่ห้องที่เกินโควตาหรือเกมพิเศษจะหยุดส่งโจทย์ใหม่อัตโนมัติ <:cuteplant:1152834055528783872>`;

      return interaction.editReply({
        flags: FLAG_V2,
        components: [
          {
            type: 17,
            components: [
              {
                type: 9,
                components: [{ type: 10, content: successText }],
                accessory: DEFAULT_ACCESSORY,
              },
            ],
          },
        ],
      });
    } catch (err) {
      console.error("[AkariAdmin] remove-premium error:", err.message);
      return interaction.editReply({
        content: `❌ เกิดข้อผิดพลาดในการยกเลิก Premium: ${err.message}`,
      });
    }
  }

  if (subCommand === "check-tenant") {
    const targetGuildId = interaction.options.getString("guild_id")?.trim();

    if (!targetGuildId) {
      return interaction.editReply({
        content: "❌ กรุณาระบุ Guild ID ให้ถูกต้อง",
      });
    }

    if (!supabase) {
      return interaction.editReply({
        content: "❌ ระบบเชื่อมต่อ Database ไม่ได้ (ทำงานในโหมด RAM Fallback)",
      });
    }

    try {
      const { data: config } = await supabase
        .from("tenant_configs")
        .select("*")
        .eq("guild_id", targetGuildId)
        .maybeSingle();

      const { data: channels } = await supabase
        .from("tenant_minigame_channels")
        .select("game_id, channel_id, created_at")
        .eq("guild_id", targetGuildId)
        .order("created_at", { ascending: true });

      const targetGuildName = client?.guilds?.cache?.get(targetGuildId)?.name || config?.guild_name || "ไม่ทราบชื่อเซิร์ฟเวอร์";
      const planInfo = await getTenantPlan(targetGuildId, supabase, true);

      let planDisplay = "Standard (ฟรี)";
      let expiryDisplay = "ไม่มีวันหมดอายุ (ฟรีตลอดชีพ)";

      if (planInfo.isPremium) {
        planDisplay = "👑 **Premium (พรีเมียม)**";
        if (planInfo.expiresAt) {
          const expDate = new Date(planInfo.expiresAt);
          const daysLeft = Math.ceil((expDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
          const formattedDate = expDate.toLocaleString("th-TH", {
            timeZone: "Asia/Bangkok",
            dateStyle: "medium",
            timeStyle: "short",
          });
          expiryDisplay = `${formattedDate} (เหลืออีก ~${daysLeft} วัน)`;
        } else {
          expiryDisplay = "ไม่มีวันหมดอายุ (Lifetime)";
        }
      } else if (config?.expires_at && new Date(config.expires_at).getTime() < Date.now()) {
        planDisplay = "⚠️ **หมดอายุแล้ว (Expired - ปรับเป็น Standard อัตโนมัติ)**";
        const formattedDate = new Date(config.expires_at).toLocaleString("th-TH", {
          timeZone: "Asia/Bangkok",
          dateStyle: "medium",
          timeStyle: "short",
        });
        expiryDisplay = `หมดอายุเมื่อ: ${formattedDate}`;
      }

      const boundChannels = channels || [];
      const channelLines = boundChannels.map((c) => {
        const gName = AKARI_GAME_NAMES[c.game_id] || `มินิเกม #${c.game_id}`;
        const isHeavy = HEAVYWEIGHT_GAMES.includes(Number(c.game_id));
        const tierTag = isHeavy ? "🔴 [เกมพิเศษ - Premium]" : "🟢 [เกมทั่วไป]";
        return `• ${tierTag} **${gName}** ➔ <#${c.channel_id}>`;
      });

      const channelsReport = channelLines.length > 0 ? channelLines.join("\n") : "ยังไม่ได้ผูกห้องมินิเกมใดๆ";

      const checkText =
        `### <:bee20000:1256669436350562355>︲__\` 𝖠𝖪𝖠𝖱𝖨 𝖳𝖤𝖭𝖠𝖭𝖳 𝖨𝖭𝖥𝖮 𓂃 \`__\n` +
        `# รายละเอียดข้อมูลเซิร์ฟเวอร์ \`${targetGuildId}\`\n` +
        `> 🏷️ **ชื่อเซิร์ฟเวอร์:** **${targetGuildName}**\n` +
        `> 💎 **สถานะแผน:** ${planDisplay}\n` +
        `> 📅 **วันหมดอายุ:** ${expiryDisplay}\n` +
        `> 🎮 **ห้องมินิเกมที่เปิดอยู่:** **${boundChannels.length}** ห้อง\n\n` +
        `**รายการช่องมินิเกม:**\n${channelsReport}\n\n` +
        `-# ข้อมูลอัปเดตล่าสุดจาก Akari Database 🏮`;

      return interaction.editReply({
        flags: FLAG_V2,
        components: [
          {
            type: 17,
            components: [
              {
                type: 9,
                components: [{ type: 10, content: checkText }],
                accessory: DEFAULT_ACCESSORY,
              },
            ],
          },
        ],
      });
    } catch (err) {
      console.error("[AkariAdmin] check-tenant error:", err.message);
      return interaction.editReply({
        content: `❌ เกิดข้อผิดพลาดในการตรวจสอบข้อมูลเซิร์ฟเวอร์: ${err.message}`,
      });
    }
  }
}

/**
 * จัดการคำสั่ง /reveal-answer หรือ /ans (คำสั่งชั่วคราวสำหรับดูเฉลยของมินิเกมที่กำลังเปิดเล่นอยู่ในห้อง)
 */
async function handleRevealAnswer(interaction, supabase) {
  const { guildId, channelId, member } = interaction;

  if (!guildId || !channelId) {
    return interaction.reply({
      content: "❌ คำสั่งนี้สามารถใช้ได้เฉพาะในห้องข้อความของเซิร์ฟเวอร์เท่านั้น",
      flags: MessageFlags.Ephemeral,
    });
  }

  if (guildId !== KUMA_REVEAL_ALLOWED_GUILD_ID) {
    return interaction.reply({
      content: "❌ คำสั่งนี้เปิดให้ใช้งานเฉพาะในเซิร์ฟเวอร์ที่กำหนดเท่านั้นครับ",
      flags: MessageFlags.Ephemeral,
    });
  }

  const isDev = isKumaAdmin(interaction.user.id, interaction.client);
  const isChannelAdmin = member?.permissions?.has?.(PermissionFlagsBits.ManageChannels) || member?.permissions?.has?.(PermissionFlagsBits.Administrator);
  if (!isDev && !isChannelAdmin) {
    return interaction.reply({
      content: "❌ คำสั่งดูเฉลยสงวนสิทธิ์เฉพาะผู้ดูแลระบบ (Administrator / Manage Channels) เท่านั้นครับ",
      flags: MessageFlags.Ephemeral,
    });
  }

  let session = getActiveTenantSession(guildId, channelId);

  // Fallback: ดึงจาก Supabase DB หากเพิ่งรีสตาร์ตหรือไม่ได้อยู่ใน RAM
  if (!session && supabase) {
    try {
      const { data } = await supabase
        .from("tenant_minigame_active_sessions")
        .select("session_data")
        .eq("guild_id", guildId)
        .eq("channel_id", channelId)
        .maybeSingle();

      if (data && data.session_data) {
        session = data.session_data;
      }
    } catch (_) { }
  }

  if (!session) {
    return interaction.reply({
      flags: FLAG_V2 | MessageFlags.Ephemeral,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content:
                "## <:lowwarning:1548772721679278180>︲__` 𝖶𝖺𝗋𝗇𝗂𝗇𝗀 ₊ ไม่พบมินิเกมที่กำลังเล่น 𓂃 `__\n" +
                `> ห้องนี้ (<#${channelId}>) ยังไม่มีมินิเกมที่เปิดเล่นอยู่ในขณะนี้ครับ\n` +
                "> 💡 คุณสามารถเปิดมินิเกมได้ด้วยคำสั่ง `/set-game` หรือ `/setup-games`",
            },
          ],
        },
      ],
    });
  }

  const gameId = session.gameId;
  const gameName = AKARI_GAME_NAMES[gameId] || `เกมที่ ${gameId}`;
  const displayAnswer = session.displayAnswer || session.answer || "-";
  const questionText = session.questionData?.wordOrQuestion || "-";
  const category = session.questionData?.category || session.questionObj?.category || "ทั่วไป";

  let extraLines = "";
  if (gameId === 1 || gameId === 2) {
    extraLines = `\n> 🔤 **โจทย์ที่กำลังแสดง (Mask):** \`${questionText}\``;
  } else if (gameId === 4) {
    const hints = session.questionData?.hints || session.questionObj?.hints;
    if (hints && Array.isArray(hints)) {
      extraLines = `\n> 💡 **คำใบ้:**\n> 1. ${hints[0] || '-'}\n> 2. ${hints[1] || '-'}\n> 3. ${hints[2] || '-'}`;
    }
  } else if (gameId === 8 || gameId === 9 || gameId === 10 || gameId === 15 || gameId === 16) {
    const options = session.questionData?.options || session.questionObj?.options;
    if (options && Array.isArray(options)) {
      extraLines = `\n> 🔘 **ตัวเลือก:** ${options.join(', ')}`;
    }
  } else if (gameId === 12) {
    extraLines = `\n> ⚖️ **โจทย์:** ${questionText}\n> 🎯 **เฉลย:** ${displayAnswer === 'จริง' || displayAnswer === 'true' ? '✅ จริง (True)' : '❌ เท็จ (False)'}`;
  } else if (gameId === 13) {
    const template = session.questionData?.englishTemplate || session.questionObj?.englishTemplate || '-';
    extraLines = `\n> 🧩 **โจทย์ภาษาไทย:** ${questionText}\n> 📝 **ประโยคที่ถูกต้อง:** \`${template}\``;
  }

  return interaction.reply({
    flags: FLAG_V2 | MessageFlags.Ephemeral,
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content:
              `## 🔍︲__\` 𝖲𝗉𝗈𝗂𝗅𝖾𝗋 ₊ เฉลยมินิเกมประจำห้อง 𓂃 \`__\n` +
              `> 🎮 **มินิเกม:** **${gameName}**\n` +
              `> 🏷️ **หมวดหมู่:** \`${category}\`\n` +
              `> 🎯 **คำตอบที่ถูกต้อง (เฉลย):**\n` +
              `\`\`\`text\n${displayAnswer}\n\`\`\`${extraLines}\n` +
              `> 🤫 *ข้อความนี้แสดงเฉพาะคุณ (Ephemeral) ไม่รบกวนหรือสปอยล์ผู้เล่นคนอื่นในห้องครับ*`,
          },
        ],
      },
    ],
  });
}

module.exports = {
  registerAkariCommands,
  handleSetupGames,
  handleSetupGamesButton,
  handleSetupGamesSelect,
  buildSetupGamesWarningPayload,
  buildSetupGamesMainPayload,
  buildPostSetupPayload,
  DEFAULT_GAMES_CATEGORY_NAME,
  handleSettingGames,
  handleSettingPageSwitch,
  handleSettingPromoButton,
  handleSettingToggle,
  handleSettingReset,
  handleSettingPointsSelect,
  handleSettingPointsModalSubmit,
  handleSettingBindChannel,
  buildBindChannelPayload,
  buildSettingGamesPayload,
  buildPremiumUpsellPayload,
  handleClearCategory,
  handleSetGame,
  handleRemoveGame,
  handleRemoveGameAutocomplete,
  handleKumaAdmin,
  handleAkariAdmin: handleKumaAdmin,
  isKumaAdmin,
  isAkariAdmin,
  handleRevealAnswer,
  handleSettingStore,
  handleOpenStore,
  handleStoreButtonInteraction,
  handleStoreModalSubmit,
  handleStoreSelectMenus,
  handleSettingCurrencyButton,
  handleSettingCurrencyModalSubmit,
  handleSettingCooldownButton,
  handleSettingCooldownModalSubmit,
  getTenantPenaltyConfig,
  formatCooldownDisplay,
  parseCooldownMs,
  handlePointsCommand,
  handleLeaderboardCommand,
  handlePointsButtonInteraction,
  handleHelpCommand,
  handlePreviewCommand,
  handlePreviewButtonInteraction,
  HELP_SLASH_COMMANDS,
  PREVIEW_SLASH_COMMANDS,
  POINTS_SLASH_COMMANDS,
  STORE_SLASH_COMMANDS,
  AKARI_GAME_NAMES,
  KUMA_GAME_NAMES: AKARI_GAME_NAMES,
  GAME_DESCRIPTIONS,
  AKARI_SLASH_COMMANDS,
  KUMA_SLASH_COMMANDS: AKARI_SLASH_COMMANDS,
  KUMA_REVEAL_ALLOWED_GUILD_ID,
  KUMA_STORE_ALLOWED_GUILD_ID,
  KUMA_STORE_SLASH_COMMANDS,
  FREE_GAME_IDS,
  PREMIUM_GAME_IDS,
  ALL_DISPLAYABLE_IDS,
};
