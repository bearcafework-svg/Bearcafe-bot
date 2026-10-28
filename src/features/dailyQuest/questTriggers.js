// src/features/dailyQuest/questTriggers.js
// ตัวดักจับและส่งผ่าน Event ของ Discord ไปยัง Daily Quest Engine

const { Events } = require("discord.js");
const { processTriggerEvent, getOrInitDailyQuestSet } = require("./questEngine");
const sharedSettings = require("../../sharedSettings.json");

const AFK_CATEGORY_OR_CHANNEL_ID = "1524122689604816986";
const roleBlacklist = sharedSettings.role_blacklist || [];

function setupQuestTriggers(client, supabase) {
  // ─── 1. ดักจับข้อความในแชท (messageCreate) ────────────────────────
  client.on(Events.MessageCreate, async (message) => {
    try {
      if (!message || message.author?.bot || !message.guild) return;

      const user = message.author;
      const content = message.content || "";
      const channelId = message.channel.id;
      const parentId = message.channel.parentId || null;
      const member = message.member;

      // 1.1 ตรวจสอบ Keyword (เช่น Morning Bear)
      await processTriggerEvent(client, supabase, user, "keyword", {
        text: content,
        channelId,
        parentId,
        member
      });

      // 1.2 เควสส่งข้อความแวะมาคุย (chat_any)
      await processTriggerEvent(client, supabase, user, "chat_any", {
        channelId,
        parentId,
        member
      });

      // 1.3 เควสคุยต่ออีกนิด (chat_count)
      await processTriggerEvent(client, supabase, user, "chat_count", {
        channelId,
        parentId,
        member,
        amount: 1
      });

      // 1.4 เควส Reply ข้อความเพื่อน (chat_reply)
      if (message.reference && message.reference.messageId) {
        await processTriggerEvent(client, supabase, user, "chat_reply", {
          channelId,
          parentId,
          member
        });
      }

      // 1.5 เควสแท็กเพื่อน (chat_mention)
      if (message.mentions && message.mentions.users.size > 0) {
        const mentionsOther = message.mentions.users.some((u) => u.id !== user.id && !u.bot);
        if (mentionsOther) {
          await processTriggerEvent(client, supabase, user, "chat_mention", {
            channelId,
            parentId,
            member
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
          parentId,
          member,
          mediaType: "sticker_or_gif"
        });
      }

      if (hasMusicLink) {
        await processTriggerEvent(client, supabase, user, "chat_media", {
          channelId,
          parentId,
          member,
          mediaType: "music_link"
        });
      }

      // 1.7 เควสใช้อีโมจิของเซิร์ฟเวอร์ (chat_emoji) หรืออีโมจิหมี
      const hasCustomEmoji = /<a?:[a-zA-Z0-9_]+:[0-9]+>/.test(content);
      const hasBearUnicodeEmoji = /[\u{1F9F8}\u{1F43B}\u{1F43C}\u{1F428}]/u.test(content) || /(:bear:|หมี)/i.test(content);
      if (hasCustomEmoji || hasBearUnicodeEmoji) {
        await processTriggerEvent(client, supabase, user, "chat_emoji", {
          channelId,
          parentId,
          member
        });
      }
    } catch (err) {
      console.error("[dailyQuest] messageCreate trigger error:", err.message);
    }
  });

  // ─── 1.8 ดักจับการสร้างกระทู้ในฟอรั่ม (threadCreate) ─────────────────
  client.on(Events.ThreadCreate, async (thread, newlyCreated) => {
    try {
      if (!thread || !thread.guild) return;

      // รอสักครู่เพื่อให้ข้อความแรกของกระทู้ถูกสร้างเสร็จ
      setTimeout(async () => {
        try {
          const starterMessage = await thread.fetchStarterMessage().catch(() => null);
          if (!starterMessage || starterMessage.author?.bot) return;

          const user = starterMessage.author;
          const content = starterMessage.content || "";
          const channelId = thread.id;
          const parentId = thread.parentId || null;
          const member = starterMessage.member;

          const hasMusicLink =
            /https?:\/\/(youtube|youtu\.be|spotify|soundcloud|music\.apple)\./i.test(content);

          if (hasMusicLink) {
            await processTriggerEvent(client, supabase, user, "chat_media", {
              channelId,
              parentId,
              member,
              mediaType: "music_link"
            });
          }
        } catch (innerErr) {
          // ignore starter message fetch error
        }
      }, 1000);
    } catch (err) {
      console.error("[dailyQuest] threadCreate trigger error:", err.message);
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
  // In-Memory Accumulator: เก็บสะสมนาทีเสียงใน RAM เพื่อลด Supabase Writes/Logs 80%+
  const pendingDailyVoiceMinutes = new Map(); // userId -> { user, channelId, parentId, memberCount, member, minutes }
  let lastDailyVoiceFlush = Date.now();
  const DAILY_VOICE_FLUSH_INTERVAL_MS = 5 * 60 * 1000; // Flush ลง Supabase ทุกๆ 5 นาที
  let isDailyFlushing = false;

  async function flushPendingDailyVoice(force = false) {
    if (isDailyFlushing || pendingDailyVoiceMinutes.size === 0) return;

    const now = Date.now();
    if (!force && now - lastDailyVoiceFlush < DAILY_VOICE_FLUSH_INTERVAL_MS) {
      return;
    }

    isDailyFlushing = true;
    try {
      const items = Array.from(pendingDailyVoiceMinutes.values());
      pendingDailyVoiceMinutes.clear();
      lastDailyVoiceFlush = Date.now();

      for (const item of items) {
        if (!item.user || item.minutes <= 0) continue;
        await processTriggerEvent(client, supabase, item.user, "voice_duration", {
          channelId: item.channelId,
          parentId: item.parentId,
          memberCount: item.memberCount,
          amount: item.minutes,
          member: item.member
        });
      }
    } catch (err) {
      console.error("[dailyQuest] flushPendingDailyVoice error:", err.message);
    } finally {
      isDailyFlushing = false;
    }
  }

  // 3.1 ตรวจจับเมื่อผู้ใช้เข้าห้องเสียงใหม่ (voice_join) หรือ ออกห้องเสียง (flush ทันที)
  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    try {
      const member = newState.member || oldState.member;
      if (!member || member.user?.bot) return;

      const userId = member.id;

      // 🚫 ข้ามสมาชิกที่ติด role_blacklist
      const isBlacklisted = member.roles?.cache?.some((r) => roleBlacklist.includes(r.id));
      if (isBlacklisted) return;

      const channel = newState.channel || (newState.channelId ? newState.guild?.channels?.cache?.get(newState.channelId) : null);
      const parentId = channel?.parentId || null;

      // ถ้าออกจากห้องเสียง หรือย้ายเข้าห้อง AFK ให้ flush นาทีที่ค้างอยู่ทันที ไม่ให้แต้มหาย
      const isLeft = oldState.channelId && (!newState.channelId || newState.channelId === AFK_CATEGORY_OR_CHANNEL_ID || parentId === AFK_CATEGORY_OR_CHANNEL_ID);
      if (isLeft && pendingDailyVoiceMinutes.has(userId)) {
        const item = pendingDailyVoiceMinutes.get(userId);
        pendingDailyVoiceMinutes.delete(userId);
        if (item && item.minutes > 0) {
          await processTriggerEvent(client, supabase, item.user, "voice_duration", {
            channelId: item.channelId,
            parentId: item.parentId,
            memberCount: item.memberCount,
            amount: item.minutes,
            member: item.member
          });
        }
      }

      // ถ้าเพิ่งเข้าห้องเสียงใหม่ที่ไม่ใช่ AFK
      const isJoined = !oldState.channelId && Boolean(newState.channelId);
      if (isJoined && newState.channelId !== AFK_CATEGORY_OR_CHANNEL_ID && parentId !== AFK_CATEGORY_OR_CHANNEL_ID) {
        await processTriggerEvent(client, supabase, member.user, "voice_join", {
          channelId: newState.channelId,
          parentId,
          member
        });
      }
    } catch (err) {
      console.error("[dailyQuest] VoiceStateUpdate trigger error:", err.message);
    }
  });

  // 3.2 Loop ตรวจและสะสมเวลานาทีเสียงใน RAM ทุกๆ 1 นาที แล้ว Batch Flush ลง Supabase ทุกๆ 5 นาที
  setInterval(async () => {
    try {
      if (!client.isReady()) return;

      // ⚡ FAST GUARD: ถ้าวันนี้ไม่มีเควส voice_duration ในชุดประจำวัน ไม่ต้องวน loop หรือสะสม
      const { quests } = await getOrInitDailyQuestSet(supabase);
      const hasVoiceQuest = Array.isArray(quests) && quests.some((q) => q.trigger_type === "voice_duration");
      if (!hasVoiceQuest) {
        if (pendingDailyVoiceMinutes.size > 0) pendingDailyVoiceMinutes.clear();
        return;
      }

      for (const guild of client.guilds.cache.values()) {
        // ข้ามเซิร์ฟเวอร์ฮิลใจ
        if (guild.id === "1536199707922141254") continue;

        for (const [userId, vs] of guild.voiceStates.cache) {
          if (!vs.channelId || vs.member?.user?.bot) continue;

          // 🚫 ข้ามสมาชิกที่ติด role_blacklist
          const isBlacklisted = vs.member?.roles?.cache?.some((r) => roleBlacklist.includes(r.id));
          if (isBlacklisted) continue;

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

          // สะสมนาทีลง RAM
          const existing = pendingDailyVoiceMinutes.get(userId);
          if (existing) {
            existing.minutes += 1;
            existing.channelId = vs.channelId;
            existing.parentId = parentId;
            existing.memberCount = memberCount;
            existing.member = vs.member;
          } else {
            pendingDailyVoiceMinutes.set(userId, {
              user,
              channelId: vs.channelId,
              parentId,
              memberCount,
              member: vs.member,
              minutes: 1
            });
          }
        }
      }

      // Flush ข้อมูลเมื่อครบ 5 นาที
      await flushPendingDailyVoice(false);
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
