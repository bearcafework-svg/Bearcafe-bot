// ===================================================
// src/features/ai/stickerManager.js
// Trigger Matcher & Discord Candidate Sticker Resolver
// ===================================================

const { getSupabaseClient } = require("../../services/supabaseClient");

// In-Memory cache of triggers: Map<keyword, { mode, sticker_ids, description }>
const triggerCache = new Map();
let isLoaded = false;

// Fallback seed triggers หากยังไม่ได้เชื่อมต่อฐานข้อมูล
const DEFAULT_TRIGGERS = [
  {
    keyword: "อิอิว",
    mode: "llm_select",
    sticker_ids: ["1200000000000000001"],
    description: "สติกเกอร์ยิ้มกรุ้มกริ่ม/กวนๆ น่ารัก",
  },
  {
    keyword: "โอโอเย",
    mode: "llm_select",
    sticker_ids: ["1200000000000000002"],
    description: "สติกเกอร์ดีใจ/เฮฮา/เห็นด้วยอย่างยิ่ง",
  },
  {
    keyword: "ไรเรย",
    mode: "llm_select",
    sticker_ids: ["1200000000000000003"],
    description: "สติกเกอร์งง/สงสัย/แซวเล่น",
  },
  {
    keyword: "หลีกไป",
    mode: "llm_select",
    sticker_ids: ["1200000000000000004"],
    description: "สติกเกอร์เปิดทาง/พี่หมีมาแล้ว/เท่ๆ",
  },
];

/**
 * โหลด Trigger จาก Supabase หรือ Fallback
 */
async function loadStickerTriggers() {
  triggerCache.clear();
  const supabase = getSupabaseClient();
  let loadedFromDb = false;

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("ai_sticker_triggers")
        .select("keyword, mode, sticker_ids, description")
        .eq("is_active", true);

      if (!error && Array.isArray(data) && data.length > 0) {
        for (const item of data) {
          triggerCache.set(item.keyword.trim().toLowerCase(), {
            mode: item.mode || "llm_select",
            sticker_ids: Array.isArray(item.sticker_ids) ? item.sticker_ids : [],
            description: item.description || "",
          });
        }
        loadedFromDb = true;
        console.log(`🐻 [StickerManager] โหลด Sticker Triggers จาก Supabase สำเร็จ (${triggerCache.size} คำ)`);
      }
    } catch (err) {
      console.warn("⚠️ [StickerManager] ไม่สามารถเชื่อมต่อ Supabase ai_sticker_triggers:", err.message);
    }
  }

  if (!loadedFromDb) {
    for (const item of DEFAULT_TRIGGERS) {
      triggerCache.set(item.keyword.toLowerCase(), {
        mode: item.mode,
        sticker_ids: item.sticker_ids,
        description: item.description,
      });
    }
    console.log(`🐻 [StickerManager] โหลด Default Sticker Triggers สำเร็จ (${triggerCache.size} คำ)`);
  }

  isLoaded = true;
  return triggerCache.size;
}

/**
 * ค้นหา Exact-Match Trigger Keyword ในข้อความ
 *
 * @param {string} text ข้อความของผู้ใช้
 * @returns {{ matched: boolean, keyword?: string, mode?: string, candidateStickers?: Array<{ id: string, description: string }> }}
 */
function matchTrigger(text) {
  if (!text) return { matched: false };

  const cleanText = text.trim().toLowerCase();

  // ตรวจสอบ Exact Match หรือมีคำ Keyword อยู่ในประโยค
  for (const [keyword, triggerData] of triggerCache.entries()) {
    if (cleanText === keyword || cleanText.includes(keyword)) {
      const candidates = (triggerData.sticker_ids || []).map((id) => ({
        id,
        description: triggerData.description,
      }));

      return {
        matched: true,
        keyword,
        mode: triggerData.mode,
        candidates,
      };
    }
  }

  return { matched: false };
}

/**
 * ดึงสถิติของ Trigger ใน RAM
 */
function getTriggerStats() {
  return {
    isLoaded,
    totalTriggers: triggerCache.size,
    keywords: Array.from(triggerCache.keys()),
  };
}

module.exports = {
  loadStickerTriggers,
  matchTrigger,
  getTriggerStats,
};
