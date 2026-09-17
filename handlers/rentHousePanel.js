// handlers/rentHousePanel.js
// Controller / Interaction Handler สำหรับแผงตั้งค่าและจัดการสิทธิ์ "บ้านเช่าหมี" (Refactored 3-Tier)

const {
  RENT_CUSTOM_IDS,
  createV2CardResponse,
  createRentHousePanelPayload,
  buildRentNameModal,
  buildRentLimitModal,
  buildRentImageModal,
  buildRentPresetRenameModal,
  buildUserSelectMenuPayload,
} = require("../src/features/rentHouse/components/rentHousePayloads");

const {
  RENT_HOUSE_CATEGORY_ID,
  isRentHouseOwner,
  getRentHouseOwnerId,
  getRentHouseContract,
  toggleRentHouseLock,
  toggleRentHouseHide,
  getRentHousePermissionsInfo,
  processRentUserSelect,
  saveRentHouseImage,
  syncRentHousePermissions,
} = require("../src/features/rentHouse/services/rentHouseService");

const { safeShowModal, safeDisconnectMember } = require("../utils/discordSafety");
const { safeSetChannelName } = require("../utils/channelRenameGuard");
const { getRandomSessionAd, getGlobalCtaButton } = require("../src/services/sessionAdsService");
const {
  getRentHousePresets,
  saveRentHousePresets,
  buildPresetSwitchPayload,
  buildPresetManagePayload,
  createQuotaFullResponse,
  checkPresetSwitchCooldown,
  setPresetSwitchCooldown,
  createCooldownResponse,
  getUnauthorizedVoiceMembers,
  buildEvictionConfirmPayload,
} = require("../utils/permissionPresets");
const { getSupabaseClient } = require("../src/services/supabaseClient");

const SPECIAL_IMAGE_ROLE_ID = "1383998275711012956";

async function buildRentPanelPayloadWithAds(member, channel, forcedImageUrl = null) {
  let ownerMember = member;
  if (channel) {
    const ownerId = await getRentHouseOwnerId(channel);
    if (ownerId && (!ownerMember || ownerMember.id !== ownerId)) {
      const g = channel.guild;
      const fetched = g ? (g.members.cache.get(ownerId) || (await g.members.fetch(ownerId).catch(() => null))) : null;
      if (fetched) {
        ownerMember = fetched;
      } else if (!ownerMember) {
        ownerMember = `<@${ownerId}>`;
      }
    }
  }

  let customImageUrl = forcedImageUrl;
  if (!customImageUrl && channel) {
    const isSpecialRole = ownerMember?.roles?.cache?.has(SPECIAL_IMAGE_ROLE_ID);
    if (isSpecialRole) {
      const setting = await getRentHousePermissionsInfo(channel);
      if (setting?.image_url) {
        customImageUrl = setting.image_url;
      }
    }
  }

  let randomAd = null;
  let ctaBtn = null;
  if (!customImageUrl) {
    randomAd = await getRandomSessionAd();
    ctaBtn = await getGlobalCtaButton();
  }

  return createRentHousePanelPayload(ownerMember || "เจ้าของบ้านเช่า", customImageUrl, randomAd, ctaBtn);
}

