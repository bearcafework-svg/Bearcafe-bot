// ===================================================
// src/akari/commands/previewCommands.js
// ระบบแสดงตัวอย่างหน้าตาการ์ดมินิเกม (/preview)
// แสดงผล Discord Component V2 สไตล์สมจริง 100% พร้อมรูปภาพและเสียง
// ===================================================

const { MessageFlags, AttachmentBuilder } = require("discord.js");
const {
  buildAkariGamePayload,
  getTTSAudioBuffer,
} = require("../minigames/minigamesEngine");
const {
  createTextImageBuffer,
  createSentenceBuilderImageBuffer,
} = require("../../features/minigames/canvasGenerator");
const { getNextQuestion } = require("../../features/minigames/questionBank");

const FLAG_V2 = MessageFlags.IsComponentsV2 || 32768;

const AKARI_GAME_NAMES = {
  1: "🎮︲เติมคำศัพท์-ไทย",
  2: "🎮︲เติมคำศัพท์-อังกฤษ",
  3: "🎲︲สุ่มโจทย์คณิต",
  4: "💡︲ทายคำจากคำใบ้",
  5: "🔊︲ฟังเสียงตอบ-อังกฤษ",
  6: "✏️︲พิมพ์ตามคำ-ไทย",
  7: "✏️︲พิมพ์ตามคำ-อังกฤษ",
  8: "🔤︲ทายคำแปล-อังกฤษ",
  9: "🔤︲ทายคำแปล-ไทย",
  10: "🔀︲เกมต่อคำ",
  11: "🔊︲ฟังเสียงตอบ-ไทย",
  12: "⚖️︲จริงหรือเท็จ",
  13: "🧩︲เรียงประโยค-อังกฤษ",
};

// ตัวอย่างโจทย์พรีวิวคุณภาพสูงสำหรับกรณีไม่มีข้อมูลใน DB
const SAMPLE_PREVIEW_QUESTIONS = {
  1: {
    wordOrQuestion: "ก__รบ้าน",
    answer: "การบ้าน",
    category: "คำทั่วไป",
    difficulty: "easy",
  },
  2: {
    wordOrQuestion: "c_mp_ter",
    answer: "computer",
    category: "เทคโนโลยี",
    difficulty: "easy",
  },
  3: {
    wordOrQuestion: "24 + 18 = ?",
    answer: "42",
    difficulty: "easy",
  },
  4: {
    wordOrQuestion: "สัตว์เลี้ยงยอดนิยม",
    hints: ["มี 4 ขา ร้องเหมียวๆ", "ชอบกินปลาทู", "ชอบนอนคลอเคลีย"],
    difficulty: "easy",
    answer: "แมว",
  },
  5: {
    wordOrQuestion: "strawberry",
    answer: "strawberry",
    difficulty: "easy",
  },
  6: {
    wordOrQuestion: "สตรอว์เบอร์รีชีสเค้ก",
    answer: "สตรอว์เบอร์รีชีสเค้ก",
    difficulty: "easy",
  },
  7: {
    wordOrQuestion: "Bear Cafe Bot",
    answer: "Bear Cafe Bot",
    difficulty: "easy",
  },
  8: {
    wordOrQuestion: "Serendipity",
    answer: "ความบังเอิญที่โชคดี",
    options: ["ความบังเอิญที่โชคดี", "ความเงียบสงบ", "ความมืดมิด", "ความกล้าหาญ"],
    difficulty: "medium",
  },
  9: {
    wordOrQuestion: "ผีเสื้อ",
    answer: "Butterfly",
    options: ["Butterfly", "Dragonfly", "Honeybee", "Ladybug"],
    difficulty: "easy",
  },
  10: {
    wordOrQuestion: "กา...",
    answer: "กาแฟ",
    options: ["กาแฟ", "กระเป๋า", "กุหลาบ", "เก้าอี้"],
    difficulty: "easy",
  },
  11: {
    wordOrQuestion: "สวัสดีชาวหมีคาเฟ่",
    answer: "สวัสดีชาวหมีคาเฟ่",
    difficulty: "easy",
  },
  12: {
    wordOrQuestion: "สตรอว์เบอร์รีจัดเป็นผลไม้ในวงศ์กุหลาบ (Rosaceae) ใช่หรือไม่?",
    answer: "จริง",
    options: ["จริง", "เท็จ"],
    difficulty: "easy",
  },
  13: {
    wordOrQuestion: "น้องหมีชอบดื่มกาแฟในตอนเช้า",
    englishTemplate: "The bear loves drinking coffee in the morning",
    options: ["The", "bear", "loves", "drinking", "coffee", "in", "the", "morning"],
    answer: "The bear loves drinking coffee in the morning",
    difficulty: "medium",
  },
};

const PREVIEW_SLASH_COMMANDS = [
  {
    name: "preview",
    description: "👁️ แสดงตัวอย่างหน้าตาการ์ดมินิเกมแต่ละเกม (Component V2)",
    options: [
      {
        name: "game",
        description: "เลือกมินิเกมที่ต้องการดูตัวอย่างการแสดงผล",
        type: 4, // INTEGER
        required: true,
        choices: Object.entries(AKARI_GAME_NAMES).map(([id, name]) => ({
          name: `${id}. ${name}`,
          value: parseInt(id, 10),
        })),
      },
      {
        name: "ephemeral",
        description: "ซ่อนข้อความให้เห็นเฉพาะคุณหรือไม่ (ค่าเริ่มต้น: false — แสดงในห้องให้ทุกคนเห็น)",
        type: 5, // BOOLEAN
        required: false,
      },
    ],
  },
];

