// src/features/minigames/questionBank.js — คลังโจทย์และการสร้างโจทย์ไดนามิกสำหรับทั้ง 10 มินิเกม (Shared Vocabulary & Dynamic Choices)

const DEFAULT_QUESTIONS = {
  1: [ // เติมคำศัพท์ไทย & เรียงคำไทย
    { id: 101, word_or_question: "สวัสดี", answer: "สวัสดี" },
    { id: 102, word_or_question: "ขอบคุณ", answer: "ขอบคุณ" },
    { id: 103, word_or_question: "ประเทศไทย", answer: "ประเทศไทย" },
    { id: 104, word_or_question: "มิตรภาพ", answer: "มิตรภาพ" },
    { id: 105, word_or_question: "ความสุข", answer: "ความสุข" },
    { id: 106, word_or_question: "ไอศกรีม", answer: "ไอศกรีม" },
    { id: 107, word_or_question: "ธรรมชาติ", answer: "ธรรมชาติ" },
    { id: 108, word_or_question: "คอมพิวเตอร์", answer: "คอมพิวเตอร์" }
  ],
  2: [ // เติมคำศัพท์อังกฤษ & เรียงคำอังกฤษ
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
  7: [ // พิมพ์คำต่อไปนี้ (ไทย)
    { id: 701, word_or_question: "หมีคาเฟ่ต้อนรับเสมอ", answer: "หมีคาเฟ่ต้อนรับเสมอ" },
    { id: 702, word_or_question: "ยิ้มสดใสในทุกวัน", answer: "ยิ้มสดใสในทุกวัน" },
    { id: 703, word_or_question: "กาแฟหอมหวานกลมกล่อม", answer: "กาแฟหอมหวานกลมกล่อม" },
    { id: 704, word_or_question: "ความพยายามไม่เคยทรยศใคร", answer: "ความพยายามไม่เคยทรยศใคร" }
  ],
  8: [ // พิมพ์คำต่อไปนี้ (อังกฤษ)
    { id: 801, word_or_question: "Welcome to Bear Cafe", answer: "Welcome to Bear Cafe" },
    { id: 802, word_or_question: "Have a wonderful day", answer: "Have a wonderful day" },
    { id: 803, word_or_question: "Stay happy and positive", answer: "Stay happy and positive" },
    { id: 804, word_or_question: "Practice makes perfect", answer: "Practice makes perfect" }
  ],
  9: [ // คลังคู่แปลภาษา (อังกฤษ <-> ไทย) ใช้สำหรับ Game 9 & 10
    { id: 901, word_or_question: "Banana", answer: "กล้วย" },
    { id: 902, word_or_question: "Apple", answer: "แอปเปิ้ล" },
    { id: 903, word_or_question: "Cat", answer: "แมว" },
    { id: 904, word_or_question: "Book", answer: "หนังสือ" },
    { id: 905, word_or_question: "Butterfly", answer: "ผีเสื้อ" },
    { id: 906, word_or_question: "Orange", answer: "ส้ม" },
    { id: 907, word_or_question: "Dog", answer: "สุนัข" },
    { id: 908, word_or_question: "House", answer: "บ้าน" },
    { id: 909, word_or_question: "Water", answer: "น้ำ" },
    { id: 910, word_or_question: "Sky", answer: "ท้องฟ้า" }
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

// Generate Math Problem (Game 3)
function generateMathProblem() {
  const difficulties = ["easy", "medium", "hard"];
  const diff = difficulties[Math.floor(Math.random() * difficulties.length)];

  let num1, num2, op, answer, rewardPoints, diffLabel;

  if (diff === "easy") {
    diffLabel = "ง่าย";
    rewardPoints = Math.floor(Math.random() * 2) + 2; // 2-3 pts
    num1 = Math.floor(Math.random() * 9) + 1;
    num2 = Math.floor(Math.random() * 9) + 1;
    op = Math.random() < 0.5 ? "+" : "-";
    if (op === "-" && num1 < num2) [num1, num2] = [num2, num1];
    answer = op === "+" ? num1 + num2 : num1 - num2;
  } else if (diff === "medium") {
    diffLabel = "ปานกลาง";
    rewardPoints = Math.floor(Math.random() * 3) + 4; // 4-6 pts
    op = Math.random() < 0.25 ? "x" : (Math.random() < 0.5 ? "+" : "-");
    if (op === "x") {
      num1 = Math.floor(Math.random() * 9) + 2;
      num2 = Math.floor(Math.random() * 9) + 2;
      answer = num1 * num2;
    } else {
      num1 = Math.floor(Math.random() * 90) + 10;
      num2 = Math.floor(Math.random() * 90) + 10;
      if (op === "-" && num1 < num2) [num1, num2] = [num2, num1];
      answer = op === "+" ? num1 + num2 : num1 - num2;
    }
  } else { // hard
    diffLabel = "ยาก";
    rewardPoints = Math.floor(Math.random() * 4) + 7; // 7-10 pts
    op = Math.random() < 0.35 ? "x" : (Math.random() < 0.5 ? "+" : "-");
    if (op === "x") {
      num1 = Math.floor(Math.random() * 89) + 10;
      num2 = Math.floor(Math.random() * 9) + 2;
      answer = num1 * num2;
    } else {
      num1 = Math.floor(Math.random() * 9000) + 100;
      num2 = Math.floor(Math.random() * 9000) + 100;
      if (op === "-" && num1 < num2) [num1, num2] = [num2, num1];
      answer = op === "+" ? num1 + num2 : num1 - num2;
    }
  }

  return {
    gameId: 3,
    difficulty: diffLabel,
    rewardPoints,
    questionStr: `${num1} ${op} ${num2} = ?`,
    wordOrQuestion: `${num1} ${op} ${num2} = ?`,
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
    for (const ch of chars) {
      const code = ch.charCodeAt(0);
      if (code >= 0x0e01 && code <= 0x0e2e) consonants++;
      else if ((code >= 0x0e30 && code <= 0x0e3a) || (code >= 0x0e40 && code <= 0x0e47)) vowels++;
    }

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
  if (scrambled === word && chars.length > 2) {
    scrambled = chars.reverse().join("");
  }
  return scrambled;
}

/**
 * Fetch Next Question for any game (1-10) with Shared Vocabulary Pool & Dynamic 3-Choice Generation
 */
async function getNextQuestion(supabase, gameId) {
  if (gameId === 3) {
    return generateMathProblem();
  }

  let questionsPool = [];
  let allTranslations = [];

  if (supabase) {
    // Determine target game_id filters for shared vocabulary pool
    let targetGameIds = [gameId];
    if (gameId === 1 || gameId === 5) targetGameIds = [1, 5, 9, 10];
    if (gameId === 2 || gameId === 6) targetGameIds = [2, 6, 9, 10];
    if (gameId === 9 || gameId === 10) targetGameIds = [9, 10, 1, 2, 5, 6];

    const { data, error } = await supabase
      .from("minigame_questions")
      .select("*")
      .in("game_id", targetGameIds)
      .eq("is_active", true);

    if (!error && data && data.length > 0) {
      questionsPool = data;
    }
  }

  // Fallback to default questions if DB is empty
  if (questionsPool.length === 0) {
    if (gameId === 1 || gameId === 5) questionsPool = DEFAULT_QUESTIONS[1];
    else if (gameId === 2 || gameId === 6) questionsPool = DEFAULT_QUESTIONS[2];
    else if (gameId === 9 || gameId === 10) questionsPool = DEFAULT_QUESTIONS[9];
    else questionsPool = DEFAULT_QUESTIONS[gameId] || [];
  }

  if (questionsPool.length === 0) {
    return null;
  }

  // Filter candidates per game logic
  let candidates = [...questionsPool];
  if (gameId === 1 || gameId === 5) {
    // Thai games: extract words that are Thai or answers in Thai
    candidates = questionsPool.map(q => {
      const isThaiAnswer = /[\u0E00-\u0E7F]/.test(q.answer);
      const isThaiWord = /[\u0E00-\u0E7F]/.test(q.word_or_question);
      const word = isThaiAnswer ? q.answer : (isThaiWord ? q.word_or_question : null);
      return word ? { id: q.id, word_or_question: word, answer: word } : null;
    }).filter(Boolean);
  } else if (gameId === 2 || gameId === 6) {
    // English games: extract words that are English
    candidates = questionsPool.map(q => {
      const isEngWord = /[a-zA-Z]/.test(q.word_or_question);
      const isEngAnswer = /[a-zA-Z]/.test(q.answer);
      const word = isEngWord ? q.word_or_question : (isEngAnswer ? q.answer : null);
      return word ? { id: q.id, word_or_question: word, answer: word } : null;
    }).filter(Boolean);
  } else if (gameId === 9 || gameId === 10) {
    // Translation pairs (English word <-> Thai translation)
    candidates = questionsPool.filter(q => /[a-zA-Z]/.test(q.word_or_question) && /[\u0E00-\u0E7F]/.test(q.answer));
    if (candidates.length === 0) candidates = DEFAULT_QUESTIONS[9];
    allTranslations = [...candidates];
  }

  if (candidates.length === 0) {
    candidates = questionsPool;
  }

  // Avoid consecutive repeats
  const historyKey = `game_${gameId}`;
  let history = askedHistory.get(historyKey) || [];
  let validCandidates = candidates.filter(q => !history.includes(q.id || q.word_or_question));
  if (validCandidates.length === 0) {
    history = [];
    validCandidates = candidates;
  }

  const selected = validCandidates[Math.floor(Math.random() * validCandidates.length)];
  history.push(selected.id || selected.word_or_question);
  if (history.length > Math.floor(candidates.length / 2)) {
    history.shift();
  }
  askedHistory.set(historyKey, history);

  // Default rewards
  let rewardPoints = Math.floor(Math.random() * 4) + 3; // 3-6 pts
  let difficulty = null;
  let wordOrQuestion = selected.word_or_question;
  let answer = selected.answer;
  let options = [];

  // Game 4 Difficulty mapping
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

  // Games 9 & 10: Dynamic 3-Choice Generation
  if (gameId === 9) {
    // Game 9: English word -> Thai choices
    wordOrQuestion = selected.word_or_question; // English word
    answer = selected.answer;                   // Thai answer
    const wrongPool = allTranslations.map(t => t.answer).filter(a => a !== answer);
    const shuffledWrong = shuffleArray(wrongPool);
    const choices = [answer, shuffledWrong[0] || 'ส้ม', shuffledWrong[1] || 'กล้วย'];
    options = shuffleArray(choices);
  } else if (gameId === 10) {
    // Game 10: Thai word -> English choices
    wordOrQuestion = selected.answer;           // Thai word
    answer = selected.word_or_question;         // English answer
    const wrongPool = allTranslations.map(t => t.word_or_question).filter(w => w !== answer);
    const shuffledWrong = shuffleArray(wrongPool);
    const choices = [answer, shuffledWrong[0] || 'Orange', shuffledWrong[1] || 'Banana'];
    options = shuffleArray(choices);
  }

  return {
    gameId,
    id: selected.id,
    wordOrQuestion,
    answer,
    hints: selected.hints || [],
    options,
    difficulty,
    rewardPoints
  };
}

module.exports = {
  getNextQuestion,
  generateMathProblem,
  maskWord,
  scrambleWord
};
