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
const {
  STORE_SLASH_COMMANDS,
  handleSettingStore,
  handleOpenStore,
  handleStoreButtonInteraction,
  handleStoreModalSubmit,
  handleStoreSelectMenus,
} = require("./storeCommands");

const FLAG_V2 = MessageFlags.IsComponentsV2 || 32768;

const DEFAULT_ACCESSORY = {
  type: 2,
  style: 5,
  label: "Bear Cafe",
  emoji: {
    id: "1548976664090779650",
    name: "strawberryv2",
    animated: false,
  },
  url: "https://discord.com",
};

const SUPPORT_ACCESSORY = {
  type: 2,
  style: 5,
  label: "︲ติดต่อผู้พัฒนา",
  emoji: {
    id: "1372837492205555812",
    name: "3602exclamationmarkbubble",
    animated: true,
  },
  url: "https://discord.gg/NBrQBtGRMD",
};

function buildNoPermissionPayload(customText = "คุณต้องมีสิทธิ์ **ผู้ดูแลระบบ (Administrator)** เพื่อใช้คำสั่งนี้นะคะ!") {
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

const AKARI_GAME_NAMES = {
  1: "🎮︲เติมคำศัพท์-ไทย",
  2: "🎮︲เติมคำศัพท์-อังกฤษ",
  3: "🎲︲สุ่มโจทย์คณิต",
  4: "💡︲ทายคำจากคำใบ้",
  5: "🔊︲ฟังเสียงตอบ-อังกฤษ",
  6: "✏️︲พิมพ์ตามคำ-ไทย",
  7: "✏️︲พิมพ์ตามคำ-อังกฤษ",
  8: "🔤︲ทายคำแปล-อังกฤษ",
  9: "🔤︲ทายคำแปล-ไทย",
  10: "🔀︲เกมต่อคำ",
  11: "🔊︲ฟังเสียงตอบ-ไทย",
  12: "⚖️︲จริงหรือเท็จ",
  13: "🧩︲เรียงประโยค-อังกฤษ",
};

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
};

