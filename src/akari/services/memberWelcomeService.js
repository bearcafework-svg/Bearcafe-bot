// ===================================================
// src/akari/services/memberWelcomeService.js
// ระบบข้อความต้อนรับสมาชิกใหม่ (Multi-Tenant Welcome System)
// - ดีไซน์ Discord Component V2 (Flags 32768)
// - แดชบอร์ดตั้งค่า Live Preview ผ่าน /set welc
// - ตรวจสอบตัวแปร (Variable Validation Guard)
// - ส่งข้อความจริงอัตโนมัติเมื่อมีคนเข้าเซิร์ฟเวอร์ (guildMemberAdd)
// ===================================================

const {
  ChannelType,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ChannelSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require("discord.js");

const FLAG_V2 = MessageFlags.IsComponentsV2 || 32768;

// In-Memory Cache เพื่อลด Database Egress (guildId -> config)
const welcomeConfigCache = new Map();

// กิลด์ที่อนุญาตให้โหลดคำสั่ง /set welc ในช่วงทดสอบ
const WELCOME_ALLOWED_GUILD_ID = "1493110432347459627";

// นิยามตัวแปรที่ใช้ในระบบ
const TEXT_VARIABLES = [
  "{user}",
  "{user_name}",
  "{user_nick}",
  "{user_joindate}",
  "{user_createdate}",
  "{server_name}",
  "{server_membercount}",
  "{server_createdate}",
];

const MEDIA_VARIABLES = [
  "{user_avatar}",
  "{server_icon}",
  "{server_banner}",
];

const COLOR_VARIABLES = [
  "{random_color}",
];

/**
 * ดึงคอนฟิกของกิลด์ (จาก Cache หรือ Supabase)
 * @param {string} guildId
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} type "welcome" หรือ "goodbye"
 */
async function getWelcomeConfig(guildId, supabase, type = "welcome") {
  const cacheKey = `${guildId}:${type}`;
  if (welcomeConfigCache.has(cacheKey)) {
    return welcomeConfigCache.get(cacheKey);
  }

  const defaultMsg =
    type === "goodbye"
      ? "ลาก่อนนะ {user} ขอให้โชคดีกับการเดินทางครั้งใหม่ครับ! 👋\nขอบคุณที่เคยเป็นส่วนหนึ่งของ {server_name}"
      : "ยินดีต้อนรับ {user} สู่ {server_name}! 🎉\nขอให้มีช่วงเวลาที่ดีในเซิร์ฟเวอร์นี้นะครับ";

  const defaultConfig = {
    guild_id: guildId,
    type: type,
    channel_id: null,
    is_enabled: false,
    message_content: defaultMsg,
    thumbnail_url: "{user_avatar}",
    banner_url: null,
    accent_color: null,
  };

  if (!supabase) return defaultConfig;

  try {
    const { data, error } = await supabase
      .from("tenant_welcome_configs")
      .select("*")
      .eq("guild_id", guildId)
      .eq("type", type)
      .maybeSingle();

    if (!error && data) {
      welcomeConfigCache.set(cacheKey, data);
      return data;
    }
  } catch (err) {
    console.warn(`⚠️ [WelcomeService] ไม่สามารถดึงคอนฟิก ${type} จาก DB ได้:`, err.message);
  }

  welcomeConfigCache.set(cacheKey, defaultConfig);
  return defaultConfig;
}

/**
 * บันทึกคอนฟิกลง Supabase และ Cache
 * @param {string} guildId
 * @param {object} updates
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} type "welcome" หรือ "goodbye"
 */
async function saveWelcomeConfig(guildId, updates, supabase, type = "welcome") {
  const cacheKey = `${guildId}:${type}`;
  const current = await getWelcomeConfig(guildId, supabase, type);
  const newConfig = {
    ...current,
    ...updates,
    guild_id: guildId,
    type: type,
    updated_at: new Date().toISOString(),
  };

  welcomeConfigCache.set(cacheKey, newConfig);

  if (supabase) {
    try {
      await supabase
        .from("tenant_welcome_configs")
        .upsert(newConfig, { onConflict: "guild_id,type" });
    } catch (err) {
      console.error(`❌ [WelcomeService] บันทึก ${type} ลง Supabase ล้มเหลว:`, err.message);
      throw err;
    }
  }

  return newConfig;
}

/**
 * สุ่มรหัสสี Hex
 */
function getRandomHexColor() {
  const letters = "0123456789ABCDEF";
  let color = "#";
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
}

/**
 * แทนที่ตัวแปรข้อความและสื่อต่างๆ
 * @param {string} template
 * @param {import('discord.js').GuildMember} member
 * @param {import('discord.js').Guild} guild
 */
function resolveTextVariables(template, member, guild) {
  if (!template) return "";

  const userId = member?.id || "123456789012345678";
  const username = member?.user?.username || "BearUser";
  const userNick = member?.displayName || username;
  const joinTs = Math.floor((member?.joinedTimestamp || Date.now()) / 1000);
  const createTs = Math.floor((member?.user?.createdTimestamp || (Date.now() - 365 * 86400000)) / 1000);

  const serverName = guild?.name || "Bear Cafe Community";
  const memberCount = (guild?.memberCount || 23000).toLocaleString();
  const serverCreateTs = Math.floor((guild?.createdTimestamp || (Date.now() - 730 * 86400000)) / 1000);

  return template
    .replace(/\{user\}/g, `<@${userId}>`)
    .replace(/\{user_name\}/g, username)
    .replace(/\{user_nick\}/g, userNick)
    .replace(/\{user_joindate\}/g, `<t:${joinTs}:f> — <t:${joinTs}:R>`)
    .replace(/\{user_createdate\}/g, `<t:${createTs}:f> — <t:${createTs}:R>`)
    .replace(/\{server_name\}/g, serverName)
    .replace(/\{server_membercount\}/g, memberCount)
    .replace(/\{server_createdate\}/g, `<t:${serverCreateTs}:f> — <t:${serverCreateTs}:R>`);
}

/**
 * แทนที่ตัวแปร URL รูปภาพ
 * @param {string} rawUrl
 * @param {import('discord.js').GuildMember} member
 * @param {import('discord.js').Guild} guild
 */
function resolveMediaUrl(rawUrl, member, guild) {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  if (trimmed === "{user_avatar}") {
    return member?.user?.displayAvatarURL({ dynamic: true, size: 512 }) ||
      "https://cdn.discordapp.com/embed/avatars/0.png";
  }
  if (trimmed === "{server_icon}") {
    return guild?.iconURL({ dynamic: true, size: 512 }) ||
      "https://cdn.discordapp.com/embed/avatars/0.png";
  }
  if (trimmed === "{server_banner}") {
    return guild?.bannerURL({ size: 1024 }) || null;
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  return null;
}

/**
 * ตรวจสอบความถูกต้องและการเข้าถึงได้ของลิงก์รูปภาพ (HTTP Check)
 * @param {string} url
 * @param {string} fieldLabel
 * @returns {Promise<string|null>} ข้อความเตือนหากเข้าถึงไม่ได้ หรือ null หากผ่าน
 */
async function checkImageUrlAccessibility(url, fieldLabel) {
  try {
    const parsed = new URL(url);

    // 1. ตรวจสอบ Discord CDN Expiration Parameter ทันที (ตรวจจาก URL ไม่ต้องรอเน็ต)
    if (parsed.hostname.includes("discordapp.")) {
      const exHex = parsed.searchParams.get("ex");
      if (exHex) {
        const expiryMs = parseInt(exHex, 16) * 1000;
        if (!isNaN(expiryMs) && expiryMs <= Date.now()) {
          return `ลิงก์รูป **${fieldLabel}** หมดอายุแล้วครับ (Discord Attachment Expired)\n> ลิงก์ที่คัดลอกจากห้องแชต Discord มีอายุจำกัด กรุณาใช้เว็บฝากรูปถาวร (เช่น Imgur หรือเว็บโฮสต์รูป) แทนครับ`;
        }
      }
    }

    // 2. ตรวจสอบสถานะ Online และ Content-Type ผ่าน HTTP Request (Timeout 2.5 วินาที)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    let res;
    try {
      res = await fetch(url, {
        method: "HEAD",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "image/*,*/*;q=0.8",
        },
        signal: controller.signal,
      });

      // หากโดน 405 Method Not Allowed หรือ 403 Forbidden ใน HEAD ลองใช้ GET แบบขอเฉพาะไบต์แรก
      if (res.status === 405 || res.status === 403) {
        res = await fetch(url, {
          method: "GET",
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "image/*,*/*;q=0.8",
            "Range": "bytes=0-0",
          },
          signal: controller.signal,
        });
      }
    } finally {
      clearTimeout(timeoutId);
    }

    if (!res.ok) {
      if (res.status === 404) {
        return `ลิงก์รูป **${fieldLabel}** ไม่พบรูปภาพ (HTTP 404 Not Found) หรือลิงก์ภาพหมดอายุแล้ว กรุณาตรวจสอบ URL อีกครั้งครับ`;
      }
      if (res.status === 403 || res.status === 401) {
        return `ลิงก์รูป **${fieldLabel}** ติดสิทธิ์การเข้าถึง (HTTP ${res.status} Forbidden) ลิงก์ภาพอาจหมดอายุหรือไม่เปิดสาธารณะครับ`;
      }
      return `ไม่สามารถเข้าถึงรูปภาพของ **${fieldLabel}** ได้ (HTTP ${res.status}) กรุณาตรวจสอบลิงก์อีกครั้งครับ`;
    }

    const contentType = res.headers.get("content-type") || "";
    if (
      contentType &&
      !contentType.toLowerCase().startsWith("image/") &&
      !contentType.toLowerCase().includes("octet-stream")
    ) {
      return `ลิงก์ **${fieldLabel}** ไม่ใช่ไฟล์รูปภาพ (ตรวจพบ Content-Type: \`${contentType}\`) กรุณาใส่ลิงก์รูปภาพที่ถูกต้องครับ`;
    }

    return null;
  } catch (err) {
    if (err.name === "AbortError" || err.message?.includes("aborted")) {
      return `การตรวจสอบลิงก์รูป **${fieldLabel}** หมดเวลา (Timeout) ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์รูปภาพได้ กรุณาตรวจสอบ URL อีกครั้งครับ`;
    }
    return `ไม่สามารถเชื่อมต่อไปยังลิงก์รูป **${fieldLabel}** ได้ (${err.message}) กรุณาตรวจสอบ URL อีกครั้งครับ`;
  }
}