/**
 * สุ่มหรือดึงโจทย์สำหรับใช้ในโหมด Preview
 */
async function getPreviewQuestionData(gameId, supabase) {
  const fallback = SAMPLE_PREVIEW_QUESTIONS[gameId] || {
    wordOrQuestion: `ตัวอย่างคำถามเกม #${gameId}`,
    answer: "คำตอบตัวอย่าง",
    difficulty: "easy",
  };

  let questionObj = null;
  if (supabase) {
    try {
      questionObj = await getNextQuestion(
        supabase,
        gameId,
        { difficulty: "medium" },
        { tableName: "akari_minigame_questions" }
      );
    } catch (_) {}
  }

  const rawAnswer = String(questionObj?.answer || fallback.answer).trim();
  let wordOrQuestion = String(
    questionObj?.word_or_question ||
    questionObj?.wordOrQuestion ||
    fallback.wordOrQuestion ||
    ""
  ).trim();

  const options = questionObj?.options || fallback.options || null;
  const hints = questionObj?.hints || fallback.hints || null;
  const englishTemplate = questionObj?.englishTemplate || fallback.englishTemplate || null;
  const category = questionObj?.category || fallback.category || "ทั่วไป";
  const difficulty = questionObj?.difficulty || fallback.difficulty || "easy";

  return {
    wordOrQuestion,
    answer: rawAnswer,
    category,
    difficulty,
    hints,
    options,
    englishTemplate,
    rewardPoints: 3,
  };
}

/**
 * จัดการคำสั่ง /preview
 */
async function handlePreviewCommand(interaction, supabase) {
  const gameId = interaction.options.getInteger("game");
  const isEphemeral = interaction.options.getBoolean("ephemeral") ?? false;

  await interaction.deferReply({
    flags: isEphemeral ? (FLAG_V2 | MessageFlags.Ephemeral) : FLAG_V2,
  }).catch(() => {});

  const gameName = AKARI_GAME_NAMES[gameId] || `เกมที่ #${gameId}`;
  const questionData = await getPreviewQuestionData(gameId, supabase);
  const attachments = [];

  // สร้างภาพประกอบ Canvas สำหรับเกม 6, 7 และ 13
  if (gameId === 6 || gameId === 7) {
    try {
      const buffer = createTextImageBuffer(questionData.wordOrQuestion);
      attachments.push(new AttachmentBuilder(buffer, { name: "text_image.png" }));
    } catch (imgErr) {
      console.error(`[PreviewCommand] Text image buffer error:`, imgErr.message);
    }
  } else if (gameId === 13) {
    try {
      const template =
        questionData.englishTemplate ||
        (Array.isArray(questionData.hints) ? questionData.hints[0] : questionData.hints) ||
        "";
      const buffer = createSentenceBuilderImageBuffer(questionData.wordOrQuestion, template);
      attachments.push(new AttachmentBuilder(buffer, { name: "sentence_card.png" }));
    } catch (imgErr) {
      console.error(`[PreviewCommand] Sentence card error:`, imgErr.message);
    }
  }

  // สร้างไฟล์เสียง TTS สำหรับเกมฟังเสียง (5, 11)
  if (gameId === 5) {
    try {
      const ttsBuffer = await getTTSAudioBuffer(questionData.answer, "en");
      if (ttsBuffer) {
        attachments.push(new AttachmentBuilder(ttsBuffer, { name: "audio.mp3" }));
      }
    } catch (audioErr) {
      console.error(`[PreviewCommand] TTS Audio Error (en):`, audioErr.message);
    }
  } else if (gameId === 11) {
    try {
      const ttsBuffer = await getTTSAudioBuffer(questionData.answer, "th");
      if (ttsBuffer) {
        attachments.push(new AttachmentBuilder(ttsBuffer, { name: "audio.mp3" }));
      }
    } catch (audioErr) {
      console.error(`[PreviewCommand] TTS Audio Error (th):`, audioErr.message);
    }
  }

  // สร้างการ์ดเกมสไตล์ Component V2 แท้
  const payload = buildAkariGamePayload(gameId, questionData, 3, true);

  // ปรับเปลี่ยน custom_id ของปุ่มตัวเลือกเพื่อไม่ให้ชนกับระบบ Session จริง
  if (payload.components?.[0]?.components) {
    for (const comp of payload.components[0].components) {
      if (comp.type === 1 && Array.isArray(comp.components)) {
        for (const btn of comp.components) {
          if (btn.custom_id && !btn.custom_id.startsWith("akari_mg_top")) {
            btn.custom_id = `akari_preview_btn_${gameId}_${Date.now()}`;
          }
        }
      }
    }
  }

  return await interaction.editReply({
    ...payload,
    files: attachments,
  });
}

/**
 * ดักฟังปุ่มกดในโหมด Preview
 */
async function handlePreviewButtonInteraction(interaction) {
  if (!interaction.isButton()) return false;
  if (!interaction.customId.startsWith("akari_preview_btn")) return false;

  await interaction.reply({
    content:
      "💡 **[Preview Mode]** นี่คือการ์ดตัวอย่างการแสดงผลมินิเกมครับ ไม่มีการจับเวลาหรือคิดคะแนนจริง\n" +
      "หากต้องการเริ่มเล่นจริง ให้แอดมินใช้คำสั่ง `/setup-games` หรือ `/set-game` นะครับ ʕ •ᴥ• ʔ",
    flags: MessageFlags.Ephemeral,
  }).catch(() => {});

  return true;
}

module.exports = {
  PREVIEW_SLASH_COMMANDS,
  handlePreviewCommand,
  handlePreviewButtonInteraction,
  SAMPLE_PREVIEW_QUESTIONS,
};
