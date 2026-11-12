const UNKNOWN_CHANNEL = 10003;
const UNKNOWN_MESSAGE = 10008;
const UNKNOWN_INTERACTION = 10062;
const INTERACTION_ALREADY_ACKNOWLEDGED = 40060;
const TARGET_USER_NOT_CONNECTED = 40032;
const EPHEMERAL_FLAG = 64;

function isDiscordCode(error, codes) {
  return codes.includes(error?.code) || codes.includes(error?.rawError?.code);
}

function isTransientDiscordError(error) {
  if (!error) return false;
  const status = error.status ?? error.httpStatus ?? error.rawError?.status;
  if (typeof status === "number" && status >= 500 && status < 600) return true;

  const netCodes = ["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT", "ECONNREFUSED"];
  if (netCodes.includes(error.code)) return true;

  const msg = String(error.message || "");
  return msg.includes("Service Unavailable") || msg.includes("Bad Gateway") || msg.includes("Gateway Timeout");
}

function formatInteractionContext(interaction) {
  if (!interaction) return "[Guild:unknown]";
  const guildId = interaction.guildId || interaction.guild?.id || "DM";
  const channelId = interaction.channelId || "-";
  const userId = interaction.user?.id || "-";
  const ref = interaction.commandName || interaction.customId || "-";
  return `[Guild:${guildId} | Ch:${channelId} | User:${userId} | Ref:${ref}]`;
}

function logDiscordSafetyError(label, interaction, error, ignoredCodes = [INTERACTION_ALREADY_ACKNOWLEDGED, UNKNOWN_INTERACTION]) {
  if (!error) return;
  if (isDiscordCode(error, ignoredCodes)) return;

  const ctx = formatInteractionContext(interaction);
  if (isTransientDiscordError(error)) {
    const status = error.status ?? error.code ?? "5xx";
    console.error(`[discordSafety] ${label} (Transient ${status}) ${ctx}: ${error.message}`);
    return;
  }

  console.error(`[discordSafety] ${label} ${ctx}:`, error.message || error);
}

async function withTransientRetry(fn, { maxRetries = 1, delayMs = 300 } = {}) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      if (attempt < maxRetries && isTransientDiscordError(error)) {
        attempt++;
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      throw error;
    }
  }
}

function ephemeral(options) {
  return { ...options, flags: (options?.flags || 0) | EPHEMERAL_FLAG };
}

/**
 * ลบ custom_id ออกจากปุ่มที่เป็น Link button (style: 5 หรือมี url) โดยอัตโนมัติ
 * เพื่อป้องกัน DiscordAPIError 50035 BUTTON_COMPONENT_CUSTOM_ID_URL_MUTUALLY_EXCLUSIVE
 */
function sanitizeDiscordPayload(obj) {
  if (!obj || typeof obj !== "object") return obj;
  if (typeof obj.toJSON === "function") {
    obj = obj.toJSON();
  }
  if (Array.isArray(obj)) return obj.map(sanitizeDiscordPayload);
  const copy = { ...obj };

  if (copy.type === 2 && (copy.style === 5 || copy.url)) {
    delete copy.custom_id;
    delete copy.customId;
  }

  for (const key of Object.keys(copy)) {
    if (typeof copy[key] === "object" && copy[key] !== null) {
      copy[key] = sanitizeDiscordPayload(copy[key]);
    }
  }
  return copy;
}

/**
 * Defer reply อย่างปลอดภัย พร้อม retry เมื่อ Discord 503
 * @param {import("discord.js").Interaction} interaction
 * @param {object} options สามารถระบุ { ephemeral: false } เพื่อตอบแบบสาธารณะได้ (ค่าเริ่มต้นเป็น Ephemeral)
 */
async function safeDeferReply(interaction, options = {}) {
  if (!interaction || interaction.replied || interaction.deferred) return true;

  const { ephemeral: isEphemeralOption, ...rest } = options || {};
  const deferOptions = isEphemeralOption === false ? rest : ephemeral(rest);

  try {
    await withTransientRetry(() => interaction.deferReply(deferOptions));
    return true;
  } catch (error) {
    logDiscordSafetyError("deferReply failed", interaction, error, [
      INTERACTION_ALREADY_ACKNOWLEDGED,
      UNKNOWN_INTERACTION,
    ]);
    return false;
  }
}

async function safeRespond(interaction, payload = {}) {
  if (!interaction) return false;

  const sanitized = sanitizeDiscordPayload(payload);

  try {
    if (interaction.deferred && !interaction.replied) {
      await withTransientRetry(() => interaction.editReply(sanitized));
    } else if (interaction.replied || interaction.deferred) {
      await withTransientRetry(() => interaction.followUp(ephemeral(sanitized)));
    } else {
      await withTransientRetry(() => interaction.reply(ephemeral(sanitized)));
    }
    return true;
  } catch (error) {
    logDiscordSafetyError("interaction response failed", interaction, error, [
      INTERACTION_ALREADY_ACKNOWLEDGED,
      UNKNOWN_INTERACTION,
      UNKNOWN_CHANNEL,
      UNKNOWN_MESSAGE,
    ]);
    return false;
  }
}

