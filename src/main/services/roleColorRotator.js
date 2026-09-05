// ===================================================
// roleColorRotator.js — ระบบเปลี่ยนสียศแบบไล่สี (Gradient) อัตโนมัติทุก 1 ชม.
// ===================================================

const TARGET_ROLE_ID = "1544807114864857128";
const ROTATE_INTERVAL_MS = 60 * 60 * 1000; // ทุก 1 ชั่วโมง

// คลัง 50 สี ผสมผสานทุกสไตล์ (Cyberpunk, Sunset, Pastel, Ocean, Nature, Galaxy & Gold)
const GRADIENT_COLOR_POOL = [
  "#00F0FF", "#FF007F", "#39FF14", "#FF3366", "#9D00FF",
  "#FFE600", "#FF6EC7", "#00FFA3", "#7928CA", "#FF4500",
  "#FF5E36", "#FF758C", "#FF8C00", "#FFA07A", "#FF5376",
  "#FA709A", "#FEE140", "#E17055", "#F8A5C2", "#F78FB3",
  "#E77F67", "#FDA7DF", "#D980FA", "#B53471", "#FBC531",
  "#FD79A8", "#00D2D3", "#54A0FF", "#48DBFB", "#0ABDE3",
  "#00CEC9", "#81ECEC", "#74B9FF", "#2ED573", "#1DD1A1",
  "#26DE81", "#10AC84", "#A3CB38", "#C4E538", "#55E6C1",
  "#5F27CD", "#341F97", "#8854D0", "#6C5CE7", "#A29BFE",
  "#E056FD", "#FF9FF3", "#F368E0", "#E58E26", "#F6B93B"
];

// ประวัติคู่สีที่เพิ่งใช้ไป (จำกัด 24 คู่ล่าสุด เพื่อไม่ให้ซ้ำภายใน 24 ชม.)
const recentPairs = [];
const MAX_HISTORY = 24;

let rotatorInterval = null;

/**
 * สุ่มคู่สี 2 สีจากคลังสีโดยไม่ซ้ำกัน และไม่ซ้ำกับประวัติ 24 ชม. ล่าสุด
 * @returns {{ primaryColor: string, secondaryColor: string }}
 */
function pickUniqueGradientPair() {
  const pool = GRADIENT_COLOR_POOL;
  let attempts = 0;
  let pColor = "";
  let sColor = "";

  while (attempts < 50) {
    attempts++;
    const idx1 = Math.floor(Math.random() * pool.length);
    let idx2 = Math.floor(Math.random() * pool.length);

    while (idx2 === idx1) {
      idx2 = Math.floor(Math.random() * pool.length);
    }

    pColor = pool[idx1];
    sColor = pool[idx2];

    // ตรวจสอบทั้งทิศทางตรงและทิศทางสลับเพื่อความหลากหลายสูงสุด
    const pairKey = `${pColor}|${sColor}`;
    if (!recentPairs.includes(pairKey)) {
      break;
    }
  }

  // บันทึกลงประวัติ
  recentPairs.push(`${pColor}|${sColor}`);
  if (recentPairs.length > MAX_HISTORY) {
    recentPairs.shift();
  }

  return { primaryColor: pColor, secondaryColor: sColor };
}

/**
 * ค้นหา Role และ Guild จาก roleId
 */
async function findTargetRole(client, roleId) {
  for (const guild of client.guilds.cache.values()) {
    try {
      const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
      if (role) {
        return { guild, role };
      }
    } catch (_) {}
  }
  return { guild: null, role: null };
}

/**
 * ดำเนินการหมุนเวียนสียศทันที
 * @param {import("discord.js").Client} client
 */
