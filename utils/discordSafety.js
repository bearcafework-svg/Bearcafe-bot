const UNKNOWN_CHANNEL = 10003;
const UNKNOWN_MESSAGE = 10008;
const UNKNOWN_INTERACTION = 10062;
const INTERACTION_ALREADY_ACKNOWLEDGED = 40060;
const TARGET_USER_NOT_CONNECTED = 40032;
const EPHEMERAL_FLAG = 64;

function isDiscordCode(error, codes) {
  return codes.includes(error?.code) || codes.includes(error?.rawError?.code);
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

async function safeDeferReply(interaction, options = {}) {
  if (!interaction || interaction.replied || interaction.deferred) return true;

  try {
    await interaction.deferReply(ephemeral(options));
    return true;
  } catch (error) {
    if (!isDiscordCode(error, [INTERACTION_ALREADY_ACKNOWLEDGED, UNKNOWN_INTERACTION])) {
      console.error("[discordSafety] deferReply failed:", error);
    }
    return false;
  }
}

async function safeRespond(interaction, payload = {}) {
  if (!interaction) return false;

  const sanitized = sanitizeDiscordPayload(payload);

  try {
    if (interaction.deferred && !interaction.replied) {
      await interaction.editReply(sanitized);
    } else if (interaction.replied || interaction.deferred) {
      await interaction.followUp(ephemeral(sanitized));
    } else {
      await interaction.reply(ephemeral(sanitized));
    }
    return true;
  } catch (error) {
    if (!isDiscordCode(error, [INTERACTION_ALREADY_ACKNOWLEDGED, UNKNOWN_INTERACTION, UNKNOWN_CHANNEL, UNKNOWN_MESSAGE])) {
      console.error("[discordSafety] interaction response failed:", error);
    }
    return false;
  }
}

async function safeEditReply(interaction, payload = {}) {
  if (!interaction) return false;
  if (!interaction.deferred && !interaction.replied) return false;

  const sanitized = sanitizeDiscordPayload(payload);

  try {
    await interaction.editReply(sanitized);
    return true;
  } catch (error) {
    if (!isDiscordCode(error, [INTERACTION_ALREADY_ACKNOWLEDGED, UNKNOWN_INTERACTION, UNKNOWN_CHANNEL, UNKNOWN_MESSAGE])) {
      console.error("[discordSafety] editReply failed:", error);
    }
    return false;
  }
}

async function safeFollowUp(interaction, payload = {}) {
  if (!interaction) return false;

  const sanitized = sanitizeDiscordPayload(payload);

  try {
    await interaction.followUp(ephemeral(sanitized));
    return true;
  } catch (error) {
    if (!isDiscordCode(error, [INTERACTION_ALREADY_ACKNOWLEDGED, UNKNOWN_INTERACTION, UNKNOWN_CHANNEL, UNKNOWN_MESSAGE])) {
      console.error("[discordSafety] followUp failed:", error);
    }
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
    if (!isDiscordCode(error, [INTERACTION_ALREADY_ACKNOWLEDGED, UNKNOWN_INTERACTION])) {
      console.error("[discordSafety] showModal failed:", error);
    }
    return false;
  }
}

async function safeUpdate(interaction, payload = {}) {
  if (!interaction) return false;
  if (interaction.replied || interaction.deferred) {
    return await safeRespond(interaction, payload);
  }

  const sanitized = sanitizeDiscordPayload(payload);

  try {
    await interaction.update(sanitized);
    return true;
  } catch (error) {
    if (!isDiscordCode(error, [INTERACTION_ALREADY_ACKNOWLEDGED, UNKNOWN_INTERACTION, UNKNOWN_CHANNEL])) {
      console.error("[discordSafety] update failed:", error);
    }
    return false;
  }
}

async function safeDeferUpdate(interaction) {
  if (!interaction || interaction.replied || interaction.deferred) return true;

  try {
    await interaction.deferUpdate();
    return true;
  } catch (error) {
    if (!isDiscordCode(error, [INTERACTION_ALREADY_ACKNOWLEDGED, UNKNOWN_INTERACTION])) {
      console.error("[discordSafety] deferUpdate failed:", error);
    }
    return false;
  }
}

module.exports = {
  EPHEMERAL_FLAG,
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
};