async function safeEditReply(interaction, payload = {}) {
  if (!interaction) return false;
  if (!interaction.deferred && !interaction.replied) return false;

  const sanitized = sanitizeDiscordPayload(payload);

  try {
    await withTransientRetry(() => interaction.editReply(sanitized));
    return true;
  } catch (error) {
    logDiscordSafetyError("editReply failed", interaction, error, [
      INTERACTION_ALREADY_ACKNOWLEDGED,
      UNKNOWN_INTERACTION,
      UNKNOWN_CHANNEL,
      UNKNOWN_MESSAGE,
    ]);
    return false;
  }
}

async function safeFollowUp(interaction, payload = {}) {
  if (!interaction) return false;

  const sanitized = sanitizeDiscordPayload(payload);

  try {
    await withTransientRetry(() => interaction.followUp(ephemeral(sanitized)));
    return true;
  } catch (error) {
    logDiscordSafetyError("followUp failed", interaction, error, [
      INTERACTION_ALREADY_ACKNOWLEDGED,
      UNKNOWN_INTERACTION,
      UNKNOWN_CHANNEL,
      UNKNOWN_MESSAGE,
    ]);
    return false;
  }
}

async function safeDeleteChannel(channel, reason) {
  if (!channel || channel.deleted) return false;

  try {
    const freshChannel = channel.guild?.channels?.cache?.get(channel.id) || channel;
    if (!freshChannel || freshChannel.deleted) return false;
    await freshChannel.delete(reason);
    return true;
  } catch (error) {
    if (!isDiscordCode(error, [UNKNOWN_CHANNEL])) {
      console.error(`[discordSafety] delete channel ${channel.id} failed:`, error.message);
    }
    return false;
  }
}

async function safeMoveMember(member, channel, reason) {
  if (!member?.voice?.channelId || !channel) return false;

  try {
    await member.voice.setChannel(channel, reason);
    return true;
  } catch (error) {
    if (!isDiscordCode(error, [TARGET_USER_NOT_CONNECTED, UNKNOWN_CHANNEL])) {
      console.error(`[discordSafety] move member ${member.id} failed:`, error.message);
    }
    return false;
  }
}

async function safeDisconnectMember(member, reason) {
  if (!member?.voice?.channelId) return false;

  try {
    await member.voice.disconnect(reason);
    return true;
  } catch (error) {
    if (!isDiscordCode(error, [TARGET_USER_NOT_CONNECTED])) {
      console.error(`[discordSafety] disconnect member ${member.id} failed:`, error.message);
    }
    return false;
  }
}

async function safeShowModal(interaction, modal) {
  if (!interaction || interaction.replied || interaction.deferred) return false;

  try {
    await interaction.showModal(modal);
    return true;
  } catch (error) {
    logDiscordSafetyError("showModal failed", interaction, error, [
      INTERACTION_ALREADY_ACKNOWLEDGED,
      UNKNOWN_INTERACTION,
    ]);
    return false;
  }
}

async function safeUpdate(interaction, payload = {}) {
  if (!interaction) return false;
  if (interaction.replied || interaction.deferred) {
    return await safeRespond(interaction, payload);
  }

  const sanitized = sanitizeDiscordPayload(payload);
  // ถอด EPHEMERAL_FLAG ออกเสมอเมื่อเรียก interaction.update เพื่อป้องกัน DiscordAPIError 50035
  if (typeof sanitized.flags === "number" && (sanitized.flags & EPHEMERAL_FLAG)) {
    const cleanedFlags = sanitized.flags & ~EPHEMERAL_FLAG;
    if (cleanedFlags === 0) {
      delete sanitized.flags;
    } else {
      sanitized.flags = cleanedFlags;
    }
  }

  try {
    await withTransientRetry(() => interaction.update(sanitized));
    return true;
  } catch (error) {
    logDiscordSafetyError("update failed", interaction, error, [
      INTERACTION_ALREADY_ACKNOWLEDGED,
      UNKNOWN_INTERACTION,
      UNKNOWN_CHANNEL,
      UNKNOWN_MESSAGE,
    ]);
    return false;
  }
}

async function safeDeferUpdate(interaction) {
  if (!interaction || interaction.replied || interaction.deferred) return true;

  try {
    await withTransientRetry(() => interaction.deferUpdate());
    return true;
  } catch (error) {
    logDiscordSafetyError("deferUpdate failed", interaction, error, [
      INTERACTION_ALREADY_ACKNOWLEDGED,
      UNKNOWN_INTERACTION,
    ]);
    return false;
  }
}

module.exports = {
  EPHEMERAL_FLAG,
  formatInteractionContext,
  isDiscordCode,
  isTransientDiscordError,
  sanitizeDiscordPayload,
  safeDeferReply,
  safeDeferUpdate,
  safeDeleteChannel,
  safeDisconnectMember,
  safeEditReply,
  safeFollowUp,
  safeMoveMember,
  safeRespond,
  safeShowModal,
  safeUpdate,
  withTransientRetry,
};
