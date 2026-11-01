// ===================================================
// src/akari/services/welcomeService.js
// ระบบการ์ดต้อนรับเมื่อ Kuma Bot ได้รับเชิญเข้าสู่เซิร์ฟเวอร์ใหม่ (guildCreate)
// รองรับการส่งเข้า System Channel -> ห้องทั่วไปแรกที่ส่งได้ -> Fallback DM หา Owner
// ดีไซน์ Discord Component V2 ตามมาตรฐาน KUMA_COMPONENT_V2.md
// ===================================================

const { ChannelType, PermissionFlagsBits, MessageFlags } = require("discord.js");
const { isExcludedGuild } = require("../filters/guildIgnoreFilter");

const FLAG_V2 = MessageFlags.IsComponentsV2 || 32768;

const BEE_HEADER_EMOJI = "<:bee20000:1256669436350562355>";
const CUTE_PLANT_EMOJI = "<:cuteplant:1152834055528783872>";
const GIFT_EMOJI_ID = "1276130500410605609";
const DEV_STAR_EMOJI_ID = "1212856675053346897";

const BANNER_URL =
  "https://media.discordapp.net/attachments/1566075967334518915/1566423425004732538/MainbannerKuma.png?ex=6ae87cff&is=6ae72b7f&hm=d9f7133a1e1df4ac1066753ab5c406c6d4711c907eb1948fefc71013bef259c7&=&format=webp&quality=lossless";
const BOT_INVITE_URL = "https://discord.com/oauth2/authorize?client_id=1538896195253178409";
const DEVELOPER_CONTACT_URL = "https://discord.gg/EHHybsbHxD";

// แคชสำหรับป้องกันการส่งข้อความต้อนรับซ้ำซ้อนกรณี Discord ยิง guildCreate ซ้ำ
const welcomedGuilds = new Set();

/**
 * สร้าง Component V2 Payload สำหรับการ์ดต้อนรับเมื่อเชิญบอท
 */