const AKARI_SLASH_COMMANDS = [
  {
    name: "setup-games",
    description: "ติดตั้งระบบมินิเกมอัตโนมัติ สร้างช่องและเริ่มสปอว์นโจทย์ข้อแรกทันที (เฉพาะผู้ดูแลระบบ)",
    default_member_permissions: PermissionFlagsBits.ManageChannels.toString(),
    options: [
      {
        name: "preset",
        description: "เลือกกลุ่มมินิเกมที่ต้องการเปิดใช้งาน",
        type: 3, // STRING
        required: true,
        choices: [
          { name: "🏆 ทุกมินิเกม (เปิดครบทั้ง 13 เกม)", value: "all" },
          { name: "🔥 มินิเกมยอดฮิต (Top 5 Games)", value: "popular" },
          { name: "🔤 เกมเน้นภาษาและความรู้ (Language & Quiz)", value: "language" },
        ],
      },
      {
        name: "category",
        description: "เลือก Category ที่ต้องการให้สร้างช่องมินิเกมไว้ข้างใน (หากไม่เลือกจะสร้างใหม่ให้อัตโนมัติ)",
        type: 7, // CHANNEL
        channel_types: [ChannelType.GuildCategory],
        required: false,
      },
    ],
  },
  {
    name: "setting-games",
    description: "เปิด/ปิด การใช้งานมินิเกมแต่ละเกมย่อยในเซิร์ฟเวอร์ (เฉพาะผู้ดูแลระบบ)",
    default_member_permissions: PermissionFlagsBits.ManageChannels.toString(),
  },
  {
    name: "setting-game",
    description: "เปิด/ปิด การใช้งานมินิเกมแต่ละเกมย่อยในเซิร์ฟเวอร์ (เฉพาะผู้ดูแลระบบ)",
    default_member_permissions: PermissionFlagsBits.ManageChannels.toString(),
  },
  {
    name: "clear",
    description: "ลบช่องทุกประเภทภายในหมวดหมู่ที่กำหนด (เฉพาะนักพัฒนาบอท Akari)",
    default_member_permissions: "0",
    options: [
      {
        name: "category",
        description: "เลือกหมวดหมู่ (Category) ที่ต้องการลบช่องข้างใน",
        type: 7, // CHANNEL
        channel_types: [ChannelType.GuildCategory],
        required: true,
      },
    ],
  },
  {
    name: "set-game",
    description: "ผูกมินิเกมที่ต้องการลงในห้องที่ระบุ และเริ่มเล่นทันที (เฉพาะผู้ดูแลระบบ)",
    default_member_permissions: PermissionFlagsBits.ManageChannels.toString(),
    options: [
      {
        name: "game",
        description: "เลือกมินิเกมที่ต้องการผูกลงห้องนี้",
        type: 4, // INTEGER
        required: true,
        choices: Object.entries(AKARI_GAME_NAMES).map(([id, name]) => ({
          name: name,
          value: parseInt(id, 10),
        })),
      },
      {
        name: "channel",
        description: "เลือกห้องข้อความที่ต้องการให้เล่นมินิเกมนี้",
        type: 7, // CHANNEL
        channel_types: [ChannelType.GuildText],
        required: true,
      },
    ],
  },
  {
    name: "remove-game",
    description: "ยกเลิกการผูกมินิเกมออกจากห้อง (เฉพาะผู้ดูแลระบบ)",
    default_member_permissions: PermissionFlagsBits.ManageChannels.toString(),
    options: [
      {
        name: "game",
        description: "เลือกมินิเกมที่ต้องการยกเลิกการผูกห้อง",
        type: 4, // INTEGER
        required: true,
        choices: Object.entries(AKARI_GAME_NAMES).map(([id, name]) => ({
          name: name,
          value: parseInt(id, 10),
        })),
      },
    ],
  },
  {
    name: "akari-admin",
    description: "ระบบจัดการสถานะสมาชิกและพรีเมียม (เฉพาะนักพัฒนาบอท Akari)",
    default_member_permissions: "0",
    options: [
      {
        name: "set-premium",
        description: "อัปเกรดสถานะ Premium ให้กับเซิร์ฟเวอร์",
        type: 1, // SUB_COMMAND
        options: [
          {
            name: "guild_id",
            description: "ไอดีเซิร์ฟเวอร์ (Guild ID)",
            type: 3, // STRING
            required: true,
          },
          {
            name: "days",
            description: "จำนวนวันที่ต้องการเปิดใช้งาน (เช่น 30, 90, 365)",
            type: 4, // INTEGER
            required: true,
          },
        ],
      },
      {
        name: "remove-premium",
        description: "ยกเลิกสถานะ Premium ของเซิร์ฟเวอร์ และปรับกลับเป็น Standard",
        type: 1, // SUB_COMMAND
        options: [
          {
            name: "guild_id",
            description: "ไอดีเซิร์ฟเวอร์ (Guild ID)",
            type: 3, // STRING
            required: true,
          },
        ],
      },
      {
        name: "check-tenant",
        description: "ตรวจสอบข้อมูลแผนสมาชิกและจำนวนห้องมินิเกมของเซิร์ฟเวอร์",
        type: 1, // SUB_COMMAND
        options: [
          {
            name: "guild_id",
            description: "ไอดีเซิร์ฟเวอร์ (Guild ID)",
            type: 3, // STRING
            required: true,
          },
        ],
      },
    ],
  },
  ...STORE_SLASH_COMMANDS,
];

/**
 * เปรียบเทียบชุดคำสั่งที่มีอยู่ใน Discord กับคำสั่งเป้าหมายว่าตรงกันหรือไม่
 */
function areCommandsEqual(existingCollection, targetCommands) {
  if (!existingCollection || existingCollection.size !== targetCommands.length) return false;
  for (const cmd of targetCommands) {
    const existingCmd = existingCollection.find((c) => c.name === cmd.name);
    if (!existingCmd) return false;
    const existingOpts = existingCmd.options || [];
    const targetOpts = cmd.options || [];
    if (existingOpts.length !== targetOpts.length) return false;
  }
  return true;
}

/**
 * ลงทะเบียน Global Slash Commands สำหรับ Akari Bot (ยิงครั้งเดียวครอบคลุมทุกเซิร์ฟเวอร์ทั่วโลก)
 * @param {import('discord.js').Client} client 
 */
async function registerAkariCommands(client) {
  client.once("clientReady", async () => {
    try {
      if (!client.application) return;

      // 1. ตรวจสอบว่า Global Slash Commands ของ Akari ตรงกับชุดปัจจุบันหรือไม่
      const existingGlobal = await client.application.commands.fetch().catch(() => null);
      if (existingGlobal && areCommandsEqual(existingGlobal, AKARI_SLASH_COMMANDS)) {
        console.log("⚡ [AkariCommands] Global Slash Commands เป็นปัจจุบันแล้ว (ข้ามการ sync ซ้ำ)");
        return;
      }

      await client.application.commands.set(AKARI_SLASH_COMMANDS);
      console.log(`🏮 [AkariCommands] ลงทะเบียน Global Slash Commands (${AKARI_SLASH_COMMANDS.length} คำสั่ง) สำเร็จแล้ว!`);
    } catch (e) {
      console.error("❌ [AkariCommands] Register Global Slash Commands Error:", e.message);
    }
  });
}

