// src/commands/copyCategoryPerms.js
// ระบบคัดลอกการตั้งค่า Permission Overwrites ของหมวดหมู่ (Copy Category Permissions Command)
// จำกัดการใช้งานเฉพาะเจ้าของเซิร์ฟเวอร์ (Server Owner เท่านั้น)

const { Events, ChannelType, PermissionFlagsBits, MessageFlags } = require("discord.js");

const FLAG_EPHEMERAL = MessageFlags.Ephemeral || 64;

/**
 * ฟังก์ชันหลักของโมดูลคัดลอกสิทธิ์หมวดหมู่
 * @param {Client} client 
 */
const { registerCommand } = require("../interactions/router");

function setupCopyCategoryPerms(client) {
  // จัดการการทำงานของ Slash Command ผ่าน Interaction Router กลาง
  registerCommand("คัดลอกสิทธิ์หมวดหมู่", async (interaction) => {

    // ตรวจสอบสิทธิ์: เฉพาะ Server Owner เท่านั้น
    const isOwner = interaction.guild && interaction.user.id === interaction.guild.ownerId;
    if (!isOwner) {
      return interaction.reply({
        content: "❌ ขออภัยค่ะ เฉพาะเจ้าของเซิร์ฟเวอร์ (Server Owner) เท่านั้นที่สามารถใช้คำสั่งนี้ได้",
        flags: FLAG_EPHEMERAL
      });
    }

    // Defer reply ทันทีเพื่อป้องกัน interaction timeout (3 วินาที)
    await interaction.deferReply({ flags: FLAG_EPHEMERAL });

    try {
      const sourceCategory = interaction.options.getChannel("source");
      const targetCategory = interaction.options.getChannel("target");
      const syncChannels = interaction.options.getBoolean("sync_channels") ?? true;

      // ตรวจสอบประเภทช่อง
      if (sourceCategory.type !== ChannelType.GuildCategory || targetCategory.type !== ChannelType.GuildCategory) {
        return interaction.editReply({
          content: "❌ ทั้งช่องต้นทางและปลายทางต้องเป็นหมวดหมู่ (Category) เท่านั้นค่ะ"
        });
      }

      // ตรวจสอบกรณีเป็นหมวดหมู่เดียวกัน
      if (sourceCategory.id === targetCategory.id) {
        return interaction.editReply({
          content: "❌ หมวดหมู่ต้นทางและปลายทางต้องไม่เป็นหมวดหมู่เดียวกันค่ะ"
        });
      }

      // ดึง Permission Overwrites จาก sourceCategory
      const overwrites = Array.from(sourceCategory.permissionOverwrites.cache.values()).map(ov => ({
        id: ov.id,
        type: ov.type,
        allow: ov.allow.bitfield,
        deny: ov.deny.bitfield
      }));

      // เขียนทับไปยัง targetCategory
      await targetCategory.permissionOverwrites.set(overwrites);

      let syncedCount = 0;
      let syncFailedCount = 0;

      // (ถ้าเลือก sync_channels = true) ลูป Sync สิทธิ์ให้ช่องย่อยใน targetCategory
      if (syncChannels && targetCategory.children && targetCategory.children.cache) {
        for (const [_, childChannel] of targetCategory.children.cache) {
          try {
            await childChannel.lockPermissions();
            syncedCount++;
          } catch (syncErr) {
            console.error(`[copyCategoryPerms] Failed to sync channel ${childChannel.name}:`, syncErr.message);
            syncFailedCount++;
          }
        }
      }

      const syncStatusText = syncChannels
        ? `\n- **ปรับปรุงสิทธิ์ห้องย่อย (Sync)**: สำเร็จ ${syncedCount} ห้อง${syncFailedCount > 0 ? ` (ล้มเหลว ${syncFailedCount} ห้อง)` : ''}`
        : '\n- **การ Sync ห้องย่อย**: ข้ามการทำงานตามที่ระบุ';

      await interaction.editReply({
        content: `✅ **คัดลอกสิทธิ์หมวดหมู่เรียบร้อยแล้วค่ะ!**\n` +
          `- **ต้นทาง**: \`${sourceCategory.name}\` (${overwrites.length} สิทธิ์ยศ/สมาชิก)\n` +
          `- **ปลายทาง**: \`${targetCategory.name}\`${syncStatusText}`
      });

    } catch (err) {
      console.error("[copyCategoryPerms] Error executing command:", err);
      await interaction.editReply({
        content: `❌ เกิดข้อผิดพลาดในการคัดลอกสิทธิ์: \`${err.message}\``
      }).catch(() => {});
    }
  });
}

module.exports = {
  setupCopyCategoryPerms
};