function buildWelcomePayload(guild, client, inviterId = null) {
  const mentionText = inviterId ? `<@${inviterId}>` : (guild?.ownerId ? `<@${guild.ownerId}>` : "ทุกคน");

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
                  url: BANNER_URL,
                },
              },
            ],
          },
          {
            type: 10,
            content: `## <:bee20000:1256669436350562355>︲__\` 𝖧𝖾𝗒 𝖻𝗋𝗈 ₊ โย้วพวก ขอบคุณที่เชิญเรามานะ! 𓂃 \`__\n-# ${mentionText} บอทคุมะ บอทมินิเกมอัตโนมัติ เพิ่มสีสันและความคึกคักให้กับเซิร์ฟเวอร์ของคุณ เล่นสนุกตลอด 24 ชั่วโมง โดยไม่ต้องคอยคุมห้อง <:cuteplant:1152834055528783872>`,
          },
          {
            type: 14,
            spacing: 2,
          },
          {
            type: 10,
            content:
              "- **` 📌 ขั้นตอนเริ่มต้นใช้งาน `** *!*\n" +
              "  - *เพียงพิมพ์คำสั่ง **/setup-games** บอทก็จะเริ่มต้นสร้างห้องสำหรับเล่นเกมให้คุณทันที!*\n\n" +
              "- **` 📝 คำสั่งอื่น ๆ `** *!*\n" +
              "  - *พิมพ์ **/help** เพื่อดูรายละเอียดและวิธีใช้งานคำสั่งทั้งหมด*\n",
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
                label: "︲เข้าร่วมเซิร์ฟเวอร์บอท",
                emoji: {
                  id: "1566469689188556821",
                  name: "discordclyde",
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
 * ค้นหาห้องที่เหมาะสมที่สุดสำหรับส่งข้อความต้อนรับ
 * ลำดับ: System Channel -> ห้องชื่อทั่วไป/แชท -> ห้องแรกที่ส่งได้ -> null
 */
async function findWelcomeChannel(guild) {
  try {
    const botMember = guild.members.me || (await guild.members.fetchMe().catch(() => null));
    if (!botMember) return null;

    const baseRequiredPerms = [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
    ];

    // 1. ตรวจสอบ System Channel ก่อน (ถ้าเปิดใช้งาน และบอทส่งข้อความได้)
    if (guild.systemChannel) {
      const perms = guild.systemChannel.permissionsFor(botMember);
      if (perms && perms.has(baseRequiredPerms)) {
        return guild.systemChannel;
      }
    }

    // 2. ดึงแคชช่องทั้งหมดให้เป็นปัจจุบัน
    await guild.channels.fetch().catch(() => {});

    const textChannels = guild.channels.cache.filter(
      (c) =>
        c.type === ChannelType.GuildText &&
        c.permissionsFor(botMember)?.has(baseRequiredPerms)
    );

    if (!textChannels || textChannels.size === 0) {
      return null;
    }

    // ลำดับชื่อห้องที่แนะนำ
    const preferredKeywords = [
      "general",
      "พูดคุย",
      "คุยเล่น",
      "ห้องแชท",
      "แชท",
      "chat",
      "bot",
      "บอท",
      "คำสั่ง",
      "welcome",
      "ต้อนรับ",
      "lobby",
      "main",
    ];

    for (const keyword of preferredKeywords) {
      const matched = textChannels.find((c) =>
        c.name.toLowerCase().includes(keyword)
      );
      if (matched) return matched;
    }

    // 3. Fallback: เลือกห้องข้อความแรกที่บอทมีสิทธิ์ส่ง
    return textChannels.first() || null;
  } catch (err) {
    console.warn(`⚠️ [WelcomeService] ตรวจหาช่องต้อนรับไม่สำเร็จสำหรับ ${guild.name}:`, err.message);
    return null;
  }
}

/**
 * ติดตั้ง Event Listener ดักฟังเมื่อบอทได้รับเชิญเข้าสู่เซิร์ฟเวอร์ใหม่
 */
function setupWelcomeService(client) {
  client.on("guildCreate", async (guild) => {
    try {
      if (!guild || !guild.id) return;

      // 1. ป้องกันการส่งซ้ำกรณี Discord ยิง event guildCreate ซ้ำซ้อน
      if (welcomedGuilds.has(guild.id)) {
        console.log(`🛡️ [WelcomeService] ตรวจพบ guildCreate ซ้ำสำหรับ ${guild.name} (${guild.id}) กำลังข้าม`);
        return;
      }
      welcomedGuilds.add(guild.id);
      // ตั้งเวลาลบแคชออกหลัง 10 นาที (เผื่อกรณีเตะบอทแล้วเชิญใหม่ในอนาคต)
      setTimeout(() => welcomedGuilds.delete(guild.id), 10 * 60 * 1000);

      // 2. ป้องกันการส่งในเซิร์ฟเวอร์หลักหรือ Excluded Guilds
      if (isExcludedGuild(guild.id)) {
        console.log(`🛡️ [WelcomeService] เพิกเฉยต่อ Excluded Guild: ${guild.name} (${guild.id})`);
        return;
      }

      console.log(`🎉 [WelcomeService] บอทได้รับเชิญเข้าสู่เซิร์ฟเวอร์ใหม่: ${guild.name} (ID: ${guild.id}, สมาชิก: ${guild.memberCount || "N/A"} คน)`);

      // หน่วงเวลาเล็กน้อยเพื่อให้ Discord เตรียมแคชสิทธิ์และช่องต่างๆ ให้เรียบร้อย
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // ดึง ID ของคนที่เชิญบอทจาก Audit Logs (ถ้ามีสิทธิ์) หรือ fallback เป็น ownerId
      let inviterId = null;
      try {
        const auditLogs = await guild.fetchAuditLogs({
          type: 28, // AuditLogEvent.BotAdd
          limit: 1,
        }).catch(() => null);
        const entry = auditLogs?.entries?.first();
        if (entry && (entry.target?.id === client.user.id || entry.action === 28)) {
          inviterId = entry.executor?.id;
        }
      } catch (e) {}

      if (!inviterId && guild.ownerId) {
        inviterId = guild.ownerId;
      }

      const payload = buildWelcomePayload(guild, client, inviterId);
      const targetChannel = await findWelcomeChannel(guild);

      if (targetChannel) {
        await targetChannel.send(payload).catch((err) => {
          console.warn(`⚠️ [WelcomeService] ส่งข้อความเข้าห้อง #${targetChannel.name} ไม่สำเร็จ:`, err.message);
        });
        console.log(`📨 [WelcomeService] ส่งการ์ดต้อนรับเข้าห้อง #${targetChannel.name} ใน ${guild.name} สำเร็จ!`);
        return;
      }

      // ถ้าไม่มีห้องข้อความไหนที่บอทส่งได้เลย ให้ส่งตรงเข้า DM ของ Server Owner
      console.log(`⚠️ [WelcomeService] ไม่พบห้องข้อความที่ส่งได้ใน ${guild.name} กำลังส่งตรงหา Server Owner...`);
      const owner = await guild.fetchOwner().catch(() => null);
      if (owner) {
        await owner.send(payload).catch((err) => {
          console.warn(`⚠️ [WelcomeService] ไม่สามารถส่ง DM หาเจ้าของเซิร์ฟเวอร์ ${guild.name} (${owner.id}):`, err.message);
        });
        console.log(`📨 [WelcomeService] ส่งการ์ดต้อนรับเข้า DM ของ Server Owner (${owner.user?.tag || owner.id}) สำเร็จ!`);
      }
    } catch (error) {
      console.error(`❌ [WelcomeService] เกิดข้อผิดพลาดใน guildCreate (${guild?.name}):`, error.message);
    }
  });

  console.log("🐻 [WelcomeService] ระบบการ์ดต้อนรับเมื่อเชิญบอท (guildCreate) พร้อมทำงานแล้ว!");
}

module.exports = {
  buildWelcomePayload,
  findWelcomeChannel,
  setupWelcomeService,
};