/**
 * จัดการคำสั่ง /setup-games (Component V2 - ตกแต่งสไตล์ EMOJIS.md)
 */
async function handleSetupGames(interaction, supabase, client) {
  const { member, guild, options } = interaction;

  if (!member.permissions.has(PermissionFlagsBits.ManageChannels) && !member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply(buildNoPermissionPayload());
  }

  await interaction.deferReply();

  const preset = options.getString("preset");
  const targetCategoryOption = options.getChannel("category");

  let targetCategory = targetCategoryOption;

  if (!targetCategory) {
    try {
      targetCategory = await guild.channels.create({
        name: "🎮 𝖠𝖪𝖠𝖱𝖨 𝖬𝖨𝖭𝖨𝖦𝖠𝖬𝖤𝖲",
        type: ChannelType.GuildCategory,
        reason: "Akari Bot Auto Setup Games Category",
      });
    } catch (e) {
      return interaction.editReply({
        flags: FLAG_V2,
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content:
                  "## <:lowwarning:1548772721679278180>︲__` 𝖶𝖺𝗋𝗇𝗂𝗇𝗀 ₊ ไม่สามารถสร้างหมวดหมู่/ช่องมินิเกม 𓂃 `__\n" +
                  "> บอทไม่มีสิทธิ์ **จัดการช่อง (Manage Channels)** หรือตำแหน่งบทบาทของบอทอยู่ต่ำเกินไปค่ะ",
              },
            ],
          },
        ],
      });
    }
  }

  let selectedGameIds = [];
  if (preset === "all") {
    selectedGameIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
  } else if (preset === "popular") {
    selectedGameIds = [1, 2, 3, 4, 10];
  } else if (preset === "language") {
    selectedGameIds = [1, 2, 5, 8, 9, 11, 13];
  }

  const planInfo = await getTenantPlan(guild.id, supabase);
  let quotaNotice = "";
  if (!planInfo.isPremium) {
    selectedGameIds = selectedGameIds
      .filter((gid) => LIGHTWEIGHT_GAMES.includes(gid))
      .slice(0, FREE_QUOTA_LIMIT);

    quotaNotice = `\n> ⚠️ **หมายเหตุ (แผนฟรี):** เปิดเล่นพร้อมกันได้สูงสุด **${FREE_QUOTA_LIMIT} เกม** (เฉพาะมินิเกมทั่วไปแบบพิมพ์ตอบหรือกดช้อยส์)\n> หากต้องการปลดล็อกครบทั้ง 13 เกม รวมถึงเกมรูปภาพและเกมฟังเสียง กรุณาอัปเกรดเป็น **Premium** ✨\n`;
  }

  const createdChannelsInfo = [];

  for (const gameId of selectedGameIds) {
    const channelName = AKARI_GAME_NAMES[gameId] || `🎮︲มินิเกม-${gameId}`;
    const topic = GAME_DESCRIPTIONS[gameId] || "มินิเกม Akari Bot";

    try {
      const newChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: targetCategory.id,
        topic: `🎮 ${topic} | ขับเคลื่อนโดย Akari Bot 🏮`,
        reason: `Akari Setup Minigame #${gameId}`,
      });

      if (supabase) {
        await supabase.from("tenant_minigame_channels").upsert(
          {
            guild_id: guild.id,
            game_id: gameId,
            channel_id: newChannel.id,
            created_at: new Date().toISOString(),
          },
          { onConflict: "guild_id,game_id" }
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
      }

      await spawnQuestion(client, newChannel, gameId, guild.id, supabase);
      createdChannelsInfo.push(`- **${channelName}** — <#${newChannel.id}>`);
    } catch (e) {
      console.error(`❌ [SetupGames] Error creating channel for game #${gameId}:`, e.message);
    }
  }

  const quotaNoticeText = quotaNotice
    ? `> <:lowwarning:1548772721679278180>⠀**หมายเหตุสำหรับแผนฟรี:** เปิดเล่นพร้อมกันได้สูงสุด **${FREE_QUOTA_LIMIT} เกม** เฉพาะเกมทั่วไปที่เล่นด้วยการพิมพ์ตอบหรือกดตัวเลือก หากต้องการเปิดใช้งานครบทั้ง **13 เกม** รวมเกมรูปภาพและเกมฟังเสียง กรุณาอัปเกรดเป็น **Premium**`
    : "";

  const contentText =
    `## <:50121checkmark:1358584609087946867>︲__\` 𝖨𝗇𝗌𝗍𝖺𝗅𝗅𝖺𝗍𝗂𝗈𝗇 𝖼𝗈𝗆𝗉𝗅𝖾𝗍𝖾 ₊ ติดตั้งระบบมินิเกมเรียบร้อยแล้ว 𓂃 \`__\n` +
    `-# ติดตั้งเกมที่หมวดหมู่: **${targetCategory.name}**\n` +
    `-# สร้างและเปิดใช้งานแล้ว: **${createdChannelsInfo.length} ช่องมินิเกม**\n\n` +
    `${createdChannelsInfo.join("\n")}` +
    `${quotaNoticeText ? `\n\n${quotaNoticeText}` : ""}`;

  const payload = {
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
  };

  return interaction.editReply(payload);
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
 * สร้าง Payload แดชบอร์ดสำหรับ /setting-games
 */
