// src/commands/createRentHouse.js
// ระบบสร้างห้องบ้านเช่าเสียงส่วนตัวสำหรับสมาชิก (Rent House Room Creation Command)
// รองรับการทำงานผ่านระบบหลังบ้าน: สร้างช่องเสียงตามโหมดประเภทสิทธิ์ผู้ใช้, จัดการสิทธิ์การใช้งานผ่าน PermissionOverrides, และลิงก์ไปยังห้องส่วนตัว

const { Events, ChannelType, PermissionFlagsBits } = require("discord.js");

// Role IDs ที่ได้รับอนุญาตให้ใช้คำสั่งนี้
const COMMAND_ALLOWED_ROLES = [
  "1144676811838599188",
  "1144696486815342673"
];

// หมวดหมู่บ้านเช่า (Category ID) ตามที่ผู้ใช้ระบุ
const PARENT_CATEGORY_ID = "1524122689604816986";

/**
 * ตรวจสอบสิทธิ์ว่าผู้ใช้มียศที่เป็นทีมงานตามที่ระบุไว้หรือไม่
 * @param {GuildMember} member 
 * @returns {boolean}
 */
function hasStaffPermission(member) {
  if (!member) return false;
  return member.roles.cache.some(role => COMMAND_ALLOWED_ROLES.includes(role.id));
}

/**
 * ฟังก์ชันหลักของโมดูลสร้างบ้านเช่า
 * @param {Client} client 
 */
function setupCreateRentHouse(client) {
  // 1. ลงทะเบียน Slash Command เมื่อบอทพร้อม
  client.once("clientReady", async () => {
    try {
      const guildId = process.env.GUILD_ID || "1144251788493602848";
      const guild = client.guilds.cache.get(guildId) || client.guilds.cache.first();

      if (guild) {
        await guild.commands.create({
          name: "สร้างบ้านเช่า",
          description: "สร้างห้อง Voice ส่วนตัวสำหรับสมาชิกที่ระบุ (เฉพาะทีมงาน)",
          options: [
            {
              name: "user",
              description: "เลือกสมาชิกที่ต้องการสร้างบ้านเช่าให้",
              type: 6, // USER
              required: true
            }
          ]
        });
        console.log(`[createRentHouse] Command /สร้างบ้านเช่า registered on guild ${guild.name}.`);
      } else {
        console.warn("[createRentHouse] No guild found for slash command registration.");
      }
    } catch (err) {
      console.error("[createRentHouse] Failed to register slash command:", err.message);
    }
  });

  // 2. จัดการการทำงานของ Interactions
  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isChatInputCommand() && interaction.commandName === "สร้างบ้านเช่า") {
      // ตรวจสอบสิทธิ์ทีมงานที่ใช้คำสั่ง
      if (!hasStaffPermission(interaction.member)) {
        return interaction.reply({
          content: "❌ ขออภัยค่ะ เฉพาะทีมงานที่ได้รับอนุญาตเท่านั้นที่สามารถใช้คำสั่งนี้ได้",
          flags: 64 // Ephemeral
        });
      }

      const targetUser = interaction.options.getUser("user");
      const targetUserId = targetUser.id;
      const username = targetUser.username;

      // 1. ตอบกลับเป็นข้อความกำลังสร้างบ้านหมีก่อน
      try {
        await interaction.reply({
          content: `## <a:bear_hi:1144698250306257037>︲<@${targetUserId}> กำลังสร้างบ้านหมี กรุณารอสักครู่นะคะ . . .`
        });
      } catch (err) {
        console.error("[createRentHouse] Failed to send initial loading reply:", err.message);
        return;
      }

      try {
        const guild = interaction.guild;

        // 2. สร้าง New Voice "🏠︲username" ที่ CategoryID = 1524122689604816986
        const createdChannel = await guild.channels.create({
          name: `🏠︲${username}`,
          type: ChannelType.GuildVoice,
          parent: PARENT_CATEGORY_ID
        });

        // 3. Sync Permission ตามที่ CategoryID
        await createdChannel.lockPermissions();

        // 4. แก้ไขสิทธิ์เฉพาะของผู้ใช้รายนั้น (Add/Deny Permission Overrides)
        await createdChannel.permissionOverwrites.create(targetUserId, {
          [PermissionFlagsBits.AddReactions]: true,
          [PermissionFlagsBits.Speak]: true,
          [PermissionFlagsBits.Stream]: true,
          [PermissionFlagsBits.Connect]: true,
          [PermissionFlagsBits.ManageChannels]: true,
          [PermissionFlagsBits.MoveMembers]: true,
          [PermissionFlagsBits.RequestToSpeak]: true,
          [PermissionFlagsBits.ReadMessageHistory]: true,
          [PermissionFlagsBits.ViewChannel]: true,
          [PermissionFlagsBits.SendMessages]: true,
          [PermissionFlagsBits.SendVoiceMessages]: true,
          [PermissionFlagsBits.UseApplicationCommands]: true,
          [PermissionFlagsBits.UseSoundboard]: true,
          [PermissionFlagsBits.UseVAD]: true,
          [PermissionFlagsBits.DeafenMembers]: true,
          [PermissionFlagsBits.MuteMembers]: true,
          [PermissionFlagsBits.EmbedLinks]: true,
          [PermissionFlagsBits.UseExternalEmojis]: true,
          [PermissionFlagsBits.UseExternalStickers]: true,
          [PermissionFlagsBits.ManageMessages]: true,
          [PermissionFlagsBits.ManageRoles]: true,
          [PermissionFlagsBits.AttachFiles]: true,
          [PermissionFlagsBits.ManageWebhooks]: false
        });

        // 5. แก้ไขข้อความ Content Message เป็นเสร็จเรียบร้อยและแนบลิงก์
        await interaction.editReply({
          content: `## <:2003on:1053984025666125874>︲<@${targetUserId}> ทำการสร้างบ้านหมีเรียบร้อยค่ะ!\n` +
            `- __\`𝐲𝐨𝐮𝐫 𝐡𝐨𝐮𝐬𝐞\`__: https://discord.com/channels/${guild.id}/${createdChannel.id}\n` +
            `- __\`อย่าลืมอ่านก่อนใช้บริการนะคะ\`__: <#1524123699593220146>`
        });

      } catch (err) {
        console.error("[createRentHouse] Error occurred during channel creation process:", err.message);
        
        // ส่งข้อความแจ้งข้อผิดพลาดแบบ Ephemeral หรืออัปเดตข้อความหลัก
        try {
          await interaction.editReply({
            content: `❌ เกิดข้อผิดพลาดในการสร้างห้องบ้านเช่า: ${err.message}`
          });
        } catch (editErr) {
          console.error("[createRentHouse] Failed to send error reply:", editErr.message);
        }
      }
    }
  });

  console.log("[createRentHouse] ✅ ระบบสร้างบ้านเช่าเสียงพร้อมใช้งาน");
}

module.exports = { setupCreateRentHouse };