async function rotateRoleColor(client) {
  try {
    const { guild, role } = await findTargetRole(client, TARGET_ROLE_ID);

    if (!role || !guild) {
      console.warn(`[roleColorRotator] ⚠️ ไม่พบยศเป้าหมาย ID: ${TARGET_ROLE_ID} ในแคชของบอท`);
      return null;
    }

    // ตรวจสอบสิทธิ์เบื้องต้น
    const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
    if (!me || !me.permissions.has("ManageRoles")) {
      console.warn(`[roleColorRotator] ⚠️ บอทไม่มีสิทธิ์ Manage Roles ในกิลด์ ${guild.name} (${guild.id})`);
      return null;
    }

    if (me.roles.highest.comparePositionTo(role) <= 0) {
      console.warn(`[roleColorRotator] ⚠️ ยศสูงสุดของบอท (${me.roles.highest.name}) อยู่ต่ำกว่าหรือเท่ากับยศเป้าหมาย (${role.name}) ไม่สามารถแก้ไขสีได้ กรุณาย้ายยศบอทให้อยู่สูงกว่า`);
      return null;
    }

    const { primaryColor, secondaryColor } = pickUniqueGradientPair();

    await role.edit({
      colors: {
        primaryColor,
        secondaryColor
      },
      reason: `Auto rotate gradient role color (1h) [${primaryColor} -> ${secondaryColor}]`
    });

    console.log(`[roleColorRotator] 🎨 [${new Date().toLocaleTimeString()}] สลับสียศ "${role.name}" (${role.id}) เป็น ${primaryColor} ➔ ${secondaryColor} สำเร็จ`);
    return { primaryColor, secondaryColor, roleName: role.name };
  } catch (err) {
    console.error(`[roleColorRotator] ❌ เกิดข้อผิดพลาดในการเปลี่ยนสียศ ${TARGET_ROLE_ID}:`, err.message);
    if (err.rawError) {
      console.error("[roleColorRotator] Discord API Error details:", JSON.stringify(err.rawError));
    }
    return null;
  }
}

/**
 * เริ่มต้นระบบตั้งเวลาเปลี่ยนสียศอัตโนมัติทุก 1 ชม.
 * @param {import("discord.js").Client} client
 */
function setupRoleColorRotator(client) {
  if (rotatorInterval) {
    clearInterval(rotatorInterval);
    rotatorInterval = null;
  }

  // ตรวจสอบโหมด Dev เพื่อป้องกันการยิงสลับสีซ้ำๆ ทุกครั้งที่แก้โค้ดและ nodemon/watch รีสตาร์ท
  const isDevOrDisabled =
    process.env.DISABLE_ROLE_ROTATOR === "true" ||
    process.env.LOCAL_DEV === "true" ||
    process.env.LOCAL_FAST_START === "true" ||
    process.env.DISABLE_BACKGROUND_SERVICES === "true" ||
    process.execArgv.includes("--watch") ||
    process.env.npm_lifecycle_event === "dev:main" ||
    process.env.npm_lifecycle_event === "dev";

  if (isDevOrDisabled) {
    console.log(`[roleColorRotator] ⏭️ ปิดการสลับสีอัตโนมัติใน Dev Mode (ใช้คำสั่ง b!test-rotate-color เพื่อทดสอบได้)`);
    return;
  }

  const startSchedule = () => {
    // ตั้งรอบทุก 1 ชั่วโมง (ไม่รันทันทีตอนสตาร์ท เพื่อป้องกันการยิงซ้ำหากบอทรีสตาร์ทบ่อย)
    rotatorInterval = setInterval(() => {
      rotateRoleColor(client).catch(err => {
        console.error("[roleColorRotator] Scheduled rotation error:", err);
      });
    }, ROTATE_INTERVAL_MS);

    console.log(`[roleColorRotator] ✅ ระบบเปลี่ยนสียศอัตโนมัติ (Gradient) ทุก 1 ชม. เริ่มทำงานแล้ว สำหรับยศ ID: ${TARGET_ROLE_ID}`);
  };

  if (client.isReady()) {
    startSchedule();
  } else {
    client.once("ready", startSchedule);
  }
}

module.exports = {
  setupRoleColorRotator,
  rotateRoleColor,
  TARGET_ROLE_ID,
  GRADIENT_COLOR_POOL
};
