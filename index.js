const { Client, GatewayIntentBits } = require("discord.js");
const axios = require("axios");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates // จำเป็นต้องใช้เพื่อดักฟังเสียง
  ]
});

const WEBHOOK_URL = process.env.WEBHOOK_URL;

// ส่วนที่แก้ปัญหา: สแกนคนที่มีอยู่แล้วทันทีที่บอทตื่น (Ready)
client.once("ready", async () => {
  console.log(`Bot logged in as ${client.user.tag}`);

  for (const guild of client.guilds.cache.values()) {
    const voiceStates = guild.voiceStates.cache;
    for (const [memberId, voiceState] of voiceStates) {
      if (voiceState.channelId) {
        console.log(`[Sync] User ${memberId} is already in ${voiceState.channelId}`);
        try {
          // ส่งค่าบอก Database ว่าคนนี้สิงอยู่ในห้องนี้อยู่แล้วนะ
          await axios.post(WEBHOOK_URL, {
            event: "VOICE_STATE_UPDATE",
            data: {
              user_id: memberId,
              channel_id: voiceState.channelId,
              channel_name: voiceState.channel?.name ?? null,
              guild_id: guild.id
            }
          });
        } catch (err) {
          console.error(`Sync error for ${memberId}:`, err.message);
        }
      }
    }
  }
});

client.on("voiceStateUpdate", async (oldState, newState) => {
  if (oldState.channelId === newState.channelId) return;

  try {
    await axios.post(WEBHOOK_URL, {
      event: "VOICE_STATE_UPDATE",
      data: {
        user_id: newState.id,
        channel_id: newState.channelId || null, 
        channel_name: newState.channel?.name ?? null,
        guild_id: newState.guild.id
      }
    });
  } catch (err) {
    console.error("Webhook error:", err.message);
  }
});

client.login(process.env.BOT_TOKEN); //