/**
 * ตรวจสอบความถูกต้องของตัวแปร (Validation Guard) และการเข้าถึงรูปภาพ
 * @param {object} inputs
 * @returns {Promise<string|null>} ข้อความแจ้งเตือน Error หรือ null หากผ่าน
 */
async function validateWelcomeInputs({ messageContent, thumbnailUrl, bannerUrl, accentColor, guild }) {
  // 1. ตรวจสอบข้อความ (Message Content)
  if (typeof messageContent === "string") {
    for (const v of MEDIA_VARIABLES) {
      if (messageContent.includes(v)) {
        return `ไม่สามารถนำตัวแปรภาพ \`${v}\` มาใส่ในช่องข้อความได้ครับ กรุณากรอกในส่วน "แก้ไขรูปภาพ" แทนครับ`;
      }
    }
    for (const v of COLOR_VARIABLES) {
      if (messageContent.includes(v)) {
        return `ไม่สามารถนำตัวแปรสี \`${v}\` มาใส่ในช่องข้อความได้ครับ กรุณากรอกในส่วน "แก้ไขรูปภาพ / สี" แทนครับ`;
      }
    }
  }

  // 2. ตรวจสอบรูป Thumbnail
  if (thumbnailUrl && typeof thumbnailUrl === "string") {
    const trimmed = thumbnailUrl.trim();
    if (trimmed) {
      for (const v of TEXT_VARIABLES) {
        if (trimmed.includes(v)) {
          return `ไม่สามารถนำตัวแปรข้อความ \`${v}\` มาใส่ในช่องรูป Thumbnail ได้ครับ`;
        }
      }
      for (const v of COLOR_VARIABLES) {
        if (trimmed.includes(v)) {
          return `ไม่สามารถนำตัวแปรสี \`${v}\` มาใส่ในช่องรูป Thumbnail ได้ครับ`;
        }
      }
      if (!MEDIA_VARIABLES.includes(trimmed) && !trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
        return `ลิงก์รูป Thumbnail ไม่ถูกต้อง ต้องขึ้นต้นด้วย \`http://\` หรือ \`https://\` หรือใช้ตัวแปรภาพ \`{user_avatar}\`, \`{server_icon}\`, \`{server_banner}\``;
      }
    }
  }

  // 3. ตรวจสอบรูป Banner
  if (bannerUrl && typeof bannerUrl === "string") {
    const trimmed = bannerUrl.trim();
    if (trimmed) {
      for (const v of TEXT_VARIABLES) {
        if (trimmed.includes(v)) {
          return `ไม่สามารถนำตัวแปรข้อความ \`${v}\` มาใส่ในช่องรูป Banner ได้ครับ`;
        }
      }
      for (const v of COLOR_VARIABLES) {
        if (trimmed.includes(v)) {
          return `ไม่สามารถนำตัวแปรสี \`${v}\` มาใส่ในช่องรูป Banner ได้ครับ`;
        }
      }
      if (!MEDIA_VARIABLES.includes(trimmed) && !trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
        return `ลิงก์รูป Banner ไม่ถูกต้อง ต้องขึ้นต้นด้วย \`http://\` หรือ \`https://\` หรือใช้ตัวแปรภาพ \`{server_banner}\`, \`{user_avatar}\`, \`{server_icon}\``;
      }
    }
  }

  // 4. ตรวจสอบรหัสสี (Accent Color)
  if (accentColor && typeof accentColor === "string") {
    const trimmed = accentColor.trim();
    if (trimmed) {
      for (const v of TEXT_VARIABLES) {
        if (trimmed.includes(v)) {
          return `ไม่สามารถนำตัวแปรข้อความ \`${v}\` มาใส่ในช่องสีได้ครับ`;
        }
      }
      for (const v of MEDIA_VARIABLES) {
        if (trimmed.includes(v)) {
          return `ไม่สามารถนำตัวแปรภาพ \`${v}\` มาใส่ในช่องสีได้ครับ`;
        }
      }
      if (trimmed !== "{random_color}" && !/^#?[0-9a-fA-F]{3,8}$/.test(trimmed)) {
        return `รหัสสีไม่ถูกต้อง กรุณากรอกในรูปแบบ Hex เช่น \`#FFB6C1\` หรือใช้ตัวแปร \`{random_color}\``;
      }
    }
  }

  // 5. ตรวจสอบว่าเซิร์ฟเวอร์มีแบนเนอร์จริงหรือไม่ เมื่อมีการใช้ตัวแปร {server_banner}
  if (guild) {
    const hasBanner = Boolean(guild.banner || (typeof guild.bannerURL === "function" && guild.bannerURL()));
    if (!hasBanner) {
      if (thumbnailUrl && thumbnailUrl.includes("{server_banner}")) {
        return `เซิร์ฟเวอร์นี้ยังไม่มีภาพแบนเนอร์ (Server Banner) เนื่องจากเซิร์ฟเวอร์ยังไม่มี Level Boost ที่ปลดล็อกแบนเนอร์ จึงไม่สามารถใช้ตัวแปร \`{server_banner}\` ในช่อง Thumbnail ได้ครับ`;
      }
      if (bannerUrl && bannerUrl.includes("{server_banner}")) {
        return `เซิร์ฟเวอร์นี้ยังไม่มีภาพแบนเนอร์ (Server Banner) เนื่องจากเซิร์ฟเวอร์ยังไม่มี Level Boost ที่ปลดล็อกแบนเนอร์ จึงไม่สามารถใช้ตัวแปร \`{server_banner}\` ในช่อง Image Banner ได้ครับ`;
      }
    }
  }

  // 6. ตรวจสอบความพร้อมใช้งานจริงของลิงก์รูปภาพ (HTTP Check & Expiration)
  const imageChecks = [];
  if (thumbnailUrl && typeof thumbnailUrl === "string") {
    const trimmed = thumbnailUrl.trim();
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      imageChecks.push(checkImageUrlAccessibility(trimmed, "Thumbnail"));
    }
  }
  if (bannerUrl && typeof bannerUrl === "string") {
    const trimmed = bannerUrl.trim();
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      imageChecks.push(checkImageUrlAccessibility(trimmed, "Image Banner"));
    }
  }

  if (imageChecks.length > 0) {
    const results = await Promise.all(imageChecks);
    for (const err of results) {
      if (err) return err;
    }
  }

  return null;
}

