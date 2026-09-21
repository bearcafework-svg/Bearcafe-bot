// src/features/dailyQuest/questTriggers.js
// ตัวดักจับและส่งผ่าน Event ของ Discord ไปยัง Daily Quest Engine

const { Events } = require("discord.js");
const { processTriggerEvent } = require("./questEngine");

const AFK_CATEGORY_OR_CHANNEL_ID = "1524122689604816986";

function setupQuestTriggers(client, supabase) {
  // ─── 1. ดักจับข้อความในแชท (messageCreate) ────────────────────────
  client.on(Events.MessageCreate, async (message) => {
    try {
      if (!message || message.author?.bot || !message.guild) return;

      const user = message.author;
      const content = message.content || "";
      const channelId = message.channel.id;

      // 1.1 ตรวจสอบ Keyword (เช่น Morning Bear)
      await processTriggerEvent(client, supabase, user, "keyword", {
        text: content,
        channelId
      });

      // 1.2 เควสส่งข้อความแวะมาคุย (chat_any)
      await processTriggerEvent(client, supabase, user, "chat_any", {
        channelId
      });

      // 1.3 เควสคุยต่ออีกนิด (chat_count)
      await processTriggerEvent(client, supabase, user, "chat_count", {
        channelId,
        amount: 1
      });

      // 1.4 เควส Reply ข้อความเพื่อน (chat_reply)
      if (message.reference && message.reference.messageId) {
        await processTriggerEvent(client, supabase, user, "chat_reply", {
          channelId
        });
      }

      // 1.5 เควสแท็กเพื่อน (chat_mention)
      if (message.mentions && message.mentions.users.size > 0) {
        const mentionsOther = message.mentions.users.some((u) => u.id !== user.id && !u.bot);
        if (mentionsOther) {
          await processTriggerEvent(client, supabase, user, "chat_mention", {
            channelId
          });
        }
      }

      // 1.6 เควสมีม หรือเพลง (chat_media)
      const hasSticker = message.stickers && message.stickers.size > 0;
      const hasGifAttachment = message.attachments?.some((a) =>
        a.contentType?.toLowerCase().includes("gif")
      );
      const hasGifLink = /https?:\/\/(tenor|giphy)\./i.test(content);
      const isStickerOrGif = hasSticker || hasGifAttachment || hasGifLink;

      const hasMusicLink =
        /https?:\/\/(youtube|youtu\.be|spotify|soundcloud|music\.apple)\./i.test(content);

      if (isStickerOrGif) {
        await processTriggerEvent(client, supabase, user, "chat_media", {
          channelId,
          mediaType: "sticker_or_gif"
        });
      }

      if (hasMusicLink) {
        await processTriggerEvent(client, supabase, user, "chat_media", {
          channelId,
          mediaType: "music_link"
        });
      }

      // 1.7 เควสใช้อีโมจิของเซิร์ฟเวอร์ (chat_emoji)
      const hasCustomEmoji = /<a?:[a-zA-Z0-9_]+:[0-9]+>/.test(content);
      if (hasCustomEmoji) {
        await processTriggerEvent(client, supabase, user, "chat_emoji", {
          channelId
        });
      }
    } catch (err) {
      console.error("[dailyQuest] messageCreate trigger error:", err.message);
    }
  });

  // ─── 2. ดักจับการกด Reaction (messageReactionAdd) ──────────────────
  client.on(Events.MessageReactionAdd, async (reaction, user) => {
    try {
      if (!user || user.bot) return;

      if (reaction.partial) {
        try {
          await reaction.fetch();
        } catch {
          return;
        }
      }

      const channelId = reaction.message?.channel?.id;
      const messageUrl = reaction.message?.url;

      await processTriggerEvent(client, supabase, user, "reaction_add", {
        channelId,
        messageUrl,
        amount: 1
      });
    } catch (err) {
      console.error("[dailyQuest] messageReactionAdd trigger error:", err.message);
    }
  });

  // ─── 3. ดักจับการใช้งาน Voice Channel (Voice Duration & Join) ───────

  // 3.1 ตรวจจับเมื่อผู้ใช้เข้าห้องเสียงใหม่ (voice_join)
  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    try {
      const member = newState.member || oldState.member;
      if (!member || member.user?.bot) return;

      const isJoined = !oldState.channelId && Boolean(newState.channelId);
      if (isJoined) {
        // ทริกเกอร์เควสแวะห้องเสียง (voice_join)
        await processTriggerEvent(client, supabase, member.user, "voice_join", {
          channelId: newState.channelId
        });
      }
    } catch (err) {
      console.error("[dailyQuest] VoiceStateUpdate trigger error:", err.message);
    }
  });

  // 3.2 Loop ตรวจและสะสมเวลานาทีเสียงทุก ๆ 1 นาที (Minute Tick)
  // ตรวจจับจาก guild.voiceStates.cache โดยตรง เพื่อให้รองรับสมาชิกที่อยู่ในห้องเสียงอยู่แล้วก่อนบอทเริ่มทำงาน
  setInterval(async () => {
    try {
      if (!client.isReady()) return;

      for (const guild of client.guilds.cache.values()) {
        // ข้ามเซิร์ฟเวอร์ฮิลใจ
        if (guild.id === "1536199707922141254") continue;

        for (const [userId, vs] of guild.voiceStates.cache) {
          if (!vs.channelId || vs.member?.user?.bot) continue;

          // ข้ามห้อง AFK หรือ Category ที่ยกเว้น
          const channel = vs.channel || guild.channels.cache.get(vs.channelId);
          const parentId = channel?.parentId || null;
          if (
            vs.channelId === AFK_CATEGORY_OR_CHANNEL_ID ||
            parentId === AFK_CATEGORY_OR_CHANNEL_ID
          ) {
            continue;
          }

          // ตรวจสอบจำนวนสมาชิกที่ไม่ใช่บอทในห้องเสียงเดียวกัน
          const memberCount = guild.voiceStates.cache.filter(
            (otherVs) => otherVs.channelId === vs.channelId && !otherVs.member?.user?.bot
          ).size;

          const user = vs.member?.user || (await client.users.fetch(userId).catch(() => null));
          if (!user) continue;

          // บันทึกสะสม 1 นาที
          await processTriggerEvent(client, supabase, user, "voice_duration", {
            channelId: vs.channelId,
            memberCount,
            amount: 1
          });
        }
      }
    } catch (err) {
      console.error("[dailyQuest] Voice minute ticker error:", err);
    }
  }, 60 * 1000);

  // ─── 4. ดักจับการใช้คำสั่ง Slash Command (command_usage) ────────────
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (!interaction || !interaction.isChatInputCommand?.() || interaction.user?.bot) return;

      await processTriggerEvent(client, supabase, interaction.user, "command_usage", {
        commandName: interaction.commandName,
        channelId: interaction.channelId,
        amount: 1
      });
    } catch (err) {
      console.error("[dailyQuest] InteractionCreate command_usage trigger error:", err.message);
    }
  });
}

module.exports = { setupQuestTriggers };
