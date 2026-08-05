// src/features/minigames/questionBank.js — คลังโจทย์และการสร้างโจทย์ไดนามิกสำหรับทั้ง 10 มินิเกม

const DEFAULT_QUESTIONS = {
  1: [ // เติมคำศัพท์ไทย (ไม่มีระดับความยาก - สุ่ม 3-6 แต้ม)
    { id: 101, word_or_question: "สวัสดี", answer: "สวัสดี" },
    { id: 102, word_or_question: "ขอบคุณ", answer: "ขอบคุณ" },
    { id: 103, word_or_question: "ประเทศไทย", answer: "ประเทศไทย" },
    { id: 104, word_or_question: "มิตรภาพ", answer: "มิตรภาพ" },
    { id: 105, word_or_question: "ความสุข", answer: "ความสุข" },
    { id: 106, word_or_question: "ไอศกรีม", answer: "ไอศกรีม" },
    { id: 107, word_or_question: "ธรรมชาติ", answer: "ธรรมชาติ" },
    { id: 108, word_or_question: "คอมพิวเตอร์", answer: "คอมพิวเตอร์" }
  ],
  2: [ // เติมคำศัพท์ภาษาอังกฤษ (ไม่มีระดับความยาก - สุ่ม 3-6 แต้ม)
    { id: 201, word_or_question: "apple", answer: "apple" },
    { id: 202, word_or_question: "banana", answer: "banana" },
    { id: 203, word_or_question: "friendship", answer: "friendship" },
    { id: 204, word_or_question: "welcome", answer: "welcome" },
    { id: 205, word_or_question: "sunshine", answer: "sunshine" },
    { id: 206, word_or_question: "butterfly", answer: "butterfly" },
    { id: 207, word_or_question: "computer", answer: "computer" }
  ],
  4: [ // ทายคำจากคำใบ้ (มีระดับความยาก: easy [2-3แต้ม], medium [4-6แต้ม], hard [7-10แต้ม])
    { id: 401, word_or_question: "สุนัข", answer: "สุนัข", hints: ["เป็นสัตว์สี่ขา", "ส่งเสียงร้องโฮ่งๆ", "เพื่อนที่ซื่อสัตย์ของมนุษย์"], difficulty: "easy" },
    { id: 402, word_or_question: "แมว", answer: "แมว", hints: ["เป็นสัตว์เลี้ยงยอดนิยม", "ส่งเสียงร้องเหมียวๆ", "ชอบนอนและจับหนู"], difficulty: "easy" },
    { id: 403, word_or_question: "ช้าง", answer: "ช้าง", hints: ["เป็นสัตว์คู่บ้านคู่เมืองไทย", "ตัวใหญ่ มีงวง มีงา", "ชอบกินอ้อยและกล้วย"], difficulty: "medium" },
    { id: 404, word_or_question: "ดวงอาทิตย์", answer: "ดวงอาทิตย์", hints: ["อยู่บนท้องฟ้า", "ให้แสงสว่างและความร้อนในตอนกลางวัน", "ขึ้นทางทิศตะวันออก"], difficulty: "medium" },
    { id: 405, word_or_question: "คอมพิวเตอร์", answer: "คอมพิวเตอร์", hints: ["เป็นอุปกรณ์อิเล็กทรอนิกส์", "มีหน้าจอ แป้นพิมพ์ และเมาส์", "ใช้ประมวลผลและทำงาน"], difficulty: "hard" }
  ],
  5: [ // เรียงคำศัพท์ไทย (ไม่มีระดับความยาก - สุ่ม 3-6 แต้ม)
    { id: 501, word_or_question: "สวัสดี", answer: "สวัสดี" },
    { id: 502, word_or_question: "กาแฟ", answer: "กาแฟ" },
    { id: 503, word_or_question: "ความรัก", answer: "ความรัก" },
    { id: 504, word_or_question: "ธรรมชาติ", answer: "ธรรมชาติ" },
    { id: 505, word_or_question: "มิตรภาพ", answer: "มิตรภาพ" }
  ],
  6: [ // เรียงคำศัพท์อังกฤษ (ไม่มีระดับความยาก - สุ่ม 3-6 แต้ม)
    { id: 601, word_or_question: "coffee", answer: "coffee" },
    { id: 602, word_or_question: "discord", answer: "discord" },
    { id: 603, word_or_question: "butterfly", answer: "butterfly" },
    { id: 604, word_or_question: "rainbow", answer: "rainbow" },
    { id: 605, word_or_question: "strawberry", answer: "strawberry" }
  ],
  7: [ // พิมพ์คำต่อไปนี้ (ไทย) (ไม่มีระดับความยาก - สุ่ม 3-6 แต้ม)
    { id: 701, word_or_question: "หมีคาเฟ่ต้อนรับเสมอ", answer: "หมีคาเฟ่ต้อนรับเสมอ" },
    { id: 702, word_or_question: "ยิ้มสดใสในทุกวัน", answer: "ยิ้มสดใสในทุกวัน" },
    { id: 703, word_or_question: "กาแฟหอมหวานกลมกล่อม", answer: "กาแฟหอมหวานกลมกล่อม" },
    { id: 704, word_or_question: "ความพยายามไม่เคยทรยศใคร", answer: "ความพยายามไม่เคยทรยศใคร" }
  ],
  8: [ // พิมพ์คำต่อไปนี้ (อังกฤษ) (ไม่มีระดับความยาก - สุ่ม 3-6 แต้ม)
    { id: 801, word_or_question: "Welcome to Bear Cafe", answer: "Welcome to Bear Cafe" },
    { id: 802, word_or_question: "Have a wonderful day", answer: "Have a wonderful day" },
    { id: 803, word_or_question: "Stay happy and positive", answer: "Stay happy and positive" },
    { id: 804, word_or_question: "Practice makes perfect", answer: "Practice makes perfect" }
  ],
  9: [ // ทายคำแปลภาษาอังกฤษ (ไม่มีระดับความยาก - สุ่ม 3-6 แต้ม)
    { id: 901, word_or_question: "Banana", answer: "กล้วย", options: ["กล้วย", "แอปเปิ้ล", "องุ่น"] },
    { id: 902, word_or_question: "Apple", answer: "แอปเปิ้ล", options: ["แอปเปิ้ล", "ส้ม", "มะม่วง"] },
    { id: 903, word_or_question: "Cat", answer: "แมว", options: ["แมว", "สุนัข", "กระต่าย"] },
    { id: 904, word_or_question: "Book", answer: "หนังสือ", options: ["หนังสือ", "ปากกา", "สมุด"] },
    { id: 905, word_or_question: "Butterfly", answer: "ผีเสื้อ", options: ["ผีเสื้อ", "นก", "ผึ้ง"] }
  ],
  10: [ // ทายคำแปลภาษาไทย (ไม่มีระดับความยาก - สุ่ม 3-6 แต้ม)
    { id: 1001, word_or_question: "ส้ม", answer: "Orange", options: ["Orange", "Apple", "Grape"] },
    { id: 1002, word_or_question: "สุนัข", answer: "Dog", options: ["Dog", "Cat", "Bird"] },
    { id: 1003, word_or_question: "บ้าน", answer: "House", options: ["House", "Car", "School"] },
    { id: 1004, word_or_question: "น้ำ", answer: "Water", options: ["Water", "Milk", "Juice"] },
    { id: 1005, word_or_question: "ท้องฟ้า", answer: "Sky", options: ["Sky", "Sun", "Cloud"] }
  ]
};

