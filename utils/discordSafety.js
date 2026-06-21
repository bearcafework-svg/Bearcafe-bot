const UNKNOWN_CHANNEL = 10003;
const UNKNOWN_INTERACTION = 10062;
const INTERACTION_ALREADY_ACKNOWLEDGED = 40060;
const TARGET_USER_NOT_CONNECTED = 40032;
const EPHEMERAL_FLAG = 64;

function isDiscordCode(error, codes) {
  return codes.includes(error?.code) || codes.includes(error?.rawError?.code);
}

function ephemeral(options) {
  return { ...options, flags: options?.flags ?? EPHEMERAL_FLAG };
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

  try {
    if (interaction.deferred && !interaction.replied) {
      await interaction.editReply(payload);
    } else if (interaction.replied || interaction.deferred) {
      await interaction.followUp(ephemeral(payload));
    } else {
      await interaction.reply(ephemeral(payload));
    }
    return true;
  } catch (error) {
    if (!isDiscordCode(error, [INTERACTION_ALREADY_ACKNOWLEDGED, UNKNOWN_INTERACTION, UNKNOWN_CHANNEL])) {
      console.error("[discordSafety] interaction response failed:", error);
    }
    return false;
  }
}

async function safeEditReply(interaction, payload = {}) {
  if (!interaction) return false;
  if (!interaction.deferred && !interaction.replied) return false;

  try {
    await interaction.editReply(payload);
    return true;
  } catch (error) {
    if (!isDiscordCode(error, [INTERACTION_ALREADY_ACKNOWLEDGED, UNKNOWN_INTERACTION, UNKNOWN_CHANNEL])) {
      console.error("[discordSafety] editReply failed:", error);
    }
    return false;
  }
}

async function safeFollowUp(interaction, payload = {}) {
  if (!interaction) return false;

  try {
    await interaction.followUp(ephemeral(payload));
    return true;
  } catch (error) {
    if (!isDiscordCode(error, [INTERACTION_ALREADY_ACKNOWLEDGED, UNKNOWN_INTERACTION, UNKNOWN_CHANNEL])) {
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
  if (!member?.voice?.channel || !channel) return false;

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
  if (!member?.voice?.channel) return false;

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

module.exports = {
  EPHEMERAL_FLAG,
  safeDeferReply,
  safeDeleteChannel,
  safeDisconnectMember,
  safeEditReply,
  safeFollowUp,
  safeMoveMember,
  safeRespond,
};
