// Features: Horoscope/healing.js
// คำสั่ง "ขอกำลังใจ" — สุ่มคำให้กำลังใจจากระบบบอร์ด healing_messages

const { createClient } = require('@supabase/supabase-js');
const { MessageFlags } = require('discord.js');
const sharedConfig = require('../../sharedSettings.json');
const { blacklistPayload } = require('../shared/tarotComponents');

const FLAG_V2 = MessageFlags.IsComponentsV2 || 32768;
const TARGET_CHANNEL_ID = "1524123478431895692";

function setupHealing(client) {
  // Initialize Supabase using service key env variables
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  );

  client.on('messageCreate', async (message) => {
    if (!message.guild) return;
    if (message.author.bot) return;

    // Trigger only in specified channel
    if (message.channel.id !== TARGET_CHANNEL_ID) return;

    // Trigger word: "ขอกำลังใจ"
    if (message.content.trim() !== 'ขอกำลังใจ') return;

    const member = message.member;
    const userId = message.author.id;

    // ── Check Blacklist Roles ──
    const isBlacklisted = sharedConfig.role_blacklist.some(id => member.roles.cache.has(id));
    if (isBlacklisted) {
      const sent = await message.reply(blacklistPayload(userId));
      setTimeout(() => sent.delete().catch(() => {}), 5000);
      return;
    }

    try {
      // Fetch approved healing messages with author profiles
      const { data, error } = await supabase
        .from('healing_messages')
        .select(`
          message,
          profiles:author_id (
            username,
            avatar_url,
            discord_id
          )
        `)
        .eq('status', 'approved');

      if (error) throw error;

      // Filter: random from table but not of the user using the command
      let candidates = (data || []).filter(r => r.profiles?.discord_id !== userId);

      // Fallback A: If no candidates by other users, fallback to any approved messages
      if (candidates.length === 0) {
        candidates = data || [];
      }

      let selectedMsg = null;
      if (candidates.length > 0) {
        const randomIndex = Math.floor(Math.random() * candidates.length);
        selectedMsg = candidates[randomIndex];
      } else {
        // Fallback B: Default fallback cozy message
        selectedMsg = {
          message: "เธอทำดีที่สุดแล้วน้า หมีเป็นกำลังใจให้เสมอค่ะ สู้ๆ นะคะ! 🧸💛",
          profiles: {
            username: "Bear Café Mascot",
            avatar_url: "https://cdn.discordapp.com/embed/avatars/0.png",
            discord_id: ""
          }
        };
      }

      const avatarUrl = selectedMsg.profiles?.avatar_url || "https://cdn.discordapp.com/embed/avatars/0.png";
      const username = selectedMsg.profiles?.username || "ผู้ใช้ไม่ระบุชื่อ";

      // Send the Component V2 reply
      await message.reply({
        flags: FLAG_V2,
        components: [
          {
            type: 17,
            components: [
              {
                type: 14,
                spacing: 1,
                divider: false
              },
              {
                type: 9,
                components: [
                  {
                    type: 10,
                    content: `## <a:28457gameoverheart:1372833851092504637>︲__\` 𝖬𝖾𝗌𝗌𝖺𝖿𝖾 𝟦 𝗎 ₊ ข้อความนี้ของเธอ 𓂃 \`__\n### ${selectedMsg.message}\n-# - เจ้าของข้อความ: **__[${username}](https://bearcafe4commu.vercel.app/healing-message)__** <:cuteplant:1152834055528783872>\n\n`
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
              },
              {
                type: 1,
                components: [
                  {
                    type: 2,
                    style: 5,
                    label: "︲เพิ่มข้อความของคุณเอง!",
                    emoji: {
                      id: "1518217054711189644",
                      name: "27073hispeechbubble",
                      animated: true
                    },
                    url: "https://bearcafe4commu.vercel.app/healing-message",
                    custom_id: "p_325245404381712388"
                  }
                ]
              }
            ]
          }
        ]
      });

    } catch (err) {
      console.error('[Healing Command] Error:', err.message);
      await message.reply({ content: "เกิดข้อผิดพลาดในการดึงข้อความให้กำลังใจ โปรดลองอีกครั้งค่ะ", flags: MessageFlags.Ephemeral });
    }
  });
}

module.exports = { setupHealing };