// Tracks asked question IDs per game to avoid consecutive repeats
const askedHistory = new Map();

// Helper: Shuffle array
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Generate Math Problem (Game 3) - Has Difficulty levels (easy: 2-3 pts, medium: 4-6 pts, hard: 7-10 pts)
function generateMathProblem() {
  const difficulties = ["easy", "medium", "hard"];
  const diff = difficulties[Math.floor(Math.random() * difficulties.length)];

  let num1, num2, op, answer, rewardPoints, diffLabel;

  if (diff === "easy") {
    diffLabel = "ง่าย";
    rewardPoints = Math.floor(Math.random() * 2) + 2; // 2-3 pts
    num1 = Math.floor(Math.random() * 9) + 1; // 1-9
    num2 = Math.floor(Math.random() * 9) + 1; // 1-9
    op = Math.random() < 0.5 ? "+" : "-";
    if (op === "-" && num1 < num2) [num1, num2] = [num2, num1];
    answer = op === "+" ? num1 + num2 : num1 - num2;
  } else if (diff === "medium") {
    diffLabel = "ปานกลาง";
    rewardPoints = Math.floor(Math.random() * 3) + 4; // 4-6 pts
    op = Math.random() < 0.25 ? "x" : (Math.random() < 0.5 ? "+" : "-");
    if (op === "x") {
      num1 = Math.floor(Math.random() * 9) + 2; // 2-9
      num2 = Math.floor(Math.random() * 9) + 2; // 2-9
      answer = num1 * num2;
    } else {
      num1 = Math.floor(Math.random() * 90) + 10; // 10-99
      num2 = Math.floor(Math.random() * 90) + 10; // 10-99
      if (op === "-" && num1 < num2) [num1, num2] = [num2, num1];
      answer = op === "+" ? num1 + num2 : num1 - num2;
    }
  } else { // hard
    diffLabel = "ยาก";
    rewardPoints = Math.floor(Math.random() * 4) + 7; // 7-10 pts
    op = Math.random() < 0.35 ? "x" : (Math.random() < 0.5 ? "+" : "-");
    if (op === "x") {
      num1 = Math.floor(Math.random() * 89) + 10; // 10-98
      num2 = Math.floor(Math.random() * 9) + 2;   // 2-9
      answer = num1 * num2;
    } else {
      num1 = Math.floor(Math.random() * 9000) + 100; // 100-9999
      num2 = Math.floor(Math.random() * 9000) + 100; // 100-9999
      if (op === "-" && num1 < num2) [num1, num2] = [num2, num1];
      answer = op === "+" ? num1 + num2 : num1 - num2;
    }
  }

  const questionStr = `${num1} ${op} ${num2} = ?`;

  return {
    gameId: 3,
    difficulty: diffLabel,
    rewardPoints,
    questionStr,
    answer: String(answer)
  };
}

