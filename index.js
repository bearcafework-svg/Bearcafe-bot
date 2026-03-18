const { Client, GatewayIntentBits } = require("discord.js");
const axios = require("axios");
const http = require("http"); // เพิ่มตัวนี้เข้ามา (เป็นตัวมาตรฐานของ Node.js ไม่ต้องลงเพิ่ม)

// 🌟 ส่วนที่เพิ่มเข้ามาเพื่อหลอก Health Check ของ Koyeb
http.createServer((req, res) => {
  res.writeHead(200);
  res.end("I am alive!");
}).listen(process.env.PORT || 8000); 

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ]
});

const WEBHOOK_URL = process.env.WEBHOOK_URL;

client.once("clientReady", async () => {
  console.log(`Bot logged in as ${client.user.tag}`);

  for (const guild of client.guilds.cache.values()) {
    const voiceStates = guild.voiceStates.cache;
    for (const [memberId, voiceState] of voiceStates) {
      if (voiceState.channelId) {
        console.log(`[Sync] User ${memberId} is already in ${voiceState.channelId}`);
        try {
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
    console.log(`User ${newState.id} changed voice state: ${oldState.channelId} -> ${newState.channelId}`);
    
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

client.login(process.env.BOT_TOKEN);
