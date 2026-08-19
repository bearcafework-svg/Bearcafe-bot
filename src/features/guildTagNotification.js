// src/features/guildTagNotification.js
// ระบบตรวจสอบการใส่/ถอด Guild Tag และจัดการบทบาทอัตโนมัติ พร้อมส่งข้อความแจ้งเตือน Component V2

const TARGET_CHANNEL_ID = "1524123147987714158";
const REWARD_ROLE_ID = "1539666876865708062";

/**
 * ดึง Target Guild ID ของเซิร์ฟเวอร์หลัก
 */
function getTargetGuildId() {
  if (process.env.DISCORD_GUILD_ID) {
    const first = process.env.DISCORD_GUILD_ID.split(",")[0].trim();
    if (first) return first;
  }
  return "1144251788493602848"; // ค่าเริ่มต้น Bear Cafe Main Server
}

/**
 * ดึงข้อมูล primary guild / clan จาก user หรือ member หรือ raw data
 */
function extractPrimaryGuildData(userOrMember, rawUserData = null) {
  const user = userOrMember?.user || userOrMember;

  // 1. จากโครงสร้างมาตรฐาน Discord.js (ถ้ามี)
  if (user?.primaryGuild) {
    return {
      guildId: user.primaryGuild.identityGuildId || user.primaryGuild.guildId || null,
      tag: user.primaryGuild.tag || null,
    };
  }
  if (user?.clan) {
    return {
      guildId: user.clan.identityGuildId || user.clan.guildId || null,
      tag: user.clan.tag || null,
    };
  }

  // 2. จาก _raw object
  const rawObj = user?._raw || rawUserData;
  if (rawObj) {
    const pg = rawObj.primary_guild || rawObj.clan;
    if (pg) {
      return {
        guildId: pg.identity_guild_id || pg.guild_id || null,
        tag: pg.tag || null,
      };
    }
  }

  return null;
}

/**
 * ตรวจสอบว่าผู้ใช้ใส่ Guild Tag ของเซิร์ฟเวอร์เป้าหมายหรือไม่
 */
function checkHasTargetGuildTag(userOrMember, targetGuildId, rawUserData = null) {
  const pgData = extractPrimaryGuildData(userOrMember, rawUserData);
  if (!pgData) return false;

  // หากระบุ guildId ให้เช็กว่าตรงกับ targetGuildId หรือไม่
  if (pgData.guildId && String(pgData.guildId).trim() === String(targetGuildId).trim()) {
    return true;
  }

  // หากไม่มี guildId ให้เช็กว่ามี tag หรือไม่
  if (pgData.tag) {
    return true;
  }

  return false;
}

/**
 * สร้าง Component V2 Payload สำหรับแจ้งเตือนเมื่อได้รับยศ
 */
function buildTagEquippedPayload(userId, avatarUrl) {
  return {
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
                content: `## <:50121checkmark:1358584609087946867>︲__\` 𝖦𝗎𝗂𝗅𝖽 𝗍𝖺𝗀 ₊ คุณได้รับยศแรร์! 𓂃 \`__\n> (<:bee20000:1256669436350562355>)⠀<@${userId}> ขอบคุณที่ใช้แท็กของคาเฟ่หมีนะคะ\n> (<a:59217leaf:1512014878796152862>)⠀บทบาทที่ได้รับ: **\` @① 𝐒𝐈𝐆𝐌𝐀 𝐁𝐄𝐄 — ผึ้งซิกม่า ✦ \`**`
              }
            ],
            accessory: {
              type: 11,
              media: {
                url: avatarUrl
              }
            }
          },
          {
            type: 14,
            spacing: 2
          }
        ]
      }
    ]
  };
}

/**
 * สร้าง Component V2 Payload สำหรับแจ้งเตือนเมื่อถูกถอดยศ
 */
function buildTagUnequippedPayload(userId, avatarUrl) {
  return {
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
                content: `## <:68440x:1358584606911369226>︲__\` 𝖦𝗎𝗂𝗅𝖽 𝗍𝖺𝗀 ₊ แจ้งเตือนถอดยศ! 𓂃 \`__\n> (<:bee20000:1256669436350562355>)⠀<@${userId}> ฮือ ถอดแท็กของเราทำไม\n> (<a:59217leaf:1512014878796152862>)⠀บทบาทที่ถูกถอด: **\` @① 𝐒𝐈𝐆𝐌𝐀 𝐁𝐄𝐄 — ผึ้งซิกม่า ✦ \`**`
              }
            ],
            accessory: {
              type: 11,
              media: {
                url: avatarUrl
              }
            }
          },
          {
            type: 14,
            spacing: 2
          }
        ]
      }
    ]
  };
}

/**
 * ส่งข้อความแจ้งเตือนไปยัง Channel
 */
async function sendNotification(client, payload) {
  try {
    const channel = client.channels.cache.get(TARGET_CHANNEL_ID) ||
      await client.channels.fetch(TARGET_CHANNEL_ID).catch(() => null);

    if (!channel) {
      console.error(`[guildTagNotification] ไม่พบ Channel ID: ${TARGET_CHANNEL_ID}`);
      return;
    }

    await channel.send(payload);
  } catch (err) {
    console.error("[guildTagNotification] เกิดข้อผิดพลาดในการส่งแจ้งเตือน:", err.message);
  }
}

