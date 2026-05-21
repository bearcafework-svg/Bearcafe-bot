const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits
} = require("discord.js");
const crypto = require("crypto");

const SECRET_CHAT_CATEGORY_ID = "1494308739220770888";
const JOIN_QUEUE_CUSTOM_ID = "btn_join_queue";
const LEAVE_TABLE_CUSTOM_ID = "btn_leave_table";

const tableMembers = new Map();

function buildAllowedPermissions() {
  return [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.AddReactions,
    PermissionFlagsBits.UseExternalEmojis,
    PermissionFlagsBits.UseExternalStickers
  ];
}

function buildLeaveButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(LEAVE_TABLE_CUSTOM_ID)
      .setLabel("🚪 ลุกจากโต๊ะ")
      .setStyle(ButtonStyle.Danger)
  );
}

async function createSecretChatChannel(guild, userAId, userBId) {
  const suffix = crypto.randomBytes(2).toString("hex");
  const allowedPermissions = buildAllowedPermissions();

  const channel = await guild.channels.create({
    name: `☕-โต๊ะลับ-${suffix}`,
    type: ChannelType.GuildText,
    parent: SECRET_CHAT_CATEGORY_ID,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel]
      },
      {
        id: userAId,
        allow: allowedPermissions
      },
      {
        id: userBId,
        allow: allowedPermissions
      }
    ]
  });

  tableMembers.set(channel.id, new Set([userAId, userBId]));

  await channel.send({
    content: `โต๊ะลับพร้อมแล้วค่ะ <@${userAId}> <@${userBId}> ☕`,
    components: [buildLeaveButton()]
  });

  return channel;
}

function setupSecretChat(client) {
  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (!message.guild) return;
    if (message.content.trim() !== "b!reset-match") return;

    try {
      await message.delete();
    } catch (error) {
      console.error("[secret-chat] Failed to delete reset-match command:", error.message);
    }

    const embed = new EmbedBuilder()
      .setColor("#D2B48C")
      .setTitle("☕ โต๊ะลับฉบับ Bear Cafe")
      .setDescription("บรรยากาศคาเฟ่กำลังดีเลย... \nอยากหาใครสักคนจิบชาและนั่งคุยด้วยกันไหมคะ? \n\nกดปุ่มด้านล่างเพื่อรอคิวสุ่มโต๊ะได้เลยค่ะ ระบบจะพาคุณไปที่โต๊ะส่วนตัวทันทีเมื่อเจอเพื่อนที่ว่างอยู่ ✨");

    const joinQueueButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(JOIN_QUEUE_CUSTOM_ID)
        .setLabel("☕ ค้นหาโต๊ะลับ (สุ่มแชท)")
        .setStyle(ButtonStyle.Primary)
    );

    await message.channel.send({
      embeds: [embed],
      components: [joinQueueButton]
    });
  });

  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;

    if (interaction.customId === JOIN_QUEUE_CUSTOM_ID) {
      await interaction.reply({
        content: "กำลังหาที่นั่งว่างให้นะคะ รอสักครู่... ⏳",
        ephemeral: true
      });
      return;
    }

    if (interaction.customId !== LEAVE_TABLE_CUSTOM_ID) return;

    const members = tableMembers.get(interaction.channelId);
    if (members && !members.has(interaction.user.id)) {
      await interaction.reply({
        content: "ปุ่มนี้ใช้ได้เฉพาะคนที่นั่งโต๊ะลับนี้เท่านั้นค่ะ",
        ephemeral: true
      });
      return;
    }

    await interaction.deferUpdate();
    tableMembers.delete(interaction.channelId);
    await interaction.channel.delete(`Secret chat left by ${interaction.user.id}`);
  });
}

module.exports = {
  setupSecretChat,
  createSecretChatChannel
};
