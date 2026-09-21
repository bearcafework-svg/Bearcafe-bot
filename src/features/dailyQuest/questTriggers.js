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
      const hasMediaLink =
        /https?:\/\/(tenor|giphy|youtube|youtu\.be|spotify|soundcloud|music\.apple)\./i.test(
          content
        );

      if (hasSticker || hasGifAttachment || hasMediaLink) {
        await processTriggerEvent(client, supabase, user, "chat_media", {
          channelId
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
  const activeVoiceUsers = new Map(); // userId -> { channelId, joinedAt }

  // 3.1 ตรวจจับเมื่อผู้ใช้เข้า/ออก/ย้ายห้องเสียง
  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    try {
      const member = newState.member || oldState.member;
      if (!member || member.user?.bot) return;

      const userId = member.user.id;
      const isJoined = !oldState.channelId && Boolean(newState.channelId);
      const isLeft = Boolean(oldState.channelId) && !newState.channelId;
      const isMoved =
        Boolean(oldState.channelId) &&
        Boolean(newState.channelId) &&
        oldState.channelId !== newState.channelId;

      // เมื่อเข้าห้องเสียงใหม่
      if (isJoined) {
        activeVoiceUsers.set(userId, {
          channelId: newState.channelId,
          joinedAt: Date.now()
        });

        // ทริกเกอร์เควสแวะห้องเสียง (voice_join)
        await processTriggerEvent(client, supabase, member.user, "voice_join", {
          channelId: newState.channelId
        });
      }

      // เมื่อย้ายห้องหรือออกจากห้องเสียง
      if (isLeft || isMoved) {
        activeVoiceUsers.delete(userId);

        if (isMoved) {
          activeVoiceUsers.set(userId, {
            channelId: newState.channelId,
            joinedAt: Date.now()
          });
        }
      }
    } catch (err) {
      console.error("[dailyQuest] VoiceStateUpdate trigger error:", err.message);
    }
  });

  // 3.2 Loop ตรวจและสะสมเวลานาทีเสียงทุก ๆ 1 นาที (Minute Tick)
  // ช่วยให้สมาชิกเห็นเวลาอัปเดตแบบเรียลไทม์โดยไม่ต้องออกจากห้องเสียงก่อน
  setInterval(async () => {
    try {
      for (const [userId, session] of activeVoiceUsers.entries()) {
        const guild = client.guilds.cache.first();
        if (!guild) continue;

        const vs = guild.voiceStates.cache.get(userId);
        if (!vs || !vs.channelId) {
          activeVoiceUsers.delete(userId);
          continue;
        }

        // ข้ามห้อง AFK หรือ Category ที่ยกเว้น
        if (vs.channelId === AFK_CATEGORY_OR_CHANNEL_ID || vs.channel?.parentId === AFK_CATEGORY_OR_CHANNEL_ID) {
          continue;
        }

        // ตรวจสอบจำนวนสมาชิกในห้องเสียง
        const memberCount = vs.channel.members.filter((m) => !m.user?.bot).size;

        const user = vs.member?.user || (await client.users.fetch(userId).catch(() => null));
        if (!user) continue;

        // บันทึกสะสม 1 นาที
        await processTriggerEvent(client, supabase, user, "voice_duration", {
          channelId: vs.channelId,
          memberCount,
          amount: 1
        });
      }
    } catch (err) {
      console.error("[dailyQuest] Voice minute ticker error:", err.message);
    }
  }, 60 * 1000);
}

module.exports = { setupQuestTriggers };