/**
 * สร้างการ์ดข้อผิดพลาด (Warning Component V2)
 * @param {string} reason
 */
function buildWarningPayload(reason) {
  return {
    flags: FLAG_V2 | MessageFlags.Ephemeral,
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content: "## <:warning_1:1562067612135981217>︲__` 𝖶𝖺𝗋𝗇𝗂𝗇𝗀 ₊ เกิดข้อผิดพลาด 𓂃 `__",
          },
          {
            type: 14,
            spacing: 2,
          },
          {
            type: 10,
            content: `> ${reason}`,
          },
        ],
      },
    ],
  };
}

/**
 * สร้างการ์ดแสดงตัวแปรทั้งหมด (Component V2 Ephemeral พร้อมระบบเปลี่ยนหน้า)
 * @param {number} page หน้าปัจจุบัน (1 หรือ 2)
 */
function buildVariablesHelpPayload(page = 1) {
  const isPage1 = page === 1;

  const page1Content =
    "### ข้อมูลสมาชิก:\n" +
    "`{user}` : แสดงแท็กสมาชิก Discord เพื่อให้สามารถกดเรียกหรือแจ้งเตือนสมาชิกได้\n" +
    "> ตัวอย่าง: สวัสดี {user} → สวัสดี <@1538896195253178409>\n\n" +
    "`{user_name}` : แสดงชื่อบัญชี Discord ของสมาชิก\n" +
    "> ตัวอย่าง: ชื่อบัญชี: {user_name} → ชื่อบัญชี: ExampleUser\n\n" +
    "`{user_nick}` : แสดงชื่อเล่นของสมาชิกในเซิร์ฟเวอร์\n" +
    "> ตัวอย่าง: ยินดีต้อนรับ {user_nick} → ยินดีต้อนรับ น้องหมี\n\n" +
    "`{user_joindate}` : แสดงวันที่สมาชิกเข้าร่วมเซิร์ฟเวอร์ พร้อมเวลาที่ผ่านไปนับจากวันที่เข้าร่วม\n" +
    "> ตัวอย่าง: {user_joindate} → <t:1792495800:f> — <t:1792495800:R>\n\n" +
    "`{user_createdate}` : แสดงวันที่สร้างบัญชี Discord ของสมาชิก พร้อมเวลาที่ผ่านไปนับจากวันที่สร้างบัญชี\n" +
    "> ตัวอย่าง: {user_createdate} → <t:1705314600:f> — <t:1705314600:R>\n\n" +
    "`{user_avatar}` : แสดงรูปโปรไฟล์ของสมาชิก ใช้ได้เฉพาะในช่องแก้ไขภาพเท่านั้น หากนำไปใส่ในช่องอื่น ระบบจะแจ้งเตือนว่าไม่สามารถใช้งานได้";

  const page2Content =
    "### ข้อมูลเซิร์ฟเวอร์:\n" +
    "`{server_name}` : แสดงชื่อเซิร์ฟเวอร์ Discord\n" +
    "> ตัวอย่าง: ยินดีต้อนรับสู่ {server_name} → ยินดีต้อนรับสู่ คาเฟ่หมี\n\n" +
    "`{server_membercount}` : แสดงจำนวนสมาชิกทั้งหมดในเซิร์ฟเวอร์ โดยจัดรูปแบบตัวเลขให้อ่านง่าย\n" +
    "> ตัวอย่าง: ตอนนี้มีสมาชิก {server_membercount} คน → ตอนนี้มีสมาชิก 23,000 คน\n\n" +
    "`{server_icon}` : แสดงรูปไอคอนของเซิร์ฟเวอร์ ใช้ได้เฉพาะในช่องแก้ไขภาพเท่านั้น หากนำไปใส่ในช่องอื่น ระบบจะแจ้งเตือนว่าไม่สามารถใช้งานได้\n\n" +
    "`{server_banner}` : แสดงภาพแบนเนอร์ของเซิร์ฟเวอร์ ใช้ได้เฉพาะในช่องแก้ไขภาพเท่านั้น หากนำไปใส่ในช่องอื่น ระบบจะแจ้งเตือนว่าไม่สามารถใช้งานได้\n\n" +
    "`{server_createdate}` : แสดงวันที่สร้างเซิร์ฟเวอร์ Discord\n" +
    "> ตัวอย่าง: เซิร์ฟเวอร์นี้สร้างเมื่อ {server_createdate} → เซิร์ฟเวอร์นี้สร้างเมื่อ 1 มิถุนายน 2023\n" +
    "### ตัวแปรสำหรับปรับแต่งสี:\n" +
    "`{random_color}` : สุ่มสีสำหรับตกแต่ง Embed ใช้ได้เฉพาะในช่องแก้ไขสีเท่านั้น หากนำไปใส่ในช่องอื่น ระบบจะแจ้งเตือนว่าไม่สามารถใช้งานได้";

  return {
    flags: FLAG_V2 | MessageFlags.Ephemeral,
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content:
              "## <:bee20000:1256669436350562355>︲__` ตัวแปรสำหรับปรับแต่งข้อความ `__\n-# คุณสามารถใช้ตัวแปรด้านล่างเพื่อแสดงข้อมูลสมาชิกและเซิร์ฟเวอร์โดยอัตโนมัติ ระบบจะแทนที่ตัวแปรด้วยข้อมูลจริงเมื่อนำข้อความไปแสดง <:cuteplant:1152834055528783872>",
          },
          {
            type: 14,
            spacing: 2,
          },
          {
            type: 10,
            content: isPage1 ? page1Content : page2Content,
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
                custom_id: "welc_vars_page:1",
                emoji: {
                  name: "⬅️",
                },
                disabled: isPage1,
              },
              {
                style: 2,
                type: 2,
                custom_id: "welc_vars_page:2",
                emoji: {
                  name: "➡️",
                },
                disabled: !isPage1,
              },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * ประกอบ Component V2 ของการ์ดข้อความต้อนรับ
 * (ใช้ร่วมกันทั้งหน้า Live Preview และข้อความจริง)
 * @param {object} config
 * @param {import('discord.js').GuildMember} member
 * @param {import('discord.js').Guild} guild
 */
function buildWelcomeContainerComponent(config, member, guild) {
  const resolvedContent = resolveTextVariables(
    config.message_content || "ยินดีต้อนรับสู่เซิร์ฟเวอร์ครับ! 🎉",
    member,
    guild
  );

  const resolvedThumb = resolveMediaUrl(config.thumbnail_url, member, guild);
  const resolvedBanner = resolveMediaUrl(config.banner_url, member, guild);

  const innerComponents = [];

  // 1. กล่องข้อความ Section (Type 9) + Thumbnail (Accessory Type 11 ถ้ามี)
  const sectionObj = {
    type: 9,
    components: [
      {
        type: 10,
        content: resolvedContent,
      },
    ],
  };

  if (resolvedThumb) {
    sectionObj.accessory = {
      type: 11,
      media: {
        url: resolvedThumb,
      },
    };
  }

  innerComponents.push(sectionObj);

  // 2. รูปภาพ Banner (Type 12) ถ้ามี
  if (resolvedBanner) {
    innerComponents.push({
      type: 14,
      spacing: 2,
    });
    innerComponents.push({
      type: 12,
      items: [
        {
          media: {
            url: resolvedBanner,
          },
        },
      ],
    });
  }

  return {
    type: 17,
    components: innerComponents,
  };
}

/**
 * สร้างหน้าแดชบอร์ดตั้งค่า /set welc หรือ /set goodbye พร้อม Live Preview
 * @param {import('discord.js').Guild} guild
 * @param {object} config
 * @param {import('discord.js').GuildMember} member
 * @param {string} type "welcome" หรือ "goodbye"
 */
function buildSettingWelcPayload(guild, config, member, type = "welcome") {
  const previewContainer = buildWelcomeContainerComponent(config, member, guild);
  const isGoodbye = type === "goodbye";
  const prefix = isGoodbye ? "goodbye" : "welc";

  // ปุ่มแก้ไขข้อความ และ แก้ไขรูปภาพ / สี
  const editBtnsRow = {
    type: 1,
    components: [
      {
        style: 2, // Secondary
        type: 2,  // Button
        custom_id: `${prefix}_btn_edit_text`,
        label: "แก้ไขข้อความ",
      },
      {
        style: 2, // Secondary
        type: 2,  // Button
        custom_id: `${prefix}_btn_edit_media`,
        label: "แก้ไขรูปภาพ / สี",
      },
      {
        style: 2, // Secondary
        type: 2,  // Button
        custom_id: `${prefix}_btn_view_vars`,
        label: "ดูตัวแปร",
      },
    ],
  };

  // เมนูเลือกห้องที่ต้องการส่ง
  const channelSelectObj = {
    type: 8, // ChannelSelectMenu
    custom_id: `${prefix}_select_channel`,
    min_values: 1,
    max_values: 1,
    placeholder: isGoodbye
      ? "👋︲เลือกห้องที่ต้องการส่งข้อความอำลา"
      : "🐻︲เลือกห้องที่ต้องการส่งข้อความต้อนรับ",
    channel_types: [ChannelType.GuildText],
  };

  if (config.channel_id) {
    channelSelectObj.default_values = [
      {
        id: config.channel_id,
        type: "channel",
      },
    ];
  }

  const channelRow = {
    type: 1,
    components: [channelSelectObj],
  };

  return {
    flags: FLAG_V2,
    components: [
      previewContainer,
      editBtnsRow,
      channelRow,
    ],
  };
}

/**
 * สร้าง Modal สำหรับแก้ไขข้อความ
 * @param {string} currentText
 * @param {string} msgId
 * @param {string} type "welcome" หรือ "goodbye"
 */
function buildEditTextModal(currentText, msgId, type = "welcome") {
  const isGoodbye = type === "goodbye";
  const prefix = isGoodbye ? "goodbye" : "welc";
  const modal = new ModalBuilder()
    .setCustomId(`${prefix}_modal_text:${msgId}`)
    .setTitle(isGoodbye ? "แก้ไขข้อความอำลา" : "แก้ไขข้อความต้อนรับ");

  const textInput = new TextInputBuilder()
    .setCustomId(`${prefix}_input_text`)
    .setLabel(isGoodbye ? "ข้อความอำลา" : "ข้อความต้อนรับ")
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(4000)
    .setRequired(true)
    .setValue(currentText || "");

  modal.addComponents(new ActionRowBuilder().addComponents(textInput));
  return modal;
}

/**
 * สร้าง Modal สำหรับแก้ไขรูปภาพและสี
 * @param {object} config
 * @param {string} msgId
 * @param {string} type "welcome" หรือ "goodbye"
 */
function buildEditMediaModal(config, msgId, type = "welcome") {
  const isGoodbye = type === "goodbye";
  const prefix = isGoodbye ? "goodbye" : "welc";
  const modal = new ModalBuilder()
    .setCustomId(`${prefix}_modal_media:${msgId}`)
    .setTitle("แก้ไขรูปภาพ และ สี");

  const thumbInput = new TextInputBuilder()
    .setCustomId(`${prefix}_input_thumb`)
    .setLabel("ลิงก์รูป Thumbnail")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("https://... หรือ {user_avatar}, {server_icon}")
    .setRequired(false)
    .setValue(config.thumbnail_url || "");

  const bannerInput = new TextInputBuilder()
    .setCustomId(`${prefix}_input_banner`)
    .setLabel("ลิงก์รูป Image Banner")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("https://... หรือ {server_banner}")
    .setRequired(false)
    .setValue(config.banner_url || "");

  const colorInput = new TextInputBuilder()
    .setCustomId(`${prefix}_input_color`)
    .setLabel("รหัสสี #HEX")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(isGoodbye ? "#A0AEC0 หรือ {random_color}" : "#FFB6C1 หรือ {random_color}")
    .setRequired(false)
    .setValue(config.accent_color || "");

  modal.addComponents(
    new ActionRowBuilder().addComponents(thumbInput),
    new ActionRowBuilder().addComponents(bannerInput),
    new ActionRowBuilder().addComponents(colorInput)
  );

  return modal;
}

/**
 * จัดการคำสั่ง Slash /set welc
 */
async function handleSetWelcCommand(interaction, supabase) {
  return handleSetMessageCommand(interaction, supabase, "welcome");
}

/**
 * จัดการคำสั่ง Slash /set goodbye
 */
async function handleSetGoodbyeCommand(interaction, supabase) {
  return handleSetMessageCommand(interaction, supabase, "goodbye");
}

/**
 * จัดการคำสั่ง Slash ตั้งค่าข้อความต้อนรับหรืออำลา
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} type "welcome" หรือ "goodbye"
 */
async function handleSetMessageCommand(interaction, supabase, type = "welcome") {
  const { guild, member } = interaction;
  const isGoodbye = type === "goodbye";

  if (
    !member.permissions.has(PermissionFlagsBits.ManageGuild) &&
    !member.permissions.has(PermissionFlagsBits.Administrator)
  ) {
    return interaction.reply({
      content: `⚠️ คุณต้องมีสิทธิ์ **Manage Server** หรือ **Administrator** เพื่อตั้งค่าข้อความ${isGoodbye ? "อำลา" : "ต้อนรับ"}ครับ`,
      flags: MessageFlags.Ephemeral,
    });
  }

  const config = await getWelcomeConfig(guild.id, supabase, type);
  const payload = buildSettingWelcPayload(guild, config, member, type);
  return interaction.reply(payload);
}

/**
 * จัดการ Interaction ทั้งหมดของระบบต้อนรับและอำลา (Buttons, Modals, SelectMenus)
 * @param {import('discord.js').Interaction} interaction
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
async function handleWelcomeInteraction(interaction, supabase) {
  const { guild, member, customId } = interaction;
  if (!guild || !customId) return false;

  const isGoodbye = customId.startsWith("goodbye_");
  const isWelc = customId.startsWith("welc_");
  if (!isGoodbye && !isWelc) return false;

  const type = isGoodbye ? "goodbye" : "welcome";
  const prefix = isGoodbye ? "goodbye" : "welc";

  // 1. ปุ่มเปิด Modal แก้ไขข้อความ
  if (interaction.isButton() && (customId === "welc_btn_edit_text" || customId === "goodbye_btn_edit_text")) {
    const config = await getWelcomeConfig(guild.id, supabase, type);
    const modal = buildEditTextModal(config.message_content, interaction.message.id, type);
    await interaction.showModal(modal);
    return true;
  }

  // 2. ปุ่มเปิด Modal แก้ไขรูปภาพและสี
  if (interaction.isButton() && (customId === "welc_btn_edit_media" || customId === "goodbye_btn_edit_media")) {
    const config = await getWelcomeConfig(guild.id, supabase, type);
    const modal = buildEditMediaModal(config, interaction.message.id, type);
    await interaction.showModal(modal);
    return true;
  }

  // 3. ปุ่มดูตัวแปร (แสดง Component V2 แบบ Ephemeral)
  if (interaction.isButton() && (customId === "welc_btn_view_vars" || customId === "goodbye_btn_view_vars")) {
    const payload = buildVariablesHelpPayload(1);
    await interaction.reply(payload);
    return true;
  }

  // 4. ปุ่มสลับหน้าตัวแปร (Pagination ⬅️ / ➡️)
  if (interaction.isButton() && (customId.startsWith("welc_vars_page:") || customId.startsWith("goodbye_vars_page:"))) {
    const pageNum = parseInt(customId.split(":")[1], 10) || 1;
    const payload = buildVariablesHelpPayload(pageNum);
    await interaction.update(payload);
    return true;
  }

  // 5. Modal Submit: แก้ไขข้อความ
  if (interaction.isModalSubmit() && (customId.startsWith("welc_modal_text:") || customId.startsWith("goodbye_modal_text:"))) {
    const msgId = customId.split(":")[1];
    const newText = interaction.fields.getTextInputValue(`${prefix}_input_text`);

    // ตรวจสอบความถูกต้องของตัวแปร
    const warningError = await validateWelcomeInputs({ messageContent: newText });
    if (warningError) {
      await interaction.reply(buildWarningPayload(warningError));
      return true;
    }

    // UX ขั้นตอนการบันทึก: แสดงข้อความ Loading แบบ Ephemeral
    await interaction.reply({
      content: "# <a:pinkloading:1562052463878602802>⠀` กำลังบันทึกการตั้งค่า . . . `",
      flags: MessageFlags.Ephemeral,
    });

    const updatedConfig = await saveWelcomeConfig(guild.id, { message_content: newText }, supabase, type);

    // แก้ไขเป็นบันทึกสำเร็จ
    await interaction.editReply({
      content: "# <:50121checkmark:1358584609087946867>⠀` บันทึกข้อมูลสำเร็จ `",
    });

    // ลบ Ephemeral ภายใน 3 วินาที
    setTimeout(() => {
      interaction.deleteReply().catch(() => { });
    }, 3000);

    // อัปเดตการ์ด Preview เดิมแบบ In-Place
    try {
      const originalMsg = await interaction.channel.messages.fetch(msgId).catch(() => null);
      if (originalMsg) {
        const newPayload = buildSettingWelcPayload(guild, updatedConfig, member, type);
        await originalMsg.edit(newPayload);
      }
    } catch (_) { }

    return true;
  }

  // 6. Modal Submit: แก้ไขรูปภาพ / สี
  if (interaction.isModalSubmit() && (customId.startsWith("welc_modal_media:") || customId.startsWith("goodbye_modal_media:"))) {
    const msgId = customId.split(":")[1];
    const newThumb = interaction.fields.getTextInputValue(`${prefix}_input_thumb`)?.trim() || null;
    const newBanner = interaction.fields.getTextInputValue(`${prefix}_input_banner`)?.trim() || null;
    const newColor = interaction.fields.getTextInputValue(`${prefix}_input_color`)?.trim() || null;

    // ตรวจสอบความถูกต้องของตัวแปร
    const warningError = await validateWelcomeInputs({
      thumbnailUrl: newThumb,
      bannerUrl: newBanner,
      accentColor: newColor,
      guild: guild,
    });

    if (warningError) {
      await interaction.reply(buildWarningPayload(warningError));
      return true;
    }

    // UX ขั้นตอนการบันทึก: แสดงข้อความ Loading แบบ Ephemeral
    await interaction.reply({
      content: "# <a:pinkloading:1562052463878602802>⠀` กำลังบันทึกการตั้งค่า . . . `",
      flags: MessageFlags.Ephemeral,
    });

    const updatedConfig = await saveWelcomeConfig(
      guild.id,
      {
        thumbnail_url: newThumb,
        banner_url: newBanner,
        accent_color: newColor,
      },
      supabase,
      type
    );

    // แก้ไขเป็นบันทึกสำเร็จ
    await interaction.editReply({
      content: "# <:50121checkmark:1358584609087946867>⠀` บันทึกข้อมูลสำเร็จ `",
    });

    // ลบ Ephemeral ภายใน 3 วินาที
    setTimeout(() => {
      interaction.deleteReply().catch(() => { });
    }, 3000);

    // อัปเดตการ์ด Preview เดิมแบบ In-Place
    try {
      const originalMsg = await interaction.channel.messages.fetch(msgId).catch(() => null);
      if (originalMsg) {
        const newPayload = buildSettingWelcPayload(guild, updatedConfig, member, type);
        await originalMsg.edit(newPayload);
      }
    } catch (_) { }

    return true;
  }

  // 7. Channel Select Menu: เลือกห้องที่จะส่งข้อความ
  if (interaction.isChannelSelectMenu() && (customId === "welc_select_channel" || customId === "goodbye_select_channel")) {
    const selectedChannelId = interaction.values[0];

    // UX ขั้นตอนการบันทึก: แสดงข้อความ Loading แบบ Ephemeral
    await interaction.reply({
      content: "# <a:pinkloading:1562052463878602802>⠀` กำลังบันทึกการตั้งค่า . . . `",
      flags: MessageFlags.Ephemeral,
    });

    const updatedConfig = await saveWelcomeConfig(
      guild.id,
      {
        channel_id: selectedChannelId,
        is_enabled: true,
      },
      supabase,
      type
    );

    const actionText = isGoodbye ? "ข้อความอำลา" : "ข้อความต้อนรับ";
    const conditionText = isGoodbye ? "เมื่อมีสมาชิกออกจากเซิร์ฟเวอร์ครับ" : "เมื่อมีคนเข้าเซิร์ฟเวอร์ครับ";

    await interaction.editReply({
      content: `# <:50121checkmark:1358584609087946867>⠀\` บันทึกข้อมูลสำเร็จ \`\n> ระบบจะส่ง${actionText}เข้าห้อง <#${selectedChannelId}> ${conditionText}`,
    });

    setTimeout(() => {
      interaction.deleteReply().catch(() => { });
    }, 3000);

    // อัปเดตการ์ดแดชบอร์ดให้เลือกห้องใหม่
    try {
      const newPayload = buildSettingWelcPayload(guild, updatedConfig, member, type);
      await interaction.message.edit(newPayload);
    } catch (_) { }

    return true;
  }

  return false;
}

/**
 * ติดตั้ง Event Listener สำหรับส่งข้อความต้อนรับ (guildMemberAdd) และข้อความอำลา (guildMemberRemove)
 * @param {import('discord.js').Client} client
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
function setupMemberWelcomeListener(client, supabase) {
  // 1. ต้อนรับสมาชิกใหม่ (guildMemberAdd)
  client.on("guildMemberAdd", async (member) => {
    try {
      const guild = member.guild;
      if (!guild) return;

      const config = await getWelcomeConfig(guild.id, supabase, "welcome");
      if (!config.is_enabled || !config.channel_id) return;

      const targetChannel = guild.channels.cache.get(config.channel_id) ||
        (await guild.channels.fetch(config.channel_id).catch(() => null));

      if (!targetChannel || !targetChannel.isTextBased()) return;

      const botMember = guild.members.me || (await guild.members.fetchMe().catch(() => null));
      if (!targetChannel.permissionsFor(botMember)?.has(PermissionFlagsBits.SendMessages)) {
        console.warn(`⚠️ [WelcomeService] ขาดสิทธิ์ SendMessages ในห้อง ${targetChannel.name} (${targetChannel.id})`);
        return;
      }

      const cardContainer = buildWelcomeContainerComponent(config, member, guild);
      await targetChannel.send({
        flags: FLAG_V2,
        components: [cardContainer],
      });
      console.log(`🎉 [WelcomeService] ส่งการ์ดต้อนรับให้ ${member.user?.tag || member.id} ในเซิร์ฟเวอร์ ${guild.name} เรียบร้อยแล้ว`);
    } catch (err) {
      console.error("❌ [WelcomeService] ส่งข้อความต้อนรับล้มเหลว:", err.message);
    }
  });

  // 2. อำลาสมาชิกที่ออกจากเซิร์ฟเวอร์ (guildMemberRemove)
  client.on("guildMemberRemove", async (member) => {
    try {
      const guild = member.guild;
      if (!guild) return;

      const config = await getWelcomeConfig(guild.id, supabase, "goodbye");
      if (!config.is_enabled || !config.channel_id) return;

      const targetChannel = guild.channels.cache.get(config.channel_id) ||
        (await guild.channels.fetch(config.channel_id).catch(() => null));

      if (!targetChannel || !targetChannel.isTextBased()) return;

      const botMember = guild.members.me || (await guild.members.fetchMe().catch(() => null));
      if (!targetChannel.permissionsFor(botMember)?.has(PermissionFlagsBits.SendMessages)) {
        console.warn(`⚠️ [GoodbyeService] ขาดสิทธิ์ SendMessages ในห้อง ${targetChannel.name} (${targetChannel.id})`);
        return;
      }

      const cardContainer = buildWelcomeContainerComponent(config, member, guild);
      await targetChannel.send({
        flags: FLAG_V2,
        components: [cardContainer],
      });
      console.log(`👋 [GoodbyeService] ส่งการ์ดอำลาให้ ${member.user?.tag || member.id} ในเซิร์ฟเวอร์ ${guild.name} เรียบร้อยแล้ว`);
    } catch (err) {
      console.error("❌ [GoodbyeService] ส่งข้อความอำลาล้มเหลว:", err.message);
    }
  });

  console.log("🐻 [WelcomeService] ติดตั้งระบบข้อความต้อนรับ (guildMemberAdd) และข้อความอำลา (guildMemberRemove) เรียบร้อยแล้ว");
}

const SET_SLASH_COMMAND = {
  name: "set",
  description: "ตั้งค่าระบบต่างๆ ของเซิร์ฟเวอร์",
  default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
  options: [
    {
      name: "welc",
      description: "ตั้งค่าระบบส่งข้อความต้อนรับสมาชิกใหม่ (Welcome Message)",
      type: 1, // SUB_COMMAND
    },
    {
      name: "goodbye",
      description: "ตั้งค่าระบบส่งข้อความอำลาสมาชิก (Goodbye Message)",
      type: 1, // SUB_COMMAND
    },
  ],
};

module.exports = {
  WELCOME_ALLOWED_GUILD_ID,
  SET_SLASH_COMMAND,
  getWelcomeConfig,
  saveWelcomeConfig,
  handleSetWelcCommand,
  handleSetGoodbyeCommand,
  handleWelcomeInteraction,
  setupMemberWelcomeListener,
  buildSettingWelcPayload,
  buildWarningPayload,
  buildVariablesHelpPayload,
};