/**
 * ป้องกันการประมวลผลซ้ำซ้อนในเวลาใกล้กัน (Debounce per User)
 */
const recentUpdates = new Map();
const COOLDOWN_MS = 5000;

function isDebounced(userId, action) {
  const key = `${userId}:${action}`;
  const now = Date.now();
  const last = recentUpdates.get(key);
  if (last && now - last < COOLDOWN_MS) {
    return true;
  }
  recentUpdates.set(key, now);
  return false;
}

/**
 * ฟังก์ชันหลักในการประมวลผลการเปลี่ยนแปลง Guild Tag ของ Member
 */
async function handleMemberTagChange(client, member, rawUserData = null) {
  if (!member || member.user?.bot) return;

  const targetGuildId = getTargetGuildId();
  if (member.guild.id !== targetGuildId) return;

  const userId = member.id;
  const hasTag = checkHasTargetGuildTag(member, targetGuildId, rawUserData);
  const hasRole = member.roles.cache.has(REWARD_ROLE_ID);
  const avatarUrl = member.user.displayAvatarURL({ extension: "png", size: 512, forceStatic: false }) || member.user.defaultAvatarURL;

  // 1. กรณี: ใส่ Guild Tag แล้วยังไม่มียศ -> เพิ่มยศ + แจ้งเตือน
  if (hasTag && !hasRole) {
    if (isDebounced(userId, "add")) return;

    try {
      await member.roles.add(REWARD_ROLE_ID, "ติดตั้ง Discord Guild Tag ของเซิร์ฟเวอร์");
      console.log(`[guildTagNotification] 🏷️ มอบยศ ${REWARD_ROLE_ID} ให้แก่ ${member.user.tag} (${userId})`);

      const payload = buildTagEquippedPayload(userId, avatarUrl);
      await sendNotification(client, payload);
    } catch (err) {
      console.error(`[guildTagNotification] เพิ่มยศให้ ${member.user.tag} ไม่สำเร็จ:`, err.message);
    }
  }
  // 2. กรณี: ถอด Guild Tag ออกแล้วแต่ยังมียศค้างอยู่ -> ถอดยศ + แจ้งเตือน
  else if (!hasTag && hasRole) {
    if (isDebounced(userId, "remove")) return;

    try {
      await member.roles.remove(REWARD_ROLE_ID, "ถอด Discord Guild Tag ของเซิร์ฟเวอร์ออกแล้ว");
      console.log(`[guildTagNotification] ❌ ถอดยศ ${REWARD_ROLE_ID} จาก ${member.user.tag} (${userId})`);

      const payload = buildTagUnequippedPayload(userId, avatarUrl);
      await sendNotification(client, payload);
    } catch (err) {
      console.error(`[guildTagNotification] ถอดยศจาก ${member.user.tag} ไม่สำเร็จ:`, err.message);
    }
  }
}

function setupGuildTagNotification(client) {
  const targetGuildId = getTargetGuildId();
  console.log(`🏷️ [guildTagNotification] ระบบตรวจสอบ Guild Tag เริ่มทำงานสำหรับ Guild: ${targetGuildId}`);

  // 1. ดักฟัง Event `guildMemberUpdate`
  client.on("guildMemberUpdate", async (oldMember, newMember) => {
    try {
      await handleMemberTagChange(client, newMember);
    } catch (err) {
      console.error("[guildTagNotification] Error in guildMemberUpdate:", err);
    }
  });

  // 2. ดักฟัง Event `userUpdate` (เพื่อตรวจจับกรณี Discord อัปเดต global user profile)
  client.on("userUpdate", async (oldUser, newUser) => {
    try {
      if (newUser.bot) return;
      const guild = client.guilds.cache.get(targetGuildId);
      if (!guild) return;

      const member = guild.members.cache.get(newUser.id) || await guild.members.fetch(newUser.id).catch(() => null);
      if (!member) return;

      await handleMemberTagChange(client, member);
    } catch (err) {
      console.error("[guildTagNotification] Error in userUpdate:", err);
    }
  });

  // 3. ดักฟัง Raw Gateway Event เพื่อรองรับ Payload `primary_guild` ในกรณีที่ discord.js ยังไม่ wrap เข้า User object
  client.on("raw", async (packet) => {
    if (!packet || !packet.t) return;

    if (packet.t === "GUILD_MEMBER_UPDATE") {
      const data = packet.d;
      if (!data || data.guild_id !== targetGuildId) return;

      const guild = client.guilds.cache.get(targetGuildId);
      if (!guild) return;

      const member = guild.members.cache.get(data.user?.id) || await guild.members.fetch(data.user?.id).catch(() => null);
      if (!member) return;

      await handleMemberTagChange(client, member, data.user);
    } else if (packet.t === "USER_UPDATE") {
      const data = packet.d;
      if (!data || !data.id) return;

      const guild = client.guilds.cache.get(targetGuildId);
      if (!guild) return;

      const member = guild.members.cache.get(data.id) || await guild.members.fetch(data.id).catch(() => null);
      if (!member) return;

      await handleMemberTagChange(client, member, data);
    }
  });
}

module.exports = {
  setupGuildTagNotification,
  checkHasTargetGuildTag,
  extractPrimaryGuildData,
  buildTagEquippedPayload,
  buildTagUnequippedPayload,
};