async function buildSettingGamesPayload(guild, supabase) {
  let settingsMap = {};
  let channelsMap = {}; // gameId -> channelId

  if (supabase) {
    const { data: settingsData } = await supabase
      .from("tenant_minigame_settings")
      .select("game_id, enabled")
      .eq("guild_id", guild.id);

    if (settingsData) {
      settingsData.forEach((row) => {
        settingsMap[row.game_id] = row.enabled;
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
  await guild.channels.fetch().catch(() => {});

  const planInfo = await getTenantPlan(guild.id, supabase);
  const isPremium = planInfo.isPremium;

  let activeCount = 0;
  let missingCount = 0;

  // คำนวณสถานะ 3 แบบ: 🟢 พร้อมเล่น | 🔴 ปิดอยู่ | ⚠️ ห้องหาย
  const gameStatuses = {};
  for (const idStr of Object.keys(AKARI_GAME_NAMES)) {
    const gId = parseInt(idStr, 10);
    const boundChannelId = channelsMap[gId];
    const isEnabled = settingsMap[gId] !== false;
    const channelObj = boundChannelId ? guild.channels.cache.get(boundChannelId) : null;

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

  const selectOptions = Object.keys(AKARI_GAME_NAMES).map((idStr) => {
    const gId = parseInt(idStr, 10);
    const gameInfo = gameStatuses[gId];
    const isHeavy = HEAVYWEIGHT_GAMES.includes(gId);

    let emoji = { id: "1548760143192260689", name: "conektionbad", animated: false };
    let desc = gameInfo.boundChannelId ? "สถานะ: ปิดอยู่ (กดเพื่อเปิด)" : "ยังไม่ได้ผูกห้อง (กดเพื่อดูวิธีผูกด้วย /set-game)";
    let label = AKARI_GAME_NAMES[gId];

    if (gameInfo.status === "missing") {
      emoji = { id: "1548760281675599964", name: "conektionokay", animated: false };
      desc = "ห้องหาย/ถูกลบ (กดเพื่อเคลียร์และคืนโควตา)";
    } else if (!isPremium && isHeavy) {
      emoji = { id: "1521245223311769673", name: "618492diamond", animated: false };
      desc = GAME_DESCRIPTIONS[gId];
      label = `${AKARI_GAME_NAMES[gId]} [พรีเมี่ยม]`;
    } else if (gameInfo.status === "active") {
      emoji = { id: "1548760301762121801", name: "goodconektion", animated: false };
      desc = `พร้อมเล่นที่ #${gameInfo.channelObj.name} (กดเพื่อปิด)`;
    }

    return {
      label: label.length > 100 ? label.slice(0, 97) + "..." : label,
      description: desc.length > 100 ? desc.slice(0, 97) + "..." : desc,
      value: `toggle_${gId}`,
      emoji,
    };
  });

  const activeGameIds = Object.keys(AKARI_GAME_NAMES).filter(
    (idStr) => gameStatuses[parseInt(idStr, 10)]?.status === "active"
  );

  const resetOptions = [
    {
      label: "︲สปอว์นโจทย์ใหม่ทุกเกมที่เปิดอยู่ (Reset All Games)",
      description: "รีเซ็ตและส่งการ์ดโจทย์ใหม่ลงทุกช่องมินิเกมของเซิร์ฟเวอร์",
      value: "reset_all",
      emoji: { name: "🔄" },
    },
    ...activeGameIds.map((idStr) => {
      const gId = parseInt(idStr, 10);
      return {
        label: `︲รีเซ็ตโจทย์ใหม่: ${AKARI_GAME_NAMES[gId]}`,
        description: `ส่งการ์ดโจทย์ข้อใหม่ลงในช่องมินิเกม #${gId}`,
        value: `reset_${gId}`,
        emoji: { name: "🔄" },
      };
    }),
  ];

  const storeConfig = await getTenantStoreConfig(supabase, guild.id);
  const currencyEmoji = storeConfig?.currency_emoji || "<:strawberryv2:1548976664090779650>";

  const planText = isPremium ? "👑⠀**แผนสมาชิก:** Premium (พรีเมียม)" : "📦⠀**แผนสมาชิก:** Standard (ฟรี)";
  const quotaText = isPremium ? `🎮⠀**โควตาที่ใช้:** **ไม่จำกัด** (${activeCount} เกม)` : `🎮⠀**โควตาที่ใช้:** **${activeCount}/${FREE_QUOTA_LIMIT}** เกม`;

  const contentText =
    `## <:bee20000:1256669436350562355>︲__\` 𝖲𝖾𝗍𝗍𝗂𝗇𝗀𝗌 ₊ จัดการมินิเกม 𓂃 \`__\n` +
    `> ${planText}\n` +
    `> ${quotaText}\n` +
    `## 📊︲สถานะห้อง\n` +
    `- <:goodconektion:1548760301762121801> พร้อมเล่น **${activeCount}** เกม\n` +
    `- <:conektionokay:1548760281675599964> ห้องหาย **${missingCount}** เกม\n` +
    `- <:conektionbad:1548760143192260689> ปิดอยู่ **${13 - activeCount - missingCount}** เกม`;

  const guildIconUrl = guild.iconURL({ size: 256 }) || "https://cdn.discordapp.com/embed/avatars/0.png";

  return {
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 9,
            components: [{ type: 10, content: contentText }],
            accessory: {
              type: 11,
              media: {
                url: guildIconUrl,
              },
            },
          },
          { type: 14, spacing: 2 },
          {
            type: 1,
            components: [
              {
                type: 3,
                custom_id: "akari_setting_toggle_menu",
                placeholder: "🎮︲เลือกมินิเกมเพื่อสลับสถานะ หรือเคลียร์ห้องหาย",
                options: selectOptions,
              },
            ],
          },
          { type: 14, spacing: 1, divider: false },
          {
            type: 1,
            components: [
              {
                type: 3,
                custom_id: "akari_setting_reset_menu",
                placeholder: "🔄︲เลือกมินิเกมเพื่อสั่ง สปอว์น/ส่งโจทย์ใหม่ ทันที",
                options: resetOptions,
              },
            ],
          },
          { type: 14, spacing: 1, divider: false },
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 2, // Secondary
                label: "︲ตั้งค่าสกุลเงินแต้ม",
                custom_id: "akari_setting_currency_btn",
                emoji: parseEmojiObject(currencyEmoji),
              },
            ],
          },
        ],
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

  await interaction.deferReply();
  const payload = await buildSettingGamesPayload(guild, supabase);
  return interaction.editReply(payload);
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
                `> กรุณาระบุ **อิโมจิทั่วไป** (เช่น 🍓, 🪙, 💎) หรือ **Discord Custom Emoji** (เช่น \`<:strawberryv2:1548976664090779650>\`) นะคะ!\n\n` +
                `-# 💡 *คำแนะนำ: หากใช้อิโมจิของเซิร์ฟเวอร์ ให้พิมพ์ \\:ชื่ออิโมจิ: ในช่องแชทเพื่อคัดลอกรหัสแบบเต็มได้ค่ะ* <:cuteplant:1152834055528783872>`,
            },
          ],
        },
      ],
    });
  }

  // 1. รับทราบ interaction ทันทีเพื่อป้องกัน Timeout 3 วินาทีของ Discord
  await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

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
                `> สกุลเงินแต้มของเซิร์ฟเวอร์ถูกเปลี่ยนเป็น **${input}** เรียบร้อยแล้วค่ะ! ✨\n\n` +
                `-# หน้าต่างการตั้งค่าได้รับการอัปเดตเรียบร้อยแล้วค่ะ <:cuteplant:1152834055528783872>`,
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
          await originalMsg.edit(updatedPayload).catch(() => {});
        }
      } catch (err) {}
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
              `> สกุลเงินแต้มของเซิร์ฟเวอร์ถูกเปลี่ยนเป็น **${input}** เรียบร้อยแล้วค่ะ! ✨\n\n` +
              `-# หน้าต่างการตั้งค่าได้รับการอัปเดตเรียบร้อยแล้วค่ะ <:cuteplant:1152834055528783872>`,
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
  if (!interaction.isStringSelectMenu() || interaction.customId !== "akari_setting_toggle_menu") return;

  const selectedValue = interaction.values[0];
  if (!selectedValue.startsWith("toggle_")) return;

  const gameId = parseInt(selectedValue.replace("toggle_", ""));
  const guildId = interaction.guild.id;
  const gameName = AKARI_GAME_NAMES[gameId] || `มินิเกม #${gameId}`;

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

  const channelObj = boundChannelId ? interaction.guild.channels.cache.get(boundChannelId) : null;
  const isMissing = Boolean(boundChannelId && !channelObj);

  // กรณี 1: ⚠️ ห้องหาย -> เคลียร์ช่องเก่าที่หายทิ้งทันที + ปิดเกม + คืนโควตาฟรี
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

    const clearedText =
      `## <:50121checkmark:1358584609087946867>︲__\` 𝖲𝖾𝗍𝗍𝗂𝗇𝗀 𝗋𝖾𝗌𝖾𝗍 ₊ รีเซ็ตการตั้งค่า 𓂃 \`__\n` +
      `# 🧹 ตรวจพบห้องเดิมถูกลบ — เคลียร์ข้อมูลเกม **${gameName}** เรียบร้อยแล้ว!\n` +
      `> ♻️⠀**คืนโควตามินิเกมฟรีให้เซิร์ฟเวอร์ทันที** (ปรับสถานะเป็น <:conektionbad:1548760143192260689> ปิดอยู่)\n` +
      `> 📌⠀**ไอดีห้องเดิมที่หาย:** \`${boundChannelId}\`\n\n` +
      `-# <<< หากต้องการนำกลับมาเปิดเล่นใหม่ สามารถใช้คำสั่ง \`/set-game\` เพื่อผูกห้องใหม่ได้ทุกเมื่อค่ะ >>>`;

    return interaction.reply({
      flags: FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: clearedText,
            },
          ],
        },
      ],
    });
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

    const nextEnabled = !currentEnabled;

    // กรณี 2: พยายามเปิดใช้งาน แต่ยังไม่ได้ผูกห้องใดๆ
    if (!boundChannelId && nextEnabled) {
      const noChannelText =
        `## <:lowwarning:1548772721679278180>︲__\` 𝖶𝖺𝗋𝗇𝗂𝗇𝗀 ₊ ยังไม่ได้ผูกห้องมินิเกม 𓂃 \`__\n` +
        `# มินิเกม **${gameName}** ยังไม่มีห้องสำหรับเล่นในเซิร์ฟเวอร์\n` +
        `> 💡⠀**วิธีเปิดใช้งาน:** กรุณาใช้คำสั่ง \`/set-game game:${gameName} channel:<เลือกห้อง>\` หรือคำสั่ง \`/setup-games\` เพื่อสร้างห้องและเริ่มเล่นทันทีค่ะ\n\n` +
        `-# <<< สามารถใช้คำสั่ง \`/set-game\` เพื่อผูกห้องใหม่ได้ทุกเมื่อค่ะ >>>`;

      return interaction.reply({
        flags: FLAG_V2,
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content: noChannelText,
              },
            ],
          },
        ],
      });
    }

    // กรณี 3: พยายามเปิดใช้งาน ให้ตรวจสอบโควตาและสถานะพรีเมียม
    if (nextEnabled) {
      let enabledCount = 0;
      const { data: allSettings } = await supabase
        .from("tenant_minigame_settings")
        .select("game_id, enabled")
        .eq("guild_id", guildId);

      if (allSettings && Array.isArray(allSettings)) {
        enabledCount = allSettings.filter((s) => s.enabled === true && s.game_id !== gameId).length;
      }

      const access = await validateGameAccess(guildId, gameId, supabase, enabledCount);
      if (!access.allowed) {
        const lockedText =
          `## <:lowwarning:1548772721679278180>︲__\` 𝖶𝖺𝗋𝗇𝗂𝗇𝗀 ₊ ไม่สามารถเปิดใช้งานเกมนี้ได้ 𓂃 \`__\n` +
          `# ${access.message || 'มินิเกมนี้เป็นเกมพิเศษ (มีรูปภาพการ์ด/ไฟล์เสียง) สำหรับสมาชิก Premium เท่านั้น'}\n` +
          `-# <<< หากต้องการปลดล็อกทุกมินิเกมไม่จำกัด กรุณาติดต่อผู้พัฒนาเพื่ออัปเกรดเป็น Premium ค่ะ >>>`;

        return interaction.reply({
          flags: FLAG_V2,
          components: [
            {
              type: 17,
              components: [
                {
                  type: 10,
                  content: lockedText,
                },
              ],
            },
          ],
        });
      }
    }

    await supabase.from("tenant_minigame_settings").upsert(
      {
        guild_id: guildId,
        game_id: gameId,
        enabled: nextEnabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "guild_id,game_id" }
    );

    invalidateSettingsCache(guildId);

    const statusStr = nextEnabled ? "🟢 เปิดใช้งาน (Enabled)" : "🔴 ปิดใช้งาน (Disabled)";

    const contentText =
      `### <:50121checkmark:1358584609087946867>︲__\` 𝖲𝖤𝖳𝖳𝖨𝖭𝖦 𝖴𝖯𝖣𝖠𝖳𝖤𝖣 𓂃 \`__\n` +
      `# สลับสถานะมินิเกม **${gameName}** ➔ **${statusStr}** เรียบร้อยแล้ว!\n` +
      `-# อัปเดตการตั้งค่าใน Database และล้าง In-Memory Cache เรียบร้อยแล้ว <:cuteplant:1152834055528783872>`;

    return interaction.reply({
      flags: FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 9,
              components: [{ type: 10, content: contentText }],
              accessory: DEFAULT_ACCESSORY,
            }
          ]
        }
      ]
    });
  } else {
    const contentText =
      `### <:68440x:1358584606911369226>︲__\` RAM FALLBACK MODE 𓂃 \`__\n` +
      `# ทำงานในโหมด RAM Fallback ไม่สามารถบันทึกตั้งค่าลง Database ได้`;

    return interaction.reply({
      flags: FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 9,
              components: [{ type: 10, content: contentText }],
              accessory: DEFAULT_ACCESSORY,
            }
          ]
        }
      ]
    });
  }
}

