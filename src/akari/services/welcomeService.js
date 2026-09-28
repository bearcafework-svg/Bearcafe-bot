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
  "https://cdn.discordapp.com/attachments/1524704267015819274/1553721167796506735/BannerKuma.png?ex=6aba4719&is=6ab8f599&hm=be04ac6b06de17698bcd28c562b93e5963076716e71c9adee91d279efe01216b&";
const BOT_INVITE_URL = "https://discord.com/oauth2/authorize?client_id=1538896195253178409";
const DEVELOPER_CONTACT_URL = "https://discord.gg/EHHybsbHxD";

// แคชสำหรับป้องกันการส่งข้อความต้อนรับซ้ำซ้อนกรณี Discord ยิง guildCreate ซ้ำ
const welcomedGuilds = new Set();

/**
 * สร้าง Component V2 Payload สำหรับการ์ดต้อนรับเมื่อเชิญบอท
 */
function buildWelcomePayload(guild, client) {
  const serverIcon =
    guild?.iconURL({ dynamic: true, size: 256 }) ||
    client.user?.displayAvatarURL({ extension: "png", size: 256 }) ||
    "https://cdn.discordapp.com/embed/avatars/0.png";

  const inviteUrl = BOT_INVITE_URL;

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
            type: 14,
            spacing: 2,
            divider: true,
          },
          {
            type: 9,
            components: [
              {
                type: 10,
                content:
                  `## ${BEE_HEADER_EMOJI} ︲__\` 𝖶𝖾𝗅𝖼𝗈𝗆𝖾 ₊ โย้วพวก ขอบคุณที่เชิญเรามานะ! 𓂃 \`__\n` +
                  `> **บอทคุมะ** บอทมินิเกมอัตโนมัติ เพิ่มสีสันและความคึกคักให้กับเซิร์ฟเวอร์ของคุณ เล่นสนุกตลอด 24 ชั่วโมง โดยไม่ต้องคอยคุมห้อง ${CUTE_PLANT_EMOJI} \n`,
              },
            ],
            accessory: {
              type: 11,
              media: {
                url: serverIcon,
              },
            },
          },
          {
            type: 14,
            spacing: 1,
            divider: false,
          },
          {
            type: 10,
            content:
              `### 🚀 ︲ขั้นตอนเริ่มต้นใช้งาน\n` +
              `1. **ติดตั้งห้องมินิเกมอัตโนมัติ** : พิมพ์คำสั่ง \`/setup-games\` เพื่อสร้างหมวดหมู่และช่องเกมพร้อมสปอว์นข้อแรกทันที\n` +
              `2. **ปรับแต่งและตั้งค่าเกม** : พิมพ์คำสั่ง \`/setting-games\` เพื่อเปิด/ปิดเกมย่อย หรือรีเซ็ตส่งการ์ดข้อใหม่\n` +
              `3. **เช็กคะแนนและอันดับ** : สมาชิกสามารถพิมพ์ \`/points\` หรือ \`/leaderboard\` เพื่อดูแต้มสะสมและอันดับผู้เล่น\n` +
              `4. **ต้องการความช่วยเหลือ** : พิมพ์ \`/help\` เพื่อดูรายละเอียดและวิธีใช้งานคำสั่งทั้งหมด`,
          },
          {
            type: 14,
            spacing: 2,
          },
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 5,
                label: "︲เชิญบอทฟรี",
                emoji: {
                  id: GIFT_EMOJI_ID,
                  name: "68492gift",
                  animated: false,
                },
                url: inviteUrl,
              },
              {
                type: 2,
                style: 5,
                label: "︲ติดต่อผู้พัฒนา",
                emoji: {
                  id: DEV_STAR_EMOJI_ID,
                  name: "bearcafe_star",
                  animated: false,
                },
                url: DEVELOPER_CONTACT_URL,
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

      const payload = buildWelcomePayload(guild, client);
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
