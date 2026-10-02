// ===================================================
// src/features/ai/knowledgeManager.js
// Supabase Knowledge Sync, In-Memory Cache & Dynamic Retrieval
// ===================================================

const fs = require("fs");
const path = require("path");
const { getSupabaseClient } = require("../../services/supabaseClient");
const AI_CONFIG = require("./aiConfig");

// In-Memory cache of knowledge items
// [{ id, category, title, content, tags: string[] }]
let knowledgeCache = [];
let isLoaded = false;

/**
 * โหลดข้อมูลความรู้จาก Supabase หรือ Fallback จาก serverKnowledge.md
 */
async function loadKnowledge() {
  const supabase = getSupabaseClient();
  let loadedFromSupabase = false;

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("ai_knowledge")
        .select("id, category, title, content, tags")
        .eq("is_active", true);

      if (!error && Array.isArray(data) && data.length > 0) {
        knowledgeCache = data.map((item) => ({
          id: item.id,
          category: item.category || "general",
          title: item.title || "",
          content: item.content || "",
          tags: Array.isArray(item.tags) ? item.tags.map((t) => String(t).toLowerCase()) : [],
        }));
        loadedFromSupabase = true;
        console.log(`🐻 [KnowledgeManager] โหลดความรู้จาก Supabase สำเร็จ (${knowledgeCache.length} รายการ)`);
      }
    } catch (err) {
      console.warn("⚠️ [KnowledgeManager] ไม่สามารถเชื่อมต่อ Supabase ai_knowledge:", err.message);
    }
  }

  // Fallback: โหลดจาก serverKnowledge.md ถ้า Supabase ไม่มีข้อมูล
  if (!loadedFromSupabase) {
    loadFallbackKnowledgeFile();
  }

  isLoaded = true;
  return knowledgeCache.length;
}

/**
 * Fallback: อ่านจากไฟล์ Markdown
 */
function loadFallbackKnowledgeFile() {
  try {
    const fallbackPath = path.join(__dirname, "knowledge", "serverKnowledge.md");
    if (fs.existsSync(fallbackPath)) {
      const content = fs.readFileSync(fallbackPath, "utf8");
      knowledgeCache = [
        {
          id: "fallback_root",
          category: "server_overview",
          title: "ข้อมูลพื้นฐานของ Bear Cafe",
          content,
          tags: ["bear", "cafe", "กฎ", "rules", "ระบบ", "point", "voice", "เกม", "ผึ้ง"],
        },
      ];
      console.log("🐻 [KnowledgeManager] โหลดความรู้จาก serverKnowledge.md สำเร็จ (Fallback Mode)");
    }
  } catch (err) {
    console.error("❌ [KnowledgeManager] โหลด Fallback File ล้มเหลว:", err.message);
  }
}

/**
 * คัดเฉพาะความรู้ที่เกี่ยวข้องกับข้อความของผู้ใช้ (Dynamic Selective Retrieval)
 * เพื่อประหยัด Input Tokens และป้องกัน Hallucination
 *
 * @param {string} text ข้อความของผู้ใช้
 * @returns {Array<{ title: string, content: string }>}
 */
function findRelevantKnowledge(text) {
  if (!text || !knowledgeCache.length) return [];

  const lower = text.toLowerCase();
  const scoredItems = [];

  for (const item of knowledgeCache) {
    let score = 0;

    // 1. ตรวจสอบ Tags
    for (const tag of item.tags) {
      if (lower.includes(tag)) {
        score += 3;
      }
    }

    // 2. ตรวจสอบชื่อเรื่อง (Title)
    if (item.title && lower.includes(item.title.toLowerCase())) {
      score += 4;
    }

    // 3. ตรวจสอบหมวดหมู่ (Category)
    if (item.category && lower.includes(item.category.toLowerCase())) {
      score += 2;
    }

    if (score > 0) {
      scoredItems.push({
        score,
        title: item.title,
        content: item.content,
      });
    }
  }

  // เรียงลำดับตามความเกี่ยวข้องสูงสุด และหยิบตามเพดานที่กำหนด
  scoredItems.sort((a, b) => b.score - a.score);
  return scoredItems.slice(0, AI_CONFIG.LIMITS.MAX_KNOWLEDGE_SNIPPETS_IN_PROMPT);
}

/**
 * ดึงสรุปสถานะความรู้ใน RAM
 */
function getKnowledgeStats() {
  return {
    isLoaded,
    totalEntries: knowledgeCache.length,
    categories: [...new Set(knowledgeCache.map((k) => k.category))],
  };
}

module.exports = {
  loadKnowledge,
  findRelevantKnowledge,
  getKnowledgeStats,
};