/**
 * จัดการคำสั่ง /clear (เฉพาะนักพัฒนาบอท Akari / Developer เท่านั้น)
 */
async function handleClearCategory(interaction, supabase) {
  const { guild, member, options } = interaction;

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
                "> คำสั่งนี้สงวนสิทธิ์เฉพาะ **นักพัฒนาหลัก (Developer)** ของ Akari Bot เท่านั้นค่ะ!",
            },
          ],
        },
      ],
    });
  }

  await interaction.deferReply();

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
  if (!interaction.isStringSelectMenu() || interaction.customId !== "akari_setting_reset_menu") return;

  const selectedValue = interaction.values[0];
  if (!selectedValue.startsWith("reset_")) return;

  const guild = interaction.guild;
  const guildId = guild.id;

  await interaction.deferReply();

  if (selectedValue === "reset_all") {
    let resetCount = 0;
    if (supabase) {
      const { data: channels } = await supabase
        .from("tenant_minigame_channels")
        .select("game_id, channel_id")
        .eq("guild_id", guildId);

      if (Array.isArray(channels)) {
        for (const row of channels) {
          const channel = await client.channels.fetch(row.channel_id).catch(() => null);
          if (channel) {
            await spawnQuestion(client, channel, row.game_id, guildId, supabase);
            resetCount++;
          }
        }
      }
    }

    const contentText =
      `## <:50121checkmark:1358584609087946867>︲__\` 𝖲𝖾𝗍𝗍𝗂𝗇𝗀 𝗋𝖾𝗌𝖾𝗍 ₊ รีเซ็ตโจทย์สำเร็จ 𓂃 \`__\n` +
      `# รีเซ็ตและส่งการ์ดโจทย์ใหม่ลงทุกช่องมินิเกมสำเร็จ! (**${resetCount}** ช่อง)\n` +
      `-# ผู้เล่นสามารถเริ่มเล่นและตอบคำถามข้อใหม่ในทุกช่องได้ทันที <:cuteplant:1152834055528783872>`;

    return interaction.editReply({
      flags: FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 9,
              components: [{ type: 10, content: contentText }],
              accessory: DEFAULT_ACCESSORY,
            }
          ]
        }
      ]
    });
  } else {
    const gameId = parseInt(selectedValue.replace("reset_", ""));
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
        const channel = await client.channels.fetch(row.channel_id).catch(() => null);
        if (channel) {
          await spawnQuestion(client, channel, gameId, guildId, supabase);
          success = true;
        }
      }
    }

    const contentText = success
      ? `## <:50121checkmark:1358584609087946867>︲__\` 𝖦𝖺𝗆𝖾 𝗋𝖾𝗌𝖾𝗍 ₊ รีเซ็ตโจทย์สำเร็จ 𓂃 \`__\n` +
      `# รีเซ็ตและส่งการ์ดโจทย์ใหม่สำหรับ **${gameName}** สำเร็จ!\n` +
      `-# ส่งข้อความโจทย์ข้อใหม่ลงในช่องมินิเกมเรียบร้อยแล้ว <:cuteplant:1152834055528783872>`
      : `## <:68440x:1358584606911369226>︲__\` 𝖶𝖺𝗋𝗇𝗂𝗇𝗀 ₊ ไม่พบช่องมินิเกม 𓂃 \`__\n` +
      `# ไม่พบช่องทางสำหรับ **${gameName}** ในเซิร์ฟเวอร์นี้ (กรุณารัน /setup-games ก่อน)`;

    return interaction.editReply({
      flags: FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 9,
              components: [{ type: 10, content: contentText }],
              accessory: DEFAULT_ACCESSORY,
            }
          ]
        }
      ]
    });
  }
}

