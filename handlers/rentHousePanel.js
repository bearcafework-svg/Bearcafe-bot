// handlers/rentHousePanel.js
// Controller / Interaction Handler สำหรับแผงตั้งค่าและจัดการสิทธิ์ "บ้านเช่าหมี" (Refactored 3-Tier)

const {
  RENT_CUSTOM_IDS,
  createV2CardResponse,
  createRentHousePanelPayload,
  buildRentNameModal,
  buildRentLimitModal,
  buildUserSelectMenuPayload,
} = require("../src/features/rentHouse/components/rentHousePayloads");

const {
  RENT_HOUSE_CATEGORY_ID,
  isRentHouseOwner,
  getRentHouseContract,
  toggleRentHouseLock,
  toggleRentHouseHide,
  getRentHousePermissionsInfo,
  processRentUserSelect,
} = require("../src/features/rentHouse/services/rentHouseService");

const { safeShowModal } = require("../utils/discordSafety");
const { safeSetChannelName } = require("../utils/channelRenameGuard");

async function sendRentHousePanel(channel, ownerMember) {
  if (!channel || typeof channel.send !== "function") return null;

  try {
    const payload = createRentHousePanelPayload(ownerMember || "เจ้าของบ้านเช่า");
    const msg = await channel.send(payload);
    return msg;
  } catch (err) {
    console.error(`[rentHousePanel] Failed to send rent house panel to channel ${channel.id}:`, err.message);
    return null;
  }
}

async function sendInteractionResponse(interaction, payload) {
  if (interaction.replied || interaction.deferred) {
    return await interaction.followUp(payload);
  } else {
    return await interaction.reply(payload);
  }
}

/**
 * จัดการ Interaction ทั้งหมดของแผงควบคุมบ้านเช่า
 */
