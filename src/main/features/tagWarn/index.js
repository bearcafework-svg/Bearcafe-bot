// ═══════════════════════════════════════════════════════════
//  tagWarn/index.js — ระบบเช็กประวัติความผิด / Violation History
// ═══════════════════════════════════════════════════════════
const { createClient } = require("@supabase/supabase-js");
const { safeRespond } = require("../../../utils/discordSafety");
const sharedConfig = require("../../../sharedSettings.json");

const ALLOWED_ROLES = [
  ...(sharedConfig.role_blacklist || []),
  "1318580353752895583",
];

const BUTTON_CUSTOM_IDS = [
  "btn_check_warn_337990715168526339",
  "p_337990715168526339",
  "check_warn_history",
  "tag_warn_check_self",
];

const FALLBACK_WARN_IMAGE =
  "https://cdn.discordapp.com/attachments/1565840974737973428/1568275494611189790/90faf4784f1eebbb.png";

/**
 * ตรวจสอบความถูกต้องของ URL รูปภาพ หากรูปถูกลบหรือใช้ไม่ได้ ให้ fallback เป็นรูปมาตรฐาน
 */
async function resolveWarnImageUrl(imageUrl) {
  if (!imageUrl || typeof imageUrl !== "string" || !imageUrl.startsWith("http")) {
    return FALLBACK_WARN_IMAGE;
  }
  try {
    const res = await fetch(imageUrl, {
      method: "HEAD",
      signal: AbortSignal.timeout(1200),
    });
    if (res.ok) return imageUrl;
  } catch (err) {
    // เกิด timeout หรือ network error ถือว่าภาพไม่พร้อมใช้งาน
  }
  return FALLBACK_WARN_IMAGE;
}

/**
 * แปลงข้อความบทลงโทษเป็น Emoji & Role Ping
 */
function formatPunish(punishText) {
  if (!punishText) return "(🚨)︰ไม่ระบุบทลงโทษ";
  if (punishText.includes("ミ ชาเขียวเตือนใจ 𓂃 🍵")) {
    return "(<:matcha_bearcafe:1520794424605675611>)︰<@&1318580353752895583>";
  }
  if (punishText.includes("ミ ถ้วยกาแฟ 𓂃 ☕")) {
    return "(<:coffee1_bearcafe:1520794497221660892>)︰<@&1156930837573546126>";
  }
  if (punishText.includes("ミ กาแฟดับเบิ้ลช็อต 𓂃 ☕☕")) {
    return "(<:coffee2_bearcafe:1520794623826726984>)︰<@&1156930842434752614>";
  }
  return `(🚨)︰${punishText}`;
}

/**
 * สร้าง Component V2 Payload หลักสำหรับแผง b!reset-warn
 */