// Generate missing letters for Thai (Game 1) or English (Game 2)
function maskWord(word, isThai = true) {
  const chars = Array.from(word);
  if (chars.length <= 2) {
    return { maskedStr: word, consonantCount: 0, vowelCount: 0 };
  }

  let consonants = 0;
  let vowels = 0;

  if (isThai) {
    // Basic Thai character breakdown
    for (const ch of chars) {
      const code = ch.charCodeAt(0);
      if (code >= 0x0e01 && code <= 0x0e2e) consonants++;
      else if ((code >= 0x0e30 && code <= 0x0e3a) || (code >= 0x0e40 && code <= 0x0e47)) vowels++;
    }

    // Mask approximately 40-50% of characters
    const maskIndices = new Set();
    const countToMask = Math.max(1, Math.floor(chars.length * 0.45));
    while (maskIndices.size < countToMask) {
      const idx = Math.floor(Math.random() * chars.length);
      maskIndices.add(idx);
    }

    const maskedChars = chars.map((ch, i) => (maskIndices.has(i) ? "_" : ch));
    return {
      maskedStr: maskedChars.join(" "),
      consonantCount: consonants,
      vowelCount: vowels
    };
  } else {
    // English word masking
    const maskIndices = new Set();
    const countToMask = Math.max(1, Math.floor(chars.length * 0.45));
    while (maskIndices.size < countToMask) {
      const idx = Math.floor(Math.random() * chars.length);
      maskIndices.add(idx);
    }
    const maskedChars = chars.map((ch, i) => (maskIndices.has(i) ? "_" : ch));
    return {
      maskedStr: maskedChars.join(" ")
    };
  }
}

// Scramble word for Games 5 & 6
function scrambleWord(word) {
  const chars = Array.from(word);
  let scrambled = shuffleArray(chars).join("");
  // Ensure scrambled is not identical to original unless word length <= 2
  if (scrambled === word && chars.length > 2) {
    scrambled = chars.reverse().join("");
  }
  return scrambled;
}

// Fetch Next Question for any game (1-10)
async function getNextQuestion(supabase, gameId) {
  if (gameId === 3) {
    return generateMathProblem();
  }

  let questionsPool = [];

  if (supabase) {
    const { data, error } = await supabase
      .from("minigame_questions")
      .select("*")
      .eq("game_id", gameId)
      .eq("is_active", true);

    if (!error && data && data.length > 0) {
      questionsPool = data;
    }
  }

  if (questionsPool.length === 0) {
    questionsPool = DEFAULT_QUESTIONS[gameId] || [];
  }

  if (questionsPool.length === 0) {
    return null;
  }

  // Filter out recently asked questions if pool is large enough
  const historyKey = `game_${gameId}`;
  let history = askedHistory.get(historyKey) || [];

  let candidates = questionsPool.filter((q) => !history.includes(q.id || q.word_or_question));
  if (candidates.length === 0) {
    history = [];
    candidates = questionsPool;
  }

  const selected = candidates[Math.floor(Math.random() * candidates.length)];
  history.push(selected.id || selected.word_or_question);
  if (history.length > Math.floor(questionsPool.length / 2)) {
    history.shift();
  }
  askedHistory.set(historyKey, history);

  // Points mapping:
  // Games 1, 2, 5, 6, 7, 8, 9, 10: random 3-6 pts (NO difficulty levels)
  // Game 4: Easy (2-3), Medium (4-6), Hard (7-10)
  let rewardPoints = Math.floor(Math.random() * 4) + 3; // default 3-6 pts
  let difficulty = null;

  if (gameId === 4) {
    const diff = selected.difficulty || "medium";
    if (diff === "easy") {
      rewardPoints = Math.floor(Math.random() * 2) + 2; // 2-3 pts
      difficulty = "ง่าย";
    } else if (diff === "medium") {
      rewardPoints = Math.floor(Math.random() * 3) + 4; // 4-6 pts
      difficulty = "ปานกลาง";
    } else {
      rewardPoints = Math.floor(Math.random() * 4) + 7; // 7-10 pts
      difficulty = "ยาก";
    }
  }

  return {
    gameId,
    id: selected.id,
    wordOrQuestion: selected.word_or_question,
    answer: selected.answer,
    hints: selected.hints || [],
    options: selected.options ? shuffleArray(selected.options) : [],
    difficulty, // null for games 1,2,5,6,7,8,9,10
    rewardPoints
  };
}

module.exports = {
  getNextQuestion,
  generateMathProblem,
  maskWord,
  scrambleWord
};
