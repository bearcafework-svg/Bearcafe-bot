/**
 * staffNotifier.js
 * จัดการรวบรวมคิวสมาชิกที่ยืนยันตัวตนสำเร็จ (Batch Buffer 15 วินาที / สูงสุด 10 คน)
 * แล้วส่งสรุปแจ้งเตือนทีมงานเป็น Discord Component V2 เข้าห้อง Staff
 */

const STAFF_CHANNEL_ID = "1546141748508758117";
const STAFF_ROLE_IDS = ["1144697989986791576", "1144698080239829092"];
const WELCOME_CHANNEL_URL = "https://discord.com/channels/1144251788493602848/1524124134387224828";
const BATCH_TIMEOUT_MS = 15000; // 15 วินาที
const MAX_BATCH_SIZE = 10; // หากครบ 10 คน ให้ส่งทันที

let pendingMembers = [];
let batchTimer = null;
let targetGuild = null;

/**
 * เพิ่มสมาชิกที่ verify สำเร็จเข้าคิวแจ้งเตือน
 * @param {import("discord.js").Guild} guild 
 * @param {import("discord.js").GuildMember} member 
 */
function queueVerifiedMember(guild, member) {
  if (!guild || !member) return;

  targetGuild = guild;

  // ป้องกันการใส่ member คนเดิมซ้ำในรอบเดียวกัน
  const isDuplicate = pendingMembers.some((m) => m.id === member.id);
  if (!isDuplicate) {
    pendingMembers.push({
      id: member.id,
      user: member.user,
      displayName: member.displayName || member.user?.username || member.id,
      verifiedAt: Date.now()
    });
  }

  // หากสะสมครบเพดาน MAX_BATCH_SIZE ให้ส่งทันที
  if (pendingMembers.length >= MAX_BATCH_SIZE) {
    flushBatch();
    return;
  }

  // เริ่มนับเวลา Fixed Window (15 วินาที) นับจากคนแรก
  if (!batchTimer) {
    batchTimer = setTimeout(() => {
      flushBatch();
    }, BATCH_TIMEOUT_MS);
  }
}

/**
 * ส่งสรุปคิวสมาชิกทั้งหมดเข้าห้อง Staff และเคลียร์คิว
 */
async function flushBatch() {
  if (batchTimer) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }

  if (pendingMembers.length === 0) return;

  const currentBatch = [...pendingMembers];
  pendingMembers = [];
  const guild = targetGuild;

  if (!guild) {
    console.warn("[staffNotifier] Cannot flush batch: targetGuild is null.");
    return;
  }

  try {
    let channel = guild.channels.cache.get(STAFF_CHANNEL_ID);
    if (!channel) {
      channel = await guild.channels.fetch(STAFF_CHANNEL_ID).catch(() => null);
    }

    if (!channel) {
      console.warn(`[staffNotifier] Staff channel ${STAFF_CHANNEL_ID} not found.`);
      return;
    }

    const roleMentions = STAFF_ROLE_IDS.map((rid) => `<@&${rid}>`).join(" ");

    const payload = {
      flags: 32768, // V2 Components
      allowedMentions: {
        roles: STAFF_ROLE_IDS
      },
      components: [
        {
          type: 17, // Container
          components: [
            {
              type: 14,
              spacing: 2
            },
            {
              type: 10,
              content:
                `## <a:bear_hi:1144698250306257037>︲แจ้งเตือนสมาชิกใหม่ยืนยันตัวตนสำเร็จ!\n` +
                `${roleMentions}\n` +
                `> (<:bearcafe_star:1212856675053346897>)⠀มีสมาชิกยืนยันตัวตนสำเร็จทั้งหมด **${currentBatch.length}** คน ในรอบนี้ค้าบ`
            },
            {
              type: 14,
              spacing: 2
            },
            {
              type: 1,
              components: [
                {
                  type: 2,
                  style: 5,
                  label: "︲คลิกไปต้อนรับ",
                  emoji: { id: "1518217054711189644", name: "27073hispeechbubble", animated: true },
                  url: WELCOME_CHANNEL_URL
                }
              ]
            }
          ]
        }
      ]
    };

    await channel.send(payload);
    console.log(
      `[staffNotifier] Sent verification summary for ${currentBatch.length} member(s) to staff channel.`
    );
  } catch (error) {
    console.error("[staffNotifier] Error sending batch alert to staff channel:", error);
  }
}

module.exports = {
  queueVerifiedMember,
  flushBatch
};