/**
 * จัดการคำสั่ง /set-game (ผูกห้องเดี่ยวสำหรับมินิเกม)
 */
async function handleSetGame(interaction, supabase, client) {
  const { member, guild, options } = interaction;

  if (!member.permissions.has(PermissionFlagsBits.ManageChannels) && !member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply(buildNoPermissionPayload());
  }

  await interaction.deferReply();

  const gameId = options.getInteger("game");
  const targetChannel = options.getChannel("channel");
  const gameName = AKARI_GAME_NAMES[gameId] || `มินิเกม #${gameId}`;

  // ตรวจสอบสิทธิ์การใช้งานตามระดับสมาชิกก่อนผูกห้อง
  const access = await validateGameAccess(guild.id, gameId, supabase);
  if (!access.allowed) {
    const deniedText =
      `## <:lowwarning:1548772721679278180>︲__\` 𝖶𝖺𝗋𝗇𝗂𝗇𝗀 ₊ ไม่สามารถเปิดใช้งานเกมนี้ได้ 𓂃 \`__\n` +
      `# ${access.message || 'มินิเกมนี้เป็นเกมพิเศษ (มีรูปภาพการ์ด/ไฟล์เสียง) สำหรับสมาชิก Premium เท่านั้น'}\n` +
      `-# <<< หากต้องการปลดล็อกทุกมินิเกมไม่จำกัด กรุณาติดต่อผู้พัฒนาเพื่ออัปเกรดเป็น Premium ค่ะ >>>`;

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

      // บันทึกการผูกเกมใหม่เข้าห้อง
      await supabase.from("tenant_minigame_channels").upsert(
        {
          guild_id: guild.id,
          game_id: gameId,
          channel_id: targetChannel.id,
          created_at: new Date().toISOString(),
        },
        { onConflict: "guild_id,game_id" }
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

  await interaction.deferReply();

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

      if (data && data.channel_id) {
        boundChannelId = data.channel_id;
      }

      // ลบออกจาก tenant_minigame_channels
      await supabase
        .from("tenant_minigame_channels")
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
      `-# <<< หากต้องการนำกลับมาเปิดเล่นใหม่ สามารถใช้คำสั่ง \`/set-game\` หรือ \`/setup-games\` ได้ทุกเมื่อค่ะ >>>`;

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
 * ตรวจสอบสิทธิ์ผู้ดูแลระบบ/นักพัฒนาหลักของ Akari Bot
 */
function isAkariAdmin(userId, client) {
  if (!userId) return false;

  const adminIds = (process.env.AKARI_ADMIN_IDS || process.env.OWNER_ID || "")
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

/**
 * จัดการคำสั่ง /akari-admin (เฉพาะนักพัฒนาบอท Akari สำหรับจัดการสมาชิกและพรีเมียม)
 */
async function handleAkariAdmin(interaction, supabase, client) {
  const userId = interaction.user.id;

  if (!isAkariAdmin(userId, client)) {
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
                "> คุณไม่มีสิทธิ์ใช้งานคำสั่งนี้ คำสั่งนี้สงวนสิทธิ์เฉพาะนักพัฒนาและผู้ดูแลระบบหลักของ Akari Bot เท่านั้น",
            },
          ],
        },
      ],
    });
  }

  await interaction.deferReply();

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
        `-# แคชระบบได้รับการอัปเดตทันที สมาชิกในเซิร์ฟเวอร์ดังกล่าวสามารถเปิดมินิเกมได้ไม่จำกัดแล้วค่ะ <:cuteplant:1152834055528783872>`;

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
        `> ℹ️ **ข้อจำกัด:** จำกัดสูงสุด 3 มินิเกม (เฉพาะเกมทั่วไป)\n\n` +
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

module.exports = {
  registerAkariCommands,
  handleSetupGames,
  handleSettingGames,
  handleSettingToggle,
  handleSettingReset,
  handleClearCategory,
  handleSetGame,
  handleRemoveGame,
  handleAkariAdmin,
  isAkariAdmin,
  handleSettingStore,
  handleOpenStore,
  handleStoreButtonInteraction,
  handleStoreModalSubmit,
  handleStoreSelectMenus,
  handleSettingCurrencyButton,
  handleSettingCurrencyModalSubmit,
  STORE_SLASH_COMMANDS,
  AKARI_GAME_NAMES,
  GAME_DESCRIPTIONS,
  AKARI_SLASH_COMMANDS,
};