async function handleRentHousePanelInteraction(interaction) {
  if (!interaction.guild) return false;
  if (!interaction.isUserSelectMenu() && !interaction.isStringSelectMenu() && !interaction.isModalSubmit()) return false;

  const customId = interaction.customId;
  if (!customId || typeof customId !== "string") return false;

  const channel = interaction.channel;
  if (!channel || channel.parentId !== RENT_HOUSE_CATEGORY_ID) return false;

  const isRentHouseCustomId = customId === RENT_CUSTOM_IDS.panelSelect || customId.startsWith("rh_");
  if (!isRentHouseCustomId) return false;

  // ตรวจสอบสิทธิ์เจ้าของห้อง
  const isOwner = await isRentHouseOwner(channel, interaction.user.id);
  if (!isOwner) {
    if (interaction.isModalSubmit()) {
      return await interaction.reply({
        content: "❌ ขออภัยค่ะ เฉพาะเจ้าของบ้านเช่าหลังนี้เท่านั้นที่สามารถตั้งค่าและจัดการห้องได้นะคะ",
        flags: 64
      });
    }

    if (interaction.isStringSelectMenu() && customId === RENT_CUSTOM_IDS.panelSelect) {
      await interaction.update(createRentHousePanelPayload(interaction.member)).catch(() => {});
    } else {
      await interaction.deferUpdate().catch(() => {});
    }

    return await interaction.followUp({
      ...createV2CardResponse("การเข้าถึงถูกปฏิเสธ", "> ❌ ขออภัยค่ะ เฉพาะเจ้าของบ้านเช่าหลังนี้เท่านั้นที่สามารถใช้งานแผงควบคุมได้ค่ะ", "🔒"),
      flags: 64
    });
  }

  // 1. Select Menu หลักของแผงควบคุมบ้านเช่า
  if (interaction.isStringSelectMenu() && customId === RENT_CUSTOM_IDS.panelSelect) {
    const selected = interaction.values[0];

    if (selected === "rh_opt_name") {
      if (!interaction.replied && !interaction.deferred) {
        const modal = buildRentNameModal(channel.name);
        await safeShowModal(interaction, modal);
        await interaction.message?.edit(createRentHousePanelPayload(interaction.member)).catch(() => {});
        return true;
      }
      return false;
    }

    if (selected === "rh_opt_limit") {
      if (!interaction.replied && !interaction.deferred) {
        const modal = buildRentLimitModal(channel.userLimit ?? 0);
        await safeShowModal(interaction, modal);
        await interaction.message?.edit(createRentHousePanelPayload(interaction.member)).catch(() => {});
        return true;
      }
      return false;
    }

    await interaction.update(createRentHousePanelPayload(interaction.member)).catch(() => {});

    switch (selected) {
      case "rh_opt_info":
        return await handleShowContractInfo(interaction);

      case "rh_opt_lock": {
        const willLock = await toggleRentHouseLock(channel, interaction.user.id);
        return await sendInteractionResponse(
          interaction,
          createV2CardResponse(
            willLock ? "สถานะห้อง: ล็อค" : "สถานะห้อง: ปลดล็อค",
            willLock
              ? "> 🔒 ล็อคบ้านเช่าเรียบร้อยแล้วค่ะ สมาชิกทั่วไปจะไม่สามารถเข้าได้"
              : "> 🔓 ปลดล็อคบ้านเช่าเรียบร้อยแล้วค่ะ สมาชิกทั่วไปสามารถเข้าได้",
            willLock ? "🔒" : "🔓"
          )
        );
      }

      case "rh_opt_hide": {
        const willHide = await toggleRentHouseHide(channel, interaction.user.id);
        return await sendInteractionResponse(
          interaction,
          createV2CardResponse(
            willHide ? "สถานะห้อง: ซ่อน" : "สถานะห้อง: เปิดมองเห็น",
            willHide
              ? "> 👀 ซ่อนบ้านเช่าเรียบร้อยแล้วค่ะ สมาชิกทั่วไปจะไม่เห็นห้องนี้"
              : "> 👁️ เปิดมองเห็นบ้านเช่าเรียบร้อยแล้วค่ะ สมาชิกทั่วไปสามารถเห็นห้องนี้ได้",
            willHide ? "👀" : "👁️"
          )
        );
      }

      case "rh_opt_trust":
        return await sendInteractionResponse(interaction, buildUserSelectMenuPayload(RENT_CUSTOM_IDS.selectTrust, "เลือกสมาชิกที่ต้องการให้อนุญาตเข้าห้อง (เลือกได้หลายคน)", 25));

      case "rh_opt_untrust":
        return await sendInteractionResponse(interaction, buildUserSelectMenuPayload(RENT_CUSTOM_IDS.selectUntrust, "เลือกสมาชิกที่ต้องการยกเลิกการอนุญาต (เลือกได้หลายคน)", 25));

      case "rh_opt_kick":
        return await sendInteractionResponse(interaction, buildUserSelectMenuPayload(RENT_CUSTOM_IDS.selectKick, "เลือกสมาชิกที่ต้องการเตะออกจากห้อง (เลือกได้หลายคน)", 25));

      case "rh_opt_permissions": {
        const setting = await getRentHousePermissionsInfo(channel);
        const trustedIds = setting?.trusted_user_ids || [];
        const trustedList = trustedIds.length > 0 ? trustedIds.map((id) => `<@${id}> (\`${id}\`)`).join("\n> ") : "*ไม่มี*";

        const contentLines = [
          `> (🏠)︰**ชื่อห้อง:** <#${channel.id}>`,
          `> (🔒)︰**สถานะล็อค:** ${setting?.locked ? "🔒 ล็อคอยู่" : "🔓 เปิดปกติ"}`,
          `> (👀)︰**สถานะซ่อน:** ${setting?.hidden ? "👀 ซ่อนอยู่" : "👁️ มองเห็นปกติ"}`,
          ``,
          `### ➕ สมาชิกที่ได้รับอนุญาตพิเศษ (Trust):`,
          `> ${trustedList}`,
        ];

        return await sendInteractionResponse(
          interaction,
          createV2CardResponse("รายการสิทธิ์สมาชิกในบ้านเช่า", contentLines.join("\n"), "📋")
        );
      }

      default:
        return false;
    }
  }

  // 2. User Select Menus
  if (interaction.isUserSelectMenu() && customId.startsWith("rh_select_")) {
    const targetUserIds = interaction.values;
    if (!targetUserIds || targetUserIds.length === 0) return false;

    const res = await processRentUserSelect(channel, interaction.user.id, customId, targetUserIds, interaction.guild);

    if (customId === RENT_CUSTOM_IDS.selectTrust) {
      return await sendInteractionResponse(interaction, createV2CardResponse("การจัดการสิทธิ์สำเร็จ", `> ➕ เพิ่มสิทธิ์อนุญาตให้ ${res.processedNames} เรียบร้อยแล้วค่ะ`, "➕"));
    }
    if (customId === RENT_CUSTOM_IDS.selectUntrust) {
      return await sendInteractionResponse(interaction, createV2CardResponse("การจัดการสิทธิ์สำเร็จ", `> ➖ ลบสิทธิ์พิเศษของ ${res.processedNames} เรียบร้อยแล้วค่ะ`, "➖"));
    }
    if (customId === RENT_CUSTOM_IDS.selectKick) {
      const msg = res.kickedNames.length > 0
        ? `> 📤 เตะและถอดสิทธิ์ชั่วคราวของ ${res.processedNames} ออกจากบ้านเช่าเรียบร้อยแล้วค่ะ`
        : `> 📤 ถอดสิทธิ์ชั่วคราวของ ${res.processedNames} เรียบร้อยแล้วค่ะ`;
      return await sendInteractionResponse(interaction, createV2CardResponse("เตะสมาชิกสำเร็จ", msg, "📤"));
    }
  }

  // 3. Modal Submit
  if (interaction.isModalSubmit() && customId.startsWith("rh_modal_")) {
    if (customId === RENT_CUSTOM_IDS.modalName) {
      const newName = interaction.fields.getTextInputValue("room_name").trim();
      if (newName) {
        await safeSetChannelName(channel, newName);
        return await sendInteractionResponse(interaction, createV2CardResponse("เปลี่ยนชื่อห้องสำเร็จ", `> ✏️ เปลี่ยนชื่อบ้านเช่าเป็น **${newName}** เรียบร้อยแล้วค่ะ`, "✏️"));
      }
    }

    if (customId === RENT_CUSTOM_IDS.modalLimit) {
      const rawLimit = interaction.fields.getTextInputValue("user_limit").trim();
      const limit = parseInt(rawLimit, 10);
      if (!isNaN(limit) && limit >= 0 && limit <= 99) {
        await channel.setUserLimit(limit);
        return await sendInteractionResponse(interaction, createV2CardResponse("เปลี่ยนจำนวนคนสำเร็จ", `> 👥 เปลี่ยนจำนวนคนที่เข้าบ้านเช่าเป็น **${limit || "ไม่จำกัด"}** เรียบร้อยแล้วค่ะ`, "👥"));
      }
      return await sendInteractionResponse(interaction, createV2CardResponse("ข้อมูลไม่ถูกต้อง", "> ❌ กรุณาระบุตัวเลขจำนวนคนระหว่าง 0 ถึง 99 ค่ะ", "⚠️"));
    }
  }

  return false;
}