async function sendRentHousePanel(channel, ownerMember) {
  if (!channel || typeof channel.send !== "function") return null;

  try {
    const payload = await buildRentPanelPayloadWithAds(ownerMember || "เจ้าของบ้านเช่า", channel);
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
  if (!interaction.isUserSelectMenu() && !interaction.isStringSelectMenu() && !interaction.isModalSubmit() && !interaction.isButton()) return false;

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
      const resetPayload = await buildRentPanelPayloadWithAds(null, channel);
      await interaction.update(resetPayload).catch(() => {});
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

    const memberSetting = await getRentHousePermissionsInfo(channel);
    const hasImageRole = interaction.member?.roles?.cache?.has(SPECIAL_IMAGE_ROLE_ID);
    const activeCustomImg = (hasImageRole && memberSetting?.image_url) ? memberSetting.image_url : null;

    if (selected === "rh_opt_name") {
      if (!interaction.replied && !interaction.deferred) {
        const modal = buildRentNameModal(channel.name);
        await safeShowModal(interaction, modal);
        const updatedPayload = await buildRentPanelPayloadWithAds(interaction.member, channel, activeCustomImg);
        await interaction.message?.edit(updatedPayload).catch(() => {});
        return true;
      }
      return false;
    }

    if (selected === "rh_opt_limit") {
      if (!interaction.replied && !interaction.deferred) {
        const modal = buildRentLimitModal(channel.userLimit ?? 0);
        await safeShowModal(interaction, modal);
        const updatedPayload = await buildRentPanelPayloadWithAds(interaction.member, channel, activeCustomImg);
        await interaction.message?.edit(updatedPayload).catch(() => {});
        return true;
      }
      return false;
    }

    if (selected === "rh_opt_image") {
      if (!hasImageRole) {
        await interaction.deferUpdate().catch(() => {});
        return await sendInteractionResponse(
          interaction,
          createV2CardResponse(
            "การเข้าถึงถูกปฏิเสธ",
            `> ❌ ขออภัยค่ะ ฟังก์ชันตั้งค่ารูปภาพแผงสงวนสิทธิ์เฉพาะสมาชิกที่มีบทบาท <@&${SPECIAL_IMAGE_ROLE_ID}> เท่านั้นนะคะ`,
            "🔒"
          )
        );
      }

      if (!interaction.replied && !interaction.deferred) {
        const modal = buildRentImageModal(memberSetting?.image_url || "");
        await safeShowModal(interaction, modal);
        const updatedPayload = await buildRentPanelPayloadWithAds(interaction.member, channel, activeCustomImg);
        await interaction.message?.edit(updatedPayload).catch(() => {});
        return true;
      }
      return false;
    }

    const updatedPayload = await buildRentPanelPayloadWithAds(interaction.member, channel, activeCustomImg);
    await interaction.update(updatedPayload).catch(() => {});

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

      case "rh_opt_trust": {
        const setting = await getRentHousePermissionsInfo(channel);
        const currentCount = setting?.trusted_user_ids?.length || 0;
        const remaining = 15 - currentCount;
        if (remaining <= 0) {
          return await sendInteractionResponse(interaction, createQuotaFullResponse("Trust", 15, "บ้านเช่าส่วนตัว"));
        }
        return await sendInteractionResponse(
          interaction,
          buildUserSelectMenuPayload(
            RENT_CUSTOM_IDS.selectTrust,
            `เลือกสมาชิกที่ต้องการให้อนุญาตเข้าห้อง (เพิ่มได้อีก ${remaining} คน)`,
            Math.min(remaining, 25)
          )
        );
      }

      case "rh_opt_untrust":
        return await sendInteractionResponse(interaction, buildUserSelectMenuPayload(RENT_CUSTOM_IDS.selectUntrust, "เลือกสมาชิกที่ต้องการยกเลิกการอนุญาต (เลือกได้หลายคน)", 25));

      case "rh_opt_kick":
        return await sendInteractionResponse(interaction, buildUserSelectMenuPayload(RENT_CUSTOM_IDS.selectKick, "เลือกสมาชิกที่ต้องการเตะออกจากห้อง (เลือกได้หลายคน)", 25));

      case "rh_opt_permissions": {
        const setting = await getRentHousePermissionsInfo(channel);
        const trustedIds = setting?.trusted_user_ids || [];
        const trustedCount = trustedIds.length;
        const trustedList = trustedCount > 0 ? trustedIds.map((id) => `<@${id}> (\`${id}\`)`).join("\n> ") : "*ไม่มี*";

        const contentLines = [
          `> (🏠)︰**ชื่อห้อง:** <#${channel.id}>`,
          `> (🔒)︰**สถานะล็อค:** ${setting?.locked ? "🔒 ล็อคอยู่" : "🔓 เปิดปกติ"}`,
          `> (👀)︰**สถานะซ่อน:** ${setting?.hidden ? "👀 ซ่อนอยู่" : "👁️ มองเห็นปกติ"}`,
          ``,
          `### ➕ สมาชิกที่ได้รับอนุญาตพิเศษ (Trust): \`${trustedCount} / 15 คน\` *(ว่างอีก ${Math.max(0, 15 - trustedCount)} ที่)*`,
          `> ${trustedList}`,
        ];

        return await sendInteractionResponse(
          interaction,
          createV2CardResponse("รายการสิทธิ์สมาชิกในบ้านเช่า", contentLines.join("\n"), "📋")
        );
      }

      case "rh_opt_preset_switch": {
        const currentSetting = (await getRentHousePermissionsInfo(channel)) || {};
        const presets = await getRentHousePresets(channel.id, currentSetting);
        return await sendInteractionResponse(
          interaction,
          buildPresetSwitchPayload(presets, "rh_select_apply_preset")
        );
      }

      case "rh_opt_preset_manage": {
        const currentSetting = (await getRentHousePermissionsInfo(channel)) || {};
        const presets = await getRentHousePresets(channel.id, currentSetting);
        return await sendInteractionResponse(
          interaction,
          buildPresetManagePayload(presets, "rh_p")
        );
      }

      default:
        return false;
    }
  }

  // Helper สำหรับบันทึกและซิงค์ Preset เข้าห้องบ้านเช่า
  async function applyRentHousePresetToChannel(targetPreset) {
    const currentSetting = (await getRentHousePermissionsInfo(channel)) || {};
    const presets = await getRentHousePresets(channel.id, currentSetting);
    const updatedSetting = {
      channel_id: channel.id,
      owner_id: currentSetting.owner_id || interaction.user.id,
      locked: targetPreset.locked,
      hidden: targetPreset.hidden,
      trusted_user_ids: targetPreset.trustedUserIds,
      blocked_user_ids: targetPreset.blockedUserIds,
      image_url: currentSetting.image_url || null,
      permission_presets: presets,
      updated_at: new Date().toISOString(),
    };

    const supabase = getSupabaseClient();
    if (supabase) {
      await supabase.from("rent_house_settings").upsert(updatedSetting);
    }

    await syncRentHousePermissions(channel, updatedSetting);
    if (Number.isInteger(targetPreset.limit)) {
      await channel.setUserLimit(targetPreset.limit).catch(() => {});
    }

    const refreshedPayload = await buildRentPanelPayloadWithAds(interaction.member, channel, currentSetting.image_url);
    if (refreshedPayload) {
      channel.messages.fetch({ limit: 5 }).then((msgs) => {
        const panelMsg = msgs.find((m) => m.author.id === interaction.client.user.id && (m.flags?.has(32768) || m.flags?.bitfield === 32768));
        if (panelMsg) panelMsg.edit(refreshedPayload).catch(() => {});
      }).catch(() => {});
    }

    setPresetSwitchCooldown(channel.id);
    return updatedSetting;
  }

  // 1.1 สลับ Preset ของบ้านเช่า
  if (interaction.isStringSelectMenu() && customId === "rh_select_apply_preset") {
    // ตรวจสอบคูลดาวน์ 15 วินาที
    const cooldown = checkPresetSwitchCooldown(channel.id);
    if (cooldown.onCooldown) {
      return await sendInteractionResponse(interaction, createCooldownResponse(cooldown.remainingSeconds));
    }

    const presetId = interaction.values[0];
    const currentSetting = (await getRentHousePermissionsInfo(channel)) || {};
    const presets = await getRentHousePresets(channel.id, currentSetting);
    const targetPreset = presets.find((p) => p.id === presetId);
    if (!targetPreset) {
      return await sendInteractionResponse(interaction, createV2CardResponse("ไม่พบ Preset", "> ❌ ไม่พบการตั้งค่า Preset ที่เลือกค่ะ", "⚠️"));
    }

    // ตรวจสอบสมาชิกที่ไม่มีสิทธิ์ใน Preset ใหม่
    const unauthorized = getUnauthorizedVoiceMembers(channel, targetPreset, currentSetting.owner_id || interaction.user.id);
    if (unauthorized.length > 0) {
      return await sendInteractionResponse(
        interaction,
        buildEvictionConfirmPayload(targetPreset, unauthorized, "rh_confirm")
      );
    }

    await applyRentHousePresetToChannel(targetPreset);

    return await sendInteractionResponse(
      interaction,
      createV2CardResponse(
        "สลับ Preset สำเร็จ",
        `> ✨ สลับการตั้งค่าบ้านเช่าตาม **${targetPreset.name}** เรียบร้อยแล้วค่ะ!\n\n` +
        `> 👥 **สมาชิกที่อนุญาต:** \`${targetPreset.trustedUserIds.length} คน\`\n` +
        `> 🔒 **สถานะห้อง:** \`${targetPreset.locked ? "ล็อค" : "ไม่ล็อค"} / ${targetPreset.hidden ? "ซ่อน" : "มองเห็น"}\`\n` +
        `> 🔢 **จำกัดจำนวน:** \`${targetPreset.limit > 0 ? `${targetPreset.limit} คน` : "ไม่จำกัด"}\``,
        "✨"
      )
    );
  }

  // 1.1.1 ปุ่มยืนยันการจัดการสมาชิกเมื่อสลับ Preset (Kick / Soft Lock / Cancel)
  if (interaction.isButton() && customId.startsWith("rh_confirm_")) {
    if (customId === "rh_confirm_cancel") {
      return await sendInteractionResponse(
        interaction,
        createV2CardResponse("ยกเลิกการสลับ Preset", "> ❌ ยกเลิกการสลับ Preset เรียบร้อยแล้วค่ะ บ้านเช่ายังคงใช้การตั้งค่าเดิม", "ℹ️")
      );
    }

    const cooldown = checkPresetSwitchCooldown(channel.id);
    if (cooldown.onCooldown) {
      return await sendInteractionResponse(interaction, createCooldownResponse(cooldown.remainingSeconds));
    }

    const isKick = customId.startsWith("rh_confirm_kick_");
    const presetId = customId.replace(isKick ? "rh_confirm_kick_" : "rh_confirm_keep_", "");
    const currentSetting = (await getRentHousePermissionsInfo(channel)) || {};
    const presets = await getRentHousePresets(channel.id, currentSetting);
    const targetPreset = presets.find((p) => p.id === presetId);

    if (!targetPreset) {
      return await sendInteractionResponse(interaction, createV2CardResponse("ไม่พบ Preset", "> ❌ ไม่พบการตั้งค่า Preset ที่เลือกค่ะ", "⚠️"));
    }

    let actionSummary = "";
    if (isKick) {
      const unauthorized = getUnauthorizedVoiceMembers(channel, targetPreset, currentSetting.owner_id || interaction.user.id);
      let kickedCount = 0;
      for (const m of unauthorized) {
        const disconnected = await safeDisconnectMember(m, "Rent house owner switched preset (kick unauthorized)");
        if (disconnected) kickedCount++;
      }
      actionSummary = `> 🚪 **จัดการสมาชิก:** เตะสมาชิกที่ไม่มีสิทธิ์ออกจากห้องแล้ว \`${kickedCount} คน\`\n`;
    } else {
      actionSummary = `> ⏳ **จัดการสมาชิก:** อนุญาตให้สมาชิกเดิมอยู่ต่อได้จนกว่าจะออกเอง (ไม่สามารถเข้ากลับมาใหม่ได้)\n`;
    }

    await applyRentHousePresetToChannel(targetPreset);

    return await sendInteractionResponse(
      interaction,
      createV2CardResponse(
        "สลับ Preset สำเร็จ",
        `> ✨ สลับการตั้งค่าบ้านเช่าตาม **${targetPreset.name}** เรียบร้อยแล้วค่ะ!\n` +
        `${actionSummary}\n` +
        `> 👥 **สมาชิกที่อนุญาต:** \`${targetPreset.trustedUserIds.length} คน\`\n` +
        `> 🔒 **สถานะห้อง:** \`${targetPreset.locked ? "ล็อค" : "ไม่ล็อค"} / ${targetPreset.hidden ? "ซ่อน" : "มองเห็น"}\`\n` +
        `> 🔢 **จำกัดจำนวน:** \`${targetPreset.limit > 0 ? `${targetPreset.limit} คน` : "ไม่จำกัด"}\``,
        "✨"
      )
    );
  }

  // 1.2 ปุ่มจัดการ Preset ของบ้านเช่า
  if (interaction.isButton() && customId.startsWith("rh_p_")) {
    const parts = customId.split("_"); // ["rh", "p", "action", "num"]
    const action = parts[2];
    const num = parseInt(parts[3], 10);
    const presets = await getRentHousePresets(channel.id);
    const targetPreset = presets[num - 1];

    if (action === "rename") {
      const modal = buildRentPresetRenameModal(`rh_modal_rename_preset_${num}`, num, targetPreset?.name);
      await safeShowModal(interaction, modal);
      return true;
    }

    if (action === "save") {
      const currentSetting = (await getRentHousePermissionsInfo(channel)) || {};
      presets[num - 1].trustedUserIds = currentSetting.trusted_user_ids || [];
      presets[num - 1].blockedUserIds = currentSetting.blocked_user_ids || [];
      presets[num - 1].locked = Boolean(currentSetting.locked);
      presets[num - 1].hidden = Boolean(currentSetting.hidden);
      presets[num - 1].limit = channel.userLimit || 0;

      await saveRentHousePresets(channel.id, presets);
      return await sendInteractionResponse(
        interaction,
        createV2CardResponse(
          "บันทึก Preset สำเร็จ",
          `> 💾 บันทึกสิทธิ์บ้านเช่าปัจจุบันลงใน **Preset ${num} (${presets[num - 1].name})** เรียบร้อยแล้วค่ะ!`,
          "💾"
        )
      );
    }

    if (action === "reset") {
      presets[num - 1] = {
        id: `preset_${num}`,
        name: `Preset ${num}`,
        limit: 0,
        locked: false,
        hidden: false,
        trustedUserIds: [],
        blockedUserIds: [],
      };
      await saveRentHousePresets(channel.id, presets);
      return await sendInteractionResponse(
        interaction,
        createV2CardResponse(
          "ล้าง Preset สำเร็จ",
          `> 🗑️ รีเซ็ตการตั้งค่า **Preset ${num}** กลับเป็นค่าเริ่มต้นเรียบร้อยแล้วค่ะ`,
          "🗑️"
        )
      );
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
    if (customId.startsWith("rh_modal_rename_preset_")) {
      const num = parseInt(customId.replace("rh_modal_rename_preset_", ""), 10);
      const newName = interaction.fields.getTextInputValue("preset_name_input").trim().slice(0, 50);
      if (!newName) {
        return await sendInteractionResponse(interaction, createV2CardResponse("ข้อมูลไม่ถูกต้อง", "> ❌ กรุณาระบุชื่อ Preset ค่ะ", "⚠️"));
      }

      const presets = await getRentHousePresets(channel.id);
      if (presets[num - 1]) {
        presets[num - 1].name = newName;
        await saveRentHousePresets(channel.id, presets);
      }

      return await sendInteractionResponse(
        interaction,
        createV2CardResponse(
          "เปลี่ยนชื่อ Preset สำเร็จ",
          `> ✏️ เปลี่ยนชื่อ **Preset ${num}** เป็น **${newName}** เรียบร้อยแล้วค่ะ`,
          "✏️"
        )
      );
    }

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

    if (customId === RENT_CUSTOM_IDS.modalImage) {
      const member = interaction.member;
      if (!member || !member.roles.cache.has(SPECIAL_IMAGE_ROLE_ID)) {
        return await sendInteractionResponse(
          interaction,
          createV2CardResponse(
            "การเข้าถึงถูกปฏิเสธ",
            `> ❌ ขออภัยค่ะ ฟังก์ชันตั้งค่ารูปภาพแผงสงวนสิทธิ์เฉพาะสมาชิกที่มีบทบาท <@&${SPECIAL_IMAGE_ROLE_ID}> เท่านั้นนะคะ`,
            "🔒"
          )
        );
      }

      const input = interaction.fields.getTextInputValue("panel_image_url").trim();
      let newImageUrl = null;
      const isReset = input.toLowerCase() === "reset" || input.toLowerCase() === "default";

      if (!isReset) {
        if (!input.startsWith("https://")) {
          return await sendInteractionResponse(
            interaction,
            createV2CardResponse(
              "ข้อมูลไม่ถูกต้อง",
              "> ❌ ลิงก์รูปภาพไม่ถูกต้องค่ะ ต้องขึ้นต้นด้วย `https://` เท่านั้นนะคะ",
              "⚠️"
            )
          );
        }
        newImageUrl = input;
      }

      // 1. บันทึกรูปบ้านเช่า และ Auto-Sync ไปยังห้อง VIP
      await saveRentHouseImage(channel.id, interaction.user.id, newImageUrl);

      // 2. รีเฟรชรูปภาพบนข้อความแผงควบคุมในห้องทันที
      try {
        const messages = await channel.messages.fetch({ limit: 10 });
        const botMsg = messages.find((m) => m.author.id === interaction.client.user.id && (m.flags?.has(32768) || m.flags?.bitfield === 32768));
        if (botMsg) {
          const updatedPayload = await buildRentPanelPayloadWithAds(member, channel, newImageUrl);
          await botMsg.edit(updatedPayload);
        }
      } catch (err) {
        console.warn("[rentHousePanel] Failed to edit existing panel message:", err.message);
      }

      return await sendInteractionResponse(
        interaction,
        createV2CardResponse(
          isReset ? "รีเซ็ตรูปภาพสำเร็จ" : "ตั้งค่ารูปภาพสำเร็จ",
          isReset
            ? "> ✅ รีเซ็ตรูปภาพแผงควบคุมกลับเป็นภาพเริ่มต้นเรียบร้อยแล้วค่ะ"
            : `> ✅ ตั้งค่ารูปภาพแผงควบคุมเรียบร้อยแล้วค่ะ! (มีผลกับทั้งบ้านเช่าและห้อง VIP ของคุณ)\n> 🔗 ลิงก์: ${newImageUrl}`,
          "🖼️"
        )
      );
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