function buildMainPanelPayload() {
  return {
    flags: 32768,
    components: [
      {
        type: 17,
        components: [
          {
            type: 12,
            items: [
              {
                media: {
                  url: "https://cdn.discordapp.com/attachments/1565777850022232075/1568348554400112732/d7c174708015f8e0.png?ex=6aef7de9&is=6aee2c69&hm=f61cb72d572f5611a041cbd27e99f15e755f7d956330946305afd747c96d2e19&",
                },
              },
            ],
          },
          {
            type: 10,
            content:
              "## <:bee20000:1256669436350562355>︲__` 𝖵𝗂𝗈𝗅𝖺𝗍𝗂𝗈𝗇 𝖧𝗂𝗌𝗍𝗈𝗋𝗒 ₊ ประวัติการทำผิดกฎ 𓂃 `__\n" +
              "-# ระบบตรวจสอบประวัติการทำผิดกฎของสมาชิก เพื่อให้ทีมงานสามารถตรวจสอบข้อมูลย้อนหลังได้อย่างสะดวกและรวดเร็ว ช่วยให้ติดตามพฤติกรรมและประวัติการลงโทษได้ง่ายขึ้น เพื่อประกอบการพิจารณาได้อย่างเหมาะสม <:cuteplant:1152834055528783872>",
          },
          {
            type: 14,
            spacing: 2,
          },
          {
            type: 10,
            content:
              "- **` สำหรับผู้ที่มีบทบาทดังต่อไปนี้ `** *!*\n" +
              "  - <:matcha_bearcafe:1520794424605675611>︰<@&1318580353752895583>\n" +
              "  - <:coffee1_bearcafe:1520794497221660892>︰<@&1156930837573546126>\n" +
              "  - <:coffee2_bearcafe:1520794623826726984>︰<@&1156930842434752614>",
          },
          {
            type: 14,
            spacing: 1,
            divider: false,
          },
          {
            type: 1,
            components: [
              {
                style: 2,
                type: 2,
                label: "︲คลิกเช็กประวัติความผิด",
                emoji: {
                  id: "1533982607170080819",
                  name: "445181discordorbsbook",
                  animated: false,
                },
                flow: { actions: [] },
                custom_id: "btn_check_warn_337990715168526339",
              },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * สร้าง Component V2 Payload แสดงประวัติการเตือนล่าสุด
 */
async function buildLatestWarnPayload(warnRecord) {
  const punishFormatted = formatPunish(warnRecord.punish);
  const rawDate = warnRecord.created_at ? new Date(warnRecord.created_at) : new Date();
  const unixTs = Math.floor(rawDate.getTime() / 1000);
  const timeString = `<t:${unixTs}:F> (<t:${unixTs}:R>)`;
  const sequenceStr = warnRecord.sequence !== undefined ? warnRecord.sequence : "-";
  const memberId = warnRecord.member_id || "";
  const warnMessage = warnRecord.message || "ไม่มีระบุ";

  // จัดการรูปภาพหลักฐานและ Fallback หากภาพถูกลบ
  const resolvedUrl = await resolveWarnImageUrl(warnRecord.image_url);
  const isFallback = resolvedUrl === FALLBACK_WARN_IMAGE;

  return {
    flags: 32832, // Component V2 (32768) + Ephemeral (64)
    components: [
      {
        type: 17,
        components: [
          {
            type: 12,
            items: [
              {
                media: { url: resolvedUrl },
                spoiler: isFallback ? false : Boolean(warnRecord.is_spoiler),
              },
            ],
          },
          {
            type: 10,
            content:
              "## <:lowwarning:1548772721679278180>︲__` 𝖫𝖺𝗍𝖾𝗌𝗍 𝖶𝖺𝗋𝗇𝗂𝗇𝗀 ₊ ประวัติการเตือนล่าสุด 𓂃 `__\n" +
              "-# ระบบตรวจสอบประวัติการทำผิดกฎของสมาชิก เพื่อให้ทีมงานสามารถตรวจสอบข้อมูลย้อนหลังได้อย่างสะดวกและรวดเร็ว ช่วยให้ติดตามพฤติกรรมและประวัติการลงโทษได้ง่ายขึ้น เพื่อประกอบการพิจารณาได้อย่างเหมาะสม <:cuteplant:1152834055528783872>",
          },
          {
            type: 14,
            spacing: 2,
          },
          {
            type: 10,
            content:
              `- **\` 📌 เคสอ้างอิง #${sequenceStr} \`** *!*\n` +
              `  - **สาเหตุ:** ${warnMessage}\n` +
              ` > (👤)︰<@${memberId}> — ${memberId}\n` +
              ` > ${punishFormatted}\n` +
              ` > (<a:7596clock:1160230591892029510>)︰${timeString}`,
          },
          {
            type: 14,
            spacing: 1,
            divider: false,
          },
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 5,
                label: "︲แก้ถ้วยความผิด",
                emoji: {
                  id: "1563093703168360479",
                  name: "pingroleicon",
                  animated: false,
                },
                url: "https://discord.com/channels/1144251788493602848/1524123796825706506",
                custom_id: "p_365869186179665921",
              },
            ],
          },
        ],
      },
    ],
  };
}

function setupTagWarn(client) {
  const supabase = createClient(
    process.env.POINTS_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.POINTS_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }
  );

  // ── คำสั่ง b!reset-warn (Owner เท่านั้น) ─────────────────
  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (message.content.trim().toLowerCase() !== "b!reset-warn") return;

    const OWNER_ID = process.env.OWNER_ID;
    if (message.author.id !== OWNER_ID) {
      return message.reply({ content: "❌ คำสั่งนี้ใช้ได้เฉพาะ Owner เท่านั้นค่ะ", flags: 64 });
    }

    try {
      await message.delete().catch(() => {});
      const payload = buildMainPanelPayload();
      await message.channel.send(payload);
    } catch (err) {
      console.error("[tagWarn] reset-warn error:", err);
      message.channel.send("❌ เกิดข้อผิดพลาดในการสร้างแผงประวัติความผิดค่ะ").catch(() => {});
    }
  });

  // ── Interaction: ปุ่ม คลิกเช็กประวัติความผิด ─────────────────
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (!BUTTON_CUSTOM_IDS.includes(interaction.customId)) return;

    try {
      // 1. ตรวจสอบสิทธิ์ยศ
      const memberRoles = interaction.member?.roles?.cache;
      const hasPermission = memberRoles
        ? memberRoles.some((r) => ALLOWED_ROLES.includes(r.id))
        : false;

      if (!hasPermission) {
        return safeRespond(interaction, {
          content: "## <:68440x:1358584606911369226>︲คุณไม่มีบทบาทที่ได้รับการยกเว้นหรืออนุญาตให้เช็กประวัติความผิดค่ะ",
          flags: 64,
        });
      }

      // 2. ดึงข้อมูลประวัติเตือนล่าสุดจาก Supabase
      const userId = interaction.user.id;
      const { data: latestWarn, error } = await supabase
        .from("tag_warn_logs")
        .select("*")
        .eq("member_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("[tagWarn] Supabase fetch error:", error);
        return safeRespond(interaction, {
          content: "❌ เกิดข้อผิดพลาดในการดึงข้อมูลจากระบบค่ะ กรุณาลองใหม่อีกครั้ง",
          flags: 64,
        });
      }

      if (!latestWarn) {
        return safeRespond(interaction, {
          content: "## ✨︲คุณไม่มีประวัติการทำผิดกฎหรือประวัติการเตือนในระบบค่ะ !",
          flags: 64,
        });
      }

      // 3. ตอบกลับข้อมูลประวัติล่าสุดแบบ Ephemeral Component V2
      const payload = await buildLatestWarnPayload(latestWarn);
      return safeRespond(interaction, payload);
    } catch (err) {
      console.error("[tagWarn] interaction error:", err);
      return safeRespond(interaction, {
        content: "❌ เกิดข้อผิดพลาดในระบบค่ะ กรุณาลองใหม่อีกครั้ง",
        flags: 64,
      });
    }
  });
}

module.exports = {
  setupTagWarn,
  buildMainPanelPayload,
  buildLatestWarnPayload,
};