/**
 * ดึงและแสดงข้อมูลสัญญาเช่าบ้าน
 */
async function handleShowContractInfo(interaction) {
  const channelId = interaction.channelId;
  const res = await getRentHouseContract(channelId);

  if (!res.success) {
    return await sendInteractionResponse(interaction, createV2CardResponse("เกิดข้อผิดพลาด", `> ❌ เกิดข้อผิดพลาดในการดึงข้อมูลสัญญา: ${res.error}`, "⚠️"));
  }

  if (!res.contract) {
    return await sendInteractionResponse(interaction, createV2CardResponse("ข้อมูลสัญญาเช่า", "> ℹ️ ไม่พบข้อมูลสัญญาเช่าบ้านสำหรับห้องนี้ในระบบตาราง `contracts` ค่ะ", "📜"));
  }

  const contract = res.contract;
  const startUnix = contract.start_at ? Math.floor(new Date(contract.start_at).getTime() / 1000) : null;
  const endUnix = contract.end_at ? Math.floor(new Date(contract.end_at).getTime() / 1000) : null;
  const createdUnix = contract.created_at ? Math.floor(new Date(contract.created_at).getTime() / 1000) : null;

  const infoLines = [
    `> (👤)︰**ผู้เช่า:** <@${contract.member_id}> (\`${contract.member_id}\`)`,
    `> (📅)︰**วันเริ่มสัญญา:** ${startUnix ? `<t:${startUnix}:F>` : "ไม่ได้ระบุ"}`,
    `> (⏳)︰**วันหมดสัญญา:** ${endUnix ? `<t:${endUnix}:F> (<t:${endUnix}:R>)` : "ไม่มีกำหนดวันหมดอายุ"}`,
    `> (🔗)︰**ลิงก์ห้อง:** ${contract.room_link ? `${contract.room_link}` : "ไม่ได้ระบุ"}`,
    `> (🛠️)︰**ผู้ทำรายการ:** ${contract.operator_name || "ระบบอัตโนมัติ"}`,
    `> (📝)︰**วันที่สร้างสัญญา:** ${createdUnix ? `<t:${createdUnix}:F>` : "ไม่ได้ระบุ"}`,
  ];

  return await sendInteractionResponse(interaction, createV2CardResponse("ข้อมูลสัญญาเช่าบ้าน (Contract Info)", infoLines.join("\n"), "📜"));
}

async function handleRentHousePanelMessage(message) {
  if (!message || !message.guild || message.author.bot) return false;
  const channel = message.channel;
  const content = (message.content || "").toLowerCase().trim();

  if (!channel || channel.parentId !== RENT_HOUSE_CATEGORY_ID) return false;

  const botUser = message.client.user;
  const isMentioned = botUser && message.mentions.has(botUser);
  const isKeyword = content.includes("แผงควบคุม") || content.includes("เรียกแผง") || content === "!panel" || content === "/panel";

  if (!isMentioned && !isKeyword) return false;

  const isOwner = await isRentHouseOwner(channel, message.author.id);
  if (!isOwner) {
    await message.reply(createV2CardResponse("การเข้าถึงถูกปฏิเสธ", "> ❌ ขออภัยค่ะ เฉพาะเจ้าของบ้านเช่าหลังนี้เท่านั้นที่สามารถเรียกแผงควบคุมได้ค่ะ", "🔒")).catch(() => {});
    return true;
  }

  try {
    await sendRentHousePanel(channel, message.member || message.author);
    if (message.deletable) {
      await message.delete().catch(() => {});
    }
    return true;
  } catch (err) {
    console.error(`[rentHousePanel] Error handling message panel trigger:`, err.message);
    return false;
  }
}

module.exports = {
  sendRentHousePanel,
  handleRentHousePanelInteraction,
  handleRentHousePanelMessage,
  isRentHouseOwner,
  RENT_HOUSE_CATEGORY_ID,
};
