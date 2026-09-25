// src/features/minigames/questionBank.js — คลังโจทย์และการสร้างโจทย์ไดนามิกสำหรับทั้ง 10 มินิเกม (ดึงจากฐานข้อมูล Supabase 100% ไม่มี Hardcoded Fallback)


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

// Common affixes with high/medium ambiguity in Thai Fill-in-the-Blank
const HIGH_AMBIGUITY_PREFIXES = ['ความ', 'การ', 'นัก', 'ผู้', 'โรง', 'ทาง', 'สถานี', 'ร้าน', 'เครื่อง', 'ของ', 'ที่', 'ใจ', 'คน', 'วัน', 'น้ำ', 'ช่าง', 'ฝ่าย'];
const HIGH_AMBIGUITY_SUFFIXES = ['แล้ว', 'ใส', 'ใหม่', 'คิด', 'หมาย', 'ชี', 'ชา', 'ผ่อน', 'สละ', 'สด', 'แข่ง', 'น้ำ', 'เรือ', 'ไฟ', 'รถ', 'ใจ', 'งาน', 'คน', 'ตา', 'ตัว', 'วัน', 'ทำ', 'ดี', 'ไป', 'มา'];
const MEDIUM_AMBIGUITY_PREFIXES = ['ขนม', 'ผล', 'ยารักษา', 'วิทยา', 'ประชา', 'กัปตัน', 'หัวหน้า', 'ปริญญา', 'หอ', 'สระ'];
const MEDIUM_AMBIGUITY_SUFFIXES = ['ธรรม', 'สัตว์', 'แพทย์', 'ศึกษา', 'ยนต์', 'ทัศน์', 'บาล', 'โลก', 'เกิด', 'หวาน'];

const HIGH_AMBIGUITY_ANCHORS = [
  'ปัญญา',
  'ภาพ',
  'กรรม',
  'ศาสตร์',
  'วิทยา',
  'ศึกษา',
  'ศิลป์',
  'ศิลปะ',
  'ภัณฑ์',
  'การณ์',
  'ลักษณ์',
  'นิยม',
  'สถาน'
];

/**
 * Validation guard: checks that revealed parts of masked string are orthographically safe
 * (no orphan combining vowels/tone marks at start, no orphan leading vowels at end, at least 1 consonant).
 */
function isValidOrthographicMask(maskedStr, answer) {
  if (!maskedStr || maskedStr === '_' || maskedStr === answer) return false;
  const parts = maskedStr.split('_').map(p => p.trim()).filter(Boolean);
  if (parts.length === 0) return false;

  const INVALID_STARTS = /^[ะัาำิีึืฺุู็่้๊๋์ๆฯ\u0E30-\u0E39\u0E47-\u0E4E]/;
  const INVALID_ENDS = /[เแโใไ]$/;

  for (const part of parts) {
    if (!/[ก-ฮ]/.test(part)) return false;
    if (INVALID_STARTS.test(part)) return false;
    if (INVALID_ENDS.test(part)) return false;
  }
  return true;
}

/**
 * Evaluates candidate masks for a Thai word and selects the best candidate (Best Candidate Selection).
 * Priority:
 * 1. Low Ambiguity (clear context)
 * 2. Complete Safe Units
 * 3. Filter out trivially easy sandwich masks (e.g. สระ _ น้ำ)
 * 4. Tie-breaker random among equal top candidates
 */
function selectBestThaiMask(word) {
  if (!word || typeof word !== 'string') return { maskedStr: '', initialRevealedIndices: [] };
  const clean = word.trim();
  if (!clean) return { maskedStr: '', initialRevealedIndices: [] };

  const units = getThaiSafeMaskingUnits(clean);
  if (units.length < 2) {
    return { maskedStr: '_', initialRevealedIndices: [] };
  }

  // Generate candidates
  const candidates = [];

  if (units.length === 2) {
    const u0 = units[0];
    const u1 = units[1];

    // Candidate 0: Mask suffix (reveal prefix: u0 + ' _')
    let amb0 = 'LOW';
    if (HIGH_AMBIGUITY_PREFIXES.includes(u0)) amb0 = 'HIGH';
    else if (MEDIUM_AMBIGUITY_PREFIXES.includes(u0) || u0.length <= 2) amb0 = 'MEDIUM';

    candidates.push({
      maskedUnits: [u0, '_'],
      maskStr: `${u0} _`,
      revealedIndices: [0],
      ambiguity: amb0,
      hidden: u1,
      revealed: u0,
      hiddenLen: u1.length,
      revealedLen: u0.length
    });

    // Candidate 1: Mask prefix (reveal suffix: '_ ' + u1)
    let amb1 = 'LOW';
    if (HIGH_AMBIGUITY_SUFFIXES.includes(u1)) amb1 = 'HIGH';
    else if (MEDIUM_AMBIGUITY_SUFFIXES.includes(u1) || u1.length <= 2) amb1 = 'MEDIUM';

    candidates.push({
      maskedUnits: ['_', u1],
      maskStr: `_ ${u1}`,
      revealedIndices: [1],
      ambiguity: amb1,
      hidden: u0,
      revealed: u1,
      hiddenLen: u0.length,
      revealedLen: u1.length
    });
  } else {
    // 3 or more units: mask 1 unit (or 2 if 5+ units)
    for (let i = 0; i < units.length; i++) {
      const hidden = units[i];
      const revealed = units.filter((_, idx) => idx !== i);
      const maskedUnits = units.map((u, idx) => (idx === i ? '_' : u));
      const maskStr = maskedUnits.join(' ');

      let amb = 'LOW';
      // Detect trivially easy 3-unit sandwich (e.g. สระ _ น้ำ)
      if (i === 1 && units.length === 3 && units[0].length >= 3 && units[2].length >= 3) {
        amb = 'TRIVIALLY_EASY';
      } else if (revealed.some(r => HIGH_AMBIGUITY_PREFIXES.includes(r) || HIGH_AMBIGUITY_SUFFIXES.includes(r))) {
        amb = 'MEDIUM';
      }

      candidates.push({
        maskedUnits,
        maskStr,
        revealedIndices: units.map((_, idx) => idx).filter(idx => idx !== i),
        ambiguity: amb,
        hidden,
        revealed: revealed.join(''),
        hiddenLen: hidden.length,
        revealedLen: revealed.join('').length
      });
    }
  }

  // Filter with orthographic safety guard
  let validCandidates = candidates.filter(c => isValidOrthographicMask(c.maskStr, clean));
  if (validCandidates.length === 0) validCandidates = candidates;

  let nonTrivial = validCandidates.filter(c => c.ambiguity !== 'TRIVIALLY_EASY');
  if (nonTrivial.length > 0) validCandidates = nonTrivial;

  let nonHigh = validCandidates.filter(c => c.ambiguity !== 'HIGH');
  if (nonHigh.length > 0) validCandidates = nonHigh;

  // Condition: Masked unit length must NOT exceed 35% of total word length (character count)
  // AND the revealed part must NOT contain any anchor in HIGH_AMBIGUITY_ANCHORS
  const totalLen = clean.length;
  const ratioLimit = 0.35;
  const max35Candidates = validCandidates.filter(c => {
    // 1. Length must be <= 35%
    if ((c.hiddenLen / totalLen) > ratioLimit) return false;
    // 2. Revealed part must NOT contain any HIGH_AMBIGUITY_ANCHORS
    const revealedStr = c.revealed || (c.maskedUnits ? c.maskedUnits.filter(u => u !== '_').join('') : '');
    if (HIGH_AMBIGUITY_ANCHORS.some(anchor => revealedStr.includes(anchor))) return false;
    return true;
  });

  let bestPool = [];

  if (max35Candidates.length > 0) {
    const lowList = max35Candidates.filter(c => c.ambiguity === 'LOW');
    const medList = max35Candidates.filter(c => c.ambiguity === 'MEDIUM');
    bestPool = lowList.length > 0 ? lowList : (medList.length > 0 ? medList : max35Candidates);
  } else {
    // Fallback using Safe Syllable Units (firstUnit or lastUnit whole cluster)
    const fallbackCandidates = [];

    if (units.length >= 2) {
      // Fallback 1: Mask lastUnit (หน่วยท้ายทั้งก้อน)
      const lastUnit = units[units.length - 1];
      const prefixUnits = units.slice(0, -1);
      const prefixStr = prefixUnits.join('');
      const maskStrLast = `${prefixUnits.join(' ')} _`;
      const hasLastAnchor = HIGH_AMBIGUITY_ANCHORS.some(a => prefixStr.includes(a));

      if (isValidOrthographicMask(maskStrLast, clean)) {
        fallbackCandidates.push({
          maskedUnits: [...prefixUnits, '_'],
          maskStr: maskStrLast,
          revealedIndices: prefixUnits.map((_, idx) => idx),
          ambiguity: hasLastAnchor ? 'MEDIUM' : 'LOW',
          hidden: lastUnit,
          revealed: prefixStr,
          hiddenLen: lastUnit.length,
          revealedLen: prefixStr.length,
        });
      }

      // Fallback 2: Mask firstUnit (หน่วยแรกทั้งก้อน)
      const firstUnit = units[0];
      const suffixUnits = units.slice(1);
      const suffixStr = suffixUnits.join('');
      const maskStrFirst = `_ ${suffixUnits.join(' ')}`;
      const hasFirstAnchor = HIGH_AMBIGUITY_ANCHORS.some(a => suffixStr.includes(a));

      if (isValidOrthographicMask(maskStrFirst, clean)) {
        fallbackCandidates.push({
          maskedUnits: ['_', ...suffixUnits],
          maskStr: maskStrFirst,
          revealedIndices: suffixUnits.map((_, idx) => idx + 1),
          ambiguity: hasFirstAnchor ? 'MEDIUM' : 'LOW',
          hidden: firstUnit,
          revealed: suffixStr,
          hiddenLen: firstUnit.length,
          revealedLen: suffixStr.length,
        });
      }
    }

    const lowFallback = fallbackCandidates.filter(c => c.ambiguity === 'LOW');
    bestPool = lowFallback.length > 0 ? lowFallback : (fallbackCandidates.length > 0 ? fallbackCandidates : validCandidates);
  }

  // Safety filter for bestPool
  const safePool = bestPool.filter(c => isValidOrthographicMask(c.maskStr, clean));
  const finalPool = safePool.length > 0 ? safePool : bestPool;

  // Tie-breaker: random among best candidates
  const selected = finalPool[Math.floor(Math.random() * finalPool.length)];

  return {
    maskedStr: selected ? selected.maskStr : '_',
    initialRevealedIndices: selected ? selected.revealedIndices : []
  };
}

// Generate missing letters for Thai (Game 1) or English (Game 2)
function maskWord(word, isThai = true) {
  if (!word) return { maskedStr: "" };

  if (isThai) {
    return selectBestThaiMask(word);
  }

  const units = Array.from(word);
  if (units.length <= 1) {
    return { maskedStr: "_", initialRevealedIndices: [] };
  }

  let countToMask = 1;
  if (units.length >= 5) {
    countToMask = 2;
  }

  let maskIndices = new Set();
  const availableIndices = Array.from({ length: units.length }, (_, i) => i);
  const shuffled = shuffleArray(availableIndices);

  for (const idx of shuffled) {
    if (maskIndices.size >= countToMask) break;
    if (units.length >= countToMask * 2) {
      if (maskIndices.has(idx - 1) || maskIndices.has(idx + 1)) continue;
    }
    maskIndices.add(idx);
  }

  while (maskIndices.size < countToMask) {
    const idx = Math.floor(Math.random() * units.length);
    maskIndices.add(idx);
  }

  const maskedUnits = units.map((u, i) => (maskIndices.has(i) ? "_" : u));
  const initialRevealedIndices = Array.from({ length: units.length }, (_, i) => i).filter(i => !maskIndices.has(i));

  // Clean compact display formatting for English: attach adjacent letters, space around '_'
  let formattedDisplay = '';
  for (let i = 0; i < maskedUnits.length; i++) {
    const curr = maskedUnits[i];
    const prev = maskedUnits[i - 1];
    if (curr === '_') {
      formattedDisplay += (prev && prev !== '_' ? ' _ ' : '_ ');
    } else {
      formattedDisplay += curr;
    }
  }

  return {
    maskedStr: formattedDisplay.replace(/\s+/g, ' ').trim(),
    initialRevealedIndices
  };
}

/**
 * Splits a Thai word into Safe Masking Units (SMUs) for Game 1 Fill-in-the-Blank.
 * Ensures syllables, compound words, and sub-syllabic roots are never split across
 * vowels, tone marks, or orphan diacritics.
 */
function getThaiSafeMaskingUnits(word) {
  if (!word || typeof word !== 'string') return [];
  const clean = word.trim();
  if (!clean) return [];

  // 1. Natural space-separated words
  if (clean.includes(' ')) {
    return clean.split(/\s+/).filter(Boolean);
  }

  // 2. Dictionary / Compound word segmentation (Intl.Segmenter 'word')
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    try {
      const wordSegmenter = new Intl.Segmenter('th', { granularity: 'word' });
      const dictTokens = Array.from(wordSegmenter.segment(clean), s => s.segment).filter(s => s.trim().length > 0);
      if (dictTokens.length >= 2) {
        return dictTokens;
      }
    } catch {
      // fallback to syllable regex if Intl fails
    }
  }

  // 3. Orthographic Syllable Segmenter
  const C = '[ก-ฮ]';
  const CL = '(?:ห[งญนมยรลว]|[กขคตปพทสศจบด]ร|[กขคปผพ]ล|[กขค]ว|[ก-ฮ])';
  const T = '[่้๊๋]';
  const V_ABOVE = '[ิีึืั็]';
  const V_BELOW = '[ุู]';
  const K = '(?:' + V_ABOVE + '|' + V_BELOW + ')?' + '[์]';
  const NO_FOLLOW = '(?!' + T + '|' + V_ABOVE + '|' + V_BELOW + '|ะ|า|[รลว](?:[ิีึืั็ุูะา]))';

  const SYLLABLE_PATTERNS = [
    'เ' + CL + 'ื' + T + '?อ' + C + NO_FOLLOW,
    'เ' + CL + 'ื' + T + '?อ',
    'เ' + CL + 'ี' + T + '?ย' + C + NO_FOLLOW,
    'เ' + CL + 'ี' + T + '?ย',
    'เ' + CL + T + '?าะ',
    'เ' + CL + T + '?อะ',
    'เ' + CL + T + '?า',
    'เ' + CL + T + '?อ' + C + NO_FOLLOW,
    'เ' + CL + T + '?อ',
    '[แโ]' + CL + T + '?ะ',
    '[เแ]' + CL + '[็]' + C + NO_FOLLOW,
    CL + T + '?ำ',
    CL + '(?:ั|' + T + ')?' + T + '?ว' + C + NO_FOLLOW,
    CL + 'ั' + T + '?ว',
    CL + 'รร' + '(?:' + C + '?' + K + ')?',
    CL + 'รร' + NO_FOLLOW,
    '[เแโใไ]?' + CL + '(?:' + V_ABOVE + '|' + V_BELOW + ')?' + T + '?' + C + '?' + C + '?' + K,
    CL + T + '?อ' + C + NO_FOLLOW,
    '[เแโใไ]?' + CL + T + '?า' + C + NO_FOLLOW,
    '[เแโใไ]?' + CL + T + '?า',
    '[เแโใไ]?' + CL + '(?:' + V_ABOVE + '|' + V_BELOW + ')?' + T + '?ะ',
    'เ' + C + C + T + '?' + NO_FOLLOW,
    '[เแโใไ]?' + CL + '(?:' + V_ABOVE + '|' + V_BELOW + ')?' + T + '?' + C + NO_FOLLOW,
    '[เแโใไ]?' + CL + '(?:' + V_ABOVE + '|' + V_BELOW + ')?' + T + '?',
    C + '[ิีึืุูั็่้๊๋์]*',
    '[^\\u0E00-\\u0E7F]+'
  ];

  const fullRegex = new RegExp(SYLLABLE_PATTERNS.join('|'), 'g');
  const matches = clean.match(fullRegex);
  if (matches && matches.join('') === clean && matches.length >= 2) {
    const merged = [];
    for (let i = 0; i < matches.length; i++) {
      const u = matches[i];
      if (merged.length > 0 && /^[ก-ฮ]{1,2}$/.test(u)) {
        merged[merged.length - 1] += u;
      } else {
        merged.push(u);
      }
    }
    return merged;
  }

  // 4. Short single syllables with initial consonant + vowel cluster and final consonant (e.g. แมว -> [แม, ว], กิน -> [กิ, น])
  const singleWordPattern = /^([เแโใไ]?[ก-ฮ](?:[ิีึืุูั็่้๊๋]*))([ก-ฮ])$/;
  const subMatch = clean.match(singleWordPattern);
  if (subMatch) {
    return [subMatch[1], subMatch[2]];
  }

  return (matches && matches.join('') === clean) ? matches : [clean];
}

/**
 * Splits a Thai word into Unicode Grapheme Clusters (user-perceived characters).
 * Uses comprehensive Thai orthographic pattern supporting compound vowels,
 * consonant clusters, and combining tone marks.
 */
function getGraphemeClusters(word) {
  if (!word) return [];

  // Valid Thai initial consonant clusters (อักษรควบ):
  const CLUSTER = '(?:[กขคตปพทสศจบด]ร|[กขคปผพ]ล|[กขค]ว|[ก-ฮ])';

  // Comprehensive Thai orthographic regex supporting compound vowels and full visual characters
  const pattern = new RegExp(
    '(?:' +
      'เ' + CLUSTER + '[ื][่้๊๋]?อ' +      // สระเอือ (เช่น เชื้อ, เสื้อ)
      '|เ' + CLUSTER + '[ี][่้๊๋]?ย' +     // สระเอีย (เช่น เรีย, เสีย)
      '|เ' + CLUSTER + '[่้๊๋]?าะ' +       // สระเอาะ (เช่น เกาะ, เพาะ)
      '|เ' + CLUSTER + '[่้๊๋]?อะ' +       // สระเออะ (เช่น เยอะ, เลอะ)
      '|เ' + CLUSTER + '[่้๊๋]?า' +        // สระเอา (เช่น เก้า, เรา)
      '|เ' + CLUSTER + '[่้๊๋]?อ' +        // สระเออ (เช่น เธอ, เจอ)
      '|แ' + CLUSTER + '[่้๊๋]?ะ' +        // สระแอะ (เช่น แกะ, แพะ)
      '|โ' + CLUSTER + '[่้๊๋]?ะ' +        // สระโอะ (เช่น โต๊ะ, โป๊ะ)
      '|' + CLUSTER + '[่้๊๋]?ำ' +         // สระอำ (เช่น น้ำ, ทำ, ขำ)
      '|' + CLUSTER + '[ั][่้๊๋]?ว' +      // สระอัว (เช่น ตัว, ครัว)
      '|[เแโใไ]?' + CLUSTER + '[ิีึืุูั็่้๊๋์]*(?:ะ|า)?' + // สระเดี่ยว / รูปทั่วไป
      '|[ก-ฮ][ิีึืุูั็่้๊๋์]*' +          // ตัวสะกด / พยัญชนะโดด
      '|[^\\u0E00-\\u0E7F]+' +             // Non-Thai characters (spaces, punctuation, English)
    ')',
    'g'
  );

  const thaiMatches = word.match(pattern);
  if (thaiMatches && thaiMatches.join('') === word) {
    return thaiMatches;
  }
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter("th", { granularity: "grapheme" });
    return Array.from(segmenter.segment(word), (s) => s.segment);
  }
  try {
    const GraphemeSplitter = require("grapheme-splitter");
    const splitter = new GraphemeSplitter();
    return splitter.splitGraphemes(word);
  } catch {
    return thaiMatches || Array.from(word);
  }
}

/**
 * Scramble word for Games 5 & 6 based on language rules:
 * - Thai (Game 5): split into Unicode Grapheme Clusters, shuffle clusters without breaking tone marks/vowels.
 *   Skip words containing < 4 Unicode grapheme clusters.
 * - English (Game 6): split into individual letters, preserve casing.
 *   Skip words < 4 letters.
 * - Ensure shuffled word is NOT identical to original word (reshuffle if same).
 * - No brackets, pipes, commas, or spaces.
 */
function scrambleWord(word, isThai = /[\u0E00-\u0E7F]/.test(word)) {
  if (!word) return "";

  let clusters = isThai ? getGraphemeClusters(word) : Array.from(word);
  if (clusters.length < 2) return word;

  let scrambled = "";
  let attempts = 0;

  do {
    const shuffled = shuffleArray(clusters);
    scrambled = shuffled.join("").replace(/[\[\]\|, ]/g, "");
    attempts++;
  } while (scrambled === word && attempts < 100);

  if (scrambled === word && clusters.length >= 2) {
    const reversed = [...clusters].reverse();
    scrambled = reversed.join("").replace(/[\[\]\|, ]/g, "");
  }

  return scrambled;
}

// ─── IN-MEMORY QUESTION CACHE (TTL: 1 Hour) ──────────────────────────────────
// ป้องกันการยิง SELECT * ซ้ำๆ ทุกรอบเกม ช่วยลด Supabase Egress (5 GB Free Tier)
const QUESTION_CACHE = new Map();
const QUESTION_CACHE_TTL_MS = 60 * 60 * 1000; // 1 ชั่วโมง

function invalidateQuestionCache(tableName = null) {
  if (!tableName) {
    QUESTION_CACHE.clear();
    console.log('[questionBank] 🧹 In-Memory Question Cache: เคลียร์แคชทั้งหมดเรียบร้อยแล้ว');
  } else {
    for (const key of QUESTION_CACHE.keys()) {
      if (key.startsWith(`${tableName}:`)) {
        QUESTION_CACHE.delete(key);
      }
    }
    console.log(`[questionBank] 🧹 In-Memory Question Cache: เคลียร์แคชตาราง ${tableName} เรียบร้อยแล้ว`);
  }
}

/**
 * Fetch Next Question for any game (1-10) with Shared Vocabulary Pool & Dynamic 3-Choice Generation
 */
async function getNextQuestion(supabase, gameId, gameSettings = null, queryOptions = {}) {
  if (gameId === 3) {
    return generateMathProblem();
  }

  const tableName = queryOptions.tableName || gameSettings?.tableName || 'minigame_questions';
  let questionsPool = [];
  let allTranslations = [];

  if (supabase) {
    // Determine target game_id filters for standalone & shared vocabulary pools
    let targetGameIds = [gameId];
    if (gameId === 1) targetGameIds = [1];   // Standalone Game 1 (Fill-in-the-Blank Thai)
    if (gameId === 6) targetGameIds = [6];   // Standalone Game 6 (Fast Typing Thai)
    if (gameId === 2) targetGameIds = [2];   // Standalone Game 2 (Fill-in-the-Blank English)
    if (gameId === 7) targetGameIds = [7];   // Standalone Game 7 (Fast Typing English)
    if (gameId === 5) targetGameIds = [5];   // Standalone Game 5 (Audio English)
    if (gameId === 11) targetGameIds = [11]; // Standalone Game 11 (Audio Thai)
    if (gameId === 8 || gameId === 9) targetGameIds = [8, 9];

    const sortedIds = [...targetGameIds].sort((a, b) => a - b).join('_');
    const cacheKey = `${tableName}:${sortedIds}`;
    const cached = QUESTION_CACHE.get(cacheKey);
    const now = Date.now();

    if (cached && now < cached.expiresAt && Array.isArray(cached.data) && cached.data.length > 0) {
      questionsPool = cached.data;
    } else {
      try {
        const { data, error } = await supabase
          .from(tableName)
          .select("*")
          .in("game_id", targetGameIds)
          .eq("is_active", true);

        if (!error && data && data.length > 0) {
          questionsPool = data;
          QUESTION_CACHE.set(cacheKey, {
            data,
            expiresAt: now + QUESTION_CACHE_TTL_MS
          });
        } else if (tableName !== 'minigame_questions') {
          // Fallback: if custom table (e.g. akari_minigame_questions) not found or empty, try minigame_questions
          const fallbackCacheKey = `minigame_questions:${sortedIds}`;
          const fallbackCached = QUESTION_CACHE.get(fallbackCacheKey);
          if (fallbackCached && now < fallbackCached.expiresAt && Array.isArray(fallbackCached.data) && fallbackCached.data.length > 0) {
            questionsPool = fallbackCached.data;
          } else {
            const fallbackRes = await supabase
              .from("minigame_questions")
              .select("*")
              .in("game_id", targetGameIds)
              .eq("is_active", true);
            if (!fallbackRes.error && fallbackRes.data && fallbackRes.data.length > 0) {
              questionsPool = fallbackRes.data;
              QUESTION_CACHE.set(fallbackCacheKey, {
                data: fallbackRes.data,
                expiresAt: now + QUESTION_CACHE_TTL_MS
              });
            }
          }
        }
      } catch (e) {
        console.warn(`[questionBank] Failed to fetch questions from ${tableName}:`, e.message);
      }
    }
  }

  if (questionsPool.length === 0) {
    console.warn(`[questionBank] No active questions found in ${tableName} for gameId ${gameId}`);
    return null;
  }

  // Filter candidates per game logic
  let candidates = [];
  if (gameId === 1) {
    // Game 1 (Thai Fill-in-the-Blank): runtime safety validation using selectBestThaiMask
    candidates = questionsPool.map(q => {
      let word = null;
      if (q.answer && !q.answer.includes('_') && /[\u0E00-\u0E7F]/.test(q.answer)) {
        word = q.answer;
      } else if (q.word_or_question && !q.word_or_question.includes('_') && /[\u0E00-\u0E7F]/.test(q.word_or_question)) {
        word = q.word_or_question;
      }
      if (!word) return null;

      const cleanW = word.replace(/\s+/g, '').trim();
      const best = selectBestThaiMask(cleanW);
      if (!best || !best.maskedStr || !best.maskedStr.includes('_')) return null;

      return { id: q.id, word_or_question: cleanW, answer: cleanW, category: q.category || 'คำทั่วไป' };
    }).filter(Boolean);
    if (candidates.length === 0) return null;
  } else if (gameId === 6) {
    // Game 6 (Fast Typing Thai)
    candidates = questionsPool.map(q => {
      let word = null;
      if (q.answer && !q.answer.includes('_') && /[\u0E00-\u0E7F]/.test(q.answer)) {
        word = q.answer;
      } else if (q.word_or_question && !q.word_or_question.includes('_') && /[\u0E00-\u0E7F]/.test(q.word_or_question)) {
        word = q.word_or_question;
      }
      if (!word) return null;

      const cleanW = word.replace(/\s+/g, '').trim();
      const len = getGraphemeClusters(cleanW).length;
      if (len <= 3 || len > 8) return null;
      return { id: q.id, word_or_question: cleanW, answer: cleanW, category: q.category || 'คำทั่วไป' };
    }).filter(Boolean);
    if (candidates.length === 0) return null;
  } else if (gameId === 2 || gameId === 7) {
    // English games: extract words that are English and have NO '_' in raw text
    candidates = questionsPool.map(q => {
      let word = null;
      if (q.answer && !q.answer.includes('_') && /[a-zA-Z]/.test(q.answer)) {
        word = q.answer;
      } else if (q.word_or_question && !q.word_or_question.includes('_') && /[a-zA-Z]/.test(q.word_or_question)) {
        word = q.word_or_question;
      }
      if (!word) return null;

      const cleanW = word.replace(/\s+/g, '').trim();
      const len = cleanW.length;
      if (len <= 3 || len > 10) return null;
      return { id: q.id, word_or_question: cleanW, answer: cleanW, category: q.category || 'General' };
    }).filter(Boolean);
    if (candidates.length === 0) return null;
  } else if (gameId === 5) {
    // Game 5 (Standalone English Audio)
    candidates = questionsPool.map(q => {
      const cleanW = (q.answer || q.word_or_question || '').replace(/\s+/g, '').trim();
      return cleanW ? { id: q.id, word_or_question: cleanW, answer: cleanW, category: q.category || 'General' } : null;
    }).filter(Boolean);
    if (candidates.length === 0) return null;
  } else if (gameId === 11) {
    // Game 11 (Standalone Thai Audio)
    candidates = questionsPool.map(q => {
      const cleanW = (q.answer || q.word_or_question || '').replace(/\s+/g, '').trim();
      return cleanW ? { id: q.id, word_or_question: cleanW, answer: cleanW, category: q.category || 'คำทั่วไป' } : null;
    }).filter(Boolean);
    if (candidates.length === 0) return null;
  } else if (gameId === 8 || gameId === 9) {
    // Translation pairs (English word <-> Thai translation)
    candidates = questionsPool.filter(q => /[a-zA-Z]/.test(q.word_or_question) && /[\u0E00-\u0E7F]/.test(q.answer));
    if (candidates.length === 0) return null;
    allTranslations = [...candidates];
  } else {
    candidates = questionsPool;
  }

  if (candidates.length === 0) {
    return null;
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

  // Default rewards calculated dynamically from minigame_settings minPoints & maxPoints
  let minP = (gameSettings && typeof gameSettings.minPoints === 'number') ? gameSettings.minPoints : 3;
  let maxP = (gameSettings && typeof gameSettings.maxPoints === 'number') ? gameSettings.maxPoints : 6;
  if (minP > maxP) [minP, maxP] = [maxP, minP];
  let rewardPoints = Math.floor(Math.random() * (maxP - minP + 1)) + minP;
  let difficulty = null;
  let wordOrQuestion = selected.word_or_question;
  let answer = selected.answer;
  let options = [];
  let initialRevealedIndices = [];

  // Games 1 & 2: Fill-in-the-blank / Games 6 & 7: Fast Typing
  if (gameId === 1) {
    let clean = (selected.answer && !selected.answer.includes('_')) ? selected.answer : selected.word_or_question;
    clean = String(clean || '').replace(/_/g, '').replace(/\s+/g, '').trim();
    const masked = maskWord(clean, true);
    wordOrQuestion = masked.maskedStr;
    answer = clean;
    initialRevealedIndices = masked.initialRevealedIndices || [];
  } else if (gameId === 2) {
    let clean = (selected.word_or_question && !selected.word_or_question.includes('_')) ? selected.word_or_question : selected.answer;
    clean = String(clean || '').replace(/_/g, '').replace(/\s+/g, '').trim();
    const masked = maskWord(clean, false);
    wordOrQuestion = masked.maskedStr;
    answer = clean;
    initialRevealedIndices = masked.initialRevealedIndices || [];
  } else if (gameId === 6 || gameId === 7) {
    let clean = (selected.answer && !selected.answer.includes('_')) ? selected.answer : selected.word_or_question;
    clean = String(clean || '').replace(/_/g, '').replace(/\s+/g, '').trim();
    wordOrQuestion = clean;
    answer = clean;
  }
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

  // Games 8 & 9: Dynamic 3-Choice Generation for Translations, Game 10: Word Chain, Games 5 & 11: Audio, Game 12: True/False
  if (gameId === 8) {
    // Game 8: English word -> Thai choices
    wordOrQuestion = selected.word_or_question; // English word
    answer = selected.answer;                   // Thai answer
    const wrongPool = allTranslations.map(t => t.answer).filter(a => a !== answer);
    const shuffledWrong = shuffleArray(wrongPool);
    const choices = [answer, shuffledWrong[0] || 'ส้ม', shuffledWrong[1] || 'กล้วย'];
    options = shuffleArray(choices);
  } else if (gameId === 9) {
    // Game 9: Thai word -> English choices
    wordOrQuestion = selected.answer;           // Thai word
    answer = selected.word_or_question;         // English answer
    const wrongPool = allTranslations.map(t => t.word_or_question).filter(w => w !== answer);
    const shuffledWrong = shuffleArray(wrongPool);
    const choices = [answer, shuffledWrong[0] || 'Orange', shuffledWrong[1] || 'Banana'];
    options = shuffleArray(choices);
  } else if (gameId === 5 || gameId === 11) {
    // Game 5: ฟังเสียงแล้วพิมพ์ตอบ (อังกฤษ), Game 11: ฟังเสียงแล้วพิมพ์ตอบ (ไทย)
    wordOrQuestion = selected.word_or_question || selected.answer;
    answer = selected.answer || selected.word_or_question;
    options = [];
  } else if (gameId === 10) {
    // Game 10: Word Chain (Dynamic Choice Generator from Answer Pool)
    wordOrQuestion = selected.word_or_question;
    answer = selected.answer;

    if (selected.options && selected.options.length >= 3) {
      options = shuffleArray(selected.options);
    } else {
      // Pick 2 wrong answers dynamically from candidate answers
      const wrongPool = candidates
        .map(c => c.answer)
        .filter(a => a && a.trim() !== answer.trim());
      const shuffledWrong = shuffleArray(wrongPool);
      
      const choices = [answer];
      if (shuffledWrong[0]) choices.push(shuffledWrong[0]);
      if (shuffledWrong[1]) choices.push(shuffledWrong[1]);

      // Fallback choices if pool has < 3 words
      const fallbackWrongs = ['ตก', 'ฟ้า', 'ลม', 'บิน', 'แดง', 'ใส'];
      for (const fw of fallbackWrongs) {
        if (choices.length >= 3) break;
        if (!choices.includes(fw)) choices.push(fw);
      }

      options = shuffleArray(choices);
    }
  } else if (gameId === 12) {
    // Game 12: จริงหรือเท็จ
    wordOrQuestion = selected.word_or_question;
    answer = selected.answer;
    options = ["จริง", "เท็จ"];
  } else if (gameId === 13) {
    // Game 13: เรียงประโยคภาษาอังกฤษ (Sentence Builder)
    wordOrQuestion = selected.word_or_question;
    const correctWords = String(selected.answer || "")
      .split(/[,|]/)
      .map(s => s.trim())
      .filter(Boolean);
    answer = correctWords.join(",");

    let allOptions = [];
    // กรณีที่ 1: ผู้ใช้ระบุตัวเลือกหลอกใน DB ไว้ครบถ้วน (มากกว่าหรือเท่ากับจำนวนคำตอบ + 2) ให้ใช้ตามที่ระบุ
    if (Array.isArray(selected.options) && selected.options.length >= correctWords.length + 2) {
      allOptions = Array.from(new Set([...correctWords, ...selected.options]));
    } else {
      // กรณีที่ 2: ระบบสร้างตัวหลอกอัตโนมัติ (Auto-generate Distractors) เพื่อประหยัดเวลา ไม่ต้องกรอก options ใน DB
      // 2.1 ดึงคำศัพท์จากคำตอบของข้ออื่นๆ ใน Pool
      const poolDistractors = (candidates || [])
        .flatMap(q => String(q.answer || '').split(/[,|]/).map(s => s.trim()))
        .filter(w => w && !correctWords.some(cw => cw.toLowerCase() === w.toLowerCase()));

      // 2.2 คลังคำศัพท์ภาษาอังกฤษทั่วไปหลากหลายประเภท (คำนาม กริยา คุณศัพท์) สำหรับสุ่มเป็นตัวหลอก
      const COMMON_DISTRACTORS = [
        'make', 'time', 'take', 'good', 'life', 'day', 'work', 'world', 'hand', 'part',
        'place', 'week', 'room', 'money', 'story', 'night', 'mind', 'road', 'family',
        'come', 'think', 'look', 'want', 'give', 'tell', 'feel', 'leave', 'stay', 'find',
        'great', 'little', 'own', 'other', 'old', 'right', 'big', 'high', 'small', 'early',
        'happy', 'always', 'never', 'often', 'away', 'back', 'well', 'here', 'true', 'best',
        'water', 'house', 'friend', 'hope', 'change', 'light', 'sound', 'heart', 'voice', 'dream'
      ];

      // รวมคำหลอกทั้งหมด และตัดคำที่ตรงกับคำตอบจริงออก
      const uniqueWrongPool = Array.from(new Set([...poolDistractors, ...COMMON_DISTRACTORS]))
        .filter(w => !correctWords.some(cw => cw.toLowerCase() === w.toLowerCase()));

      const shuffledWrong = shuffleArray(uniqueWrongPool);

      // เป้าหมายจำนวนปุ่มทั้งหมด: 5 - 6 ปุ่ม (หรืออย่างน้อย correctWords.length + 2) สูงสุดไม่เกิน 10 ปุ่ม
      const targetButtonCount = Math.min(10, Math.max(5, correctWords.length + 2));
      const neededDistractors = Math.max(0, targetButtonCount - correctWords.length);
      const pickedDistractors = shuffledWrong.slice(0, neededDistractors);

      allOptions = [...correctWords, ...pickedDistractors];
    }
    options = shuffleArray(allOptions);
  } else if (gameId === 14) {
    // Game 14: เรียงประโยคภาษาไทย (Thai Sentence Builder)
    wordOrQuestion = selected.word_or_question; // English proverb / sentence prompt
    const correctWords = String(selected.answer || "")
      .split(/[,|]/)
      .map(s => s.trim())
      .filter(Boolean);
    answer = correctWords.join(",");

    let allOptions = [];
    if (Array.isArray(selected.options) && selected.options.length >= correctWords.length + 2) {
      allOptions = Array.from(new Set([...correctWords, ...selected.options]));
    } else {
      // Auto-generate Thai Distractors
      const poolDistractors = (candidates || [])
        .flatMap(q => String(q.answer || '').split(/[,|]/).map(s => s.trim()))
        .filter(w => w && !correctWords.some(cw => cw.trim() === w.trim()));

      const COMMON_THAI_DISTRACTORS = [
        'น้ำ', 'คน', 'ใจ', 'เงิน', 'วัน', 'ทาง', 'งาน', 'คำ', 'นก', 'เสือ',
        'มือ', 'ปาก', 'ตา', 'เพื่อน', 'นัด', 'รัก', 'เรือ', 'ไม้', 'ม้า', 'ช้าง',
        'ทอง', 'ฟ้า', 'ดิน', 'ลม', 'ไฟ', 'หิน', 'เวลา', 'บ้าน', 'ดี', 'มาก',
        'หน้า', 'หลัง', 'รู้', 'คิด', 'ทำ', 'พูด', 'เดิน', 'เร็ว', 'ช้า', 'ใหม่'
      ];

      const uniqueWrongPool = Array.from(new Set([...poolDistractors, ...COMMON_THAI_DISTRACTORS]))
        .filter(w => !correctWords.some(cw => cw.trim() === w.trim()));

      const shuffledWrong = shuffleArray(uniqueWrongPool);
      const targetButtonCount = Math.min(10, Math.max(5, correctWords.length + 2));
      const neededDistractors = Math.max(0, targetButtonCount - correctWords.length);
      const pickedDistractors = shuffledWrong.slice(0, neededDistractors);

      allOptions = [...correctWords, ...pickedDistractors];
    }
    options = shuffleArray(allOptions);
  }

  return {
    gameId,
    id: selected.id,
    wordOrQuestion,
    answer,
    englishTemplate: (gameId === 13) ? (Array.isArray(selected.hints) ? selected.hints[0] : selected.hints) : undefined,
    thaiTemplate: (gameId === 14) ? (Array.isArray(selected.hints) ? selected.hints[0] : selected.hints) : undefined,
    correctWords: ([13, 14].includes(gameId)) ? String(selected.answer || '').split(/[,|]/).map(s => s.trim()).filter(Boolean) : undefined,
    initialRevealedIndices,
    hints: selected.hints || [],
    options,
    difficulty,
    category: selected.category || ([13, 14].includes(gameId) ? 'สำนวนและประโยค' : 'คำทั่วไป'),
    rewardPoints
  };
}

/**
 * Dynamic Hint Generator for Games 1, 2, 5, 6
 */
function generateHint(gameId, questionData, hintLevel, previousHintData = null) {
  const fullAnswer = String(questionData.answer || '').trim();
  const isThaiGame1 = gameId === 1;
  const isThai = isThaiGame1 || gameId === 11;
  const units = isThaiGame1 
    ? getThaiSafeMaskingUnits(fullAnswer) 
    : (isThai ? getGraphemeClusters(fullAnswer) : Array.from(fullAnswer));
  const totalLength = units.length;

  if (gameId === 1 || gameId === 2 || gameId === 5) {
    // Fill-in-the-blank / Audio hint (เติมคำ / เสียง)
    // Extract current display state from question string
    const questionStr = (gameId === 5) ? '_'.repeat(totalLength) : String(questionData.wordOrQuestion || '').trim();
    let currentUnits = questionStr.includes(' ') ? questionStr.split(/\s+/) : (isThai ? getGraphemeClusters(questionStr) : Array.from(questionStr));
    
    // Ensure unit array length matches full answer units length
    if (currentUnits.length !== totalLength) {
      currentUnits = units.map((c, i) => (previousHintData?.revealedIndices?.includes(i) ? c : '_'));
    }

    let revealedIndices = new Set(previousHintData?.revealedIndices || []);
    
    // Track initial revealed indices from standard question string
    currentUnits.forEach((u, i) => {
      if (u !== '_') revealedIndices.add(i);
    });

    const unrevealedIndices = [];
    for (let i = 0; i < totalLength; i++) {
      if (!revealedIndices.has(i)) {
        unrevealedIndices.push(i);
      }
    }

    // Target maximum total revealed units allowed (Max 55% of total word length)
    const maxAllowedRevealed = Math.min(totalLength - 1, Math.max(1, Math.floor(totalLength * 0.55)));

    let countToReveal = 1;
    if (hintLevel === 2) {
      const maxMoreToReveal = Math.max(1, maxAllowedRevealed - revealedIndices.size);
      countToReveal = Math.min(unrevealedIndices.length, maxMoreToReveal);
    }

    const shuffledUnrevealed = shuffleArray([...unrevealedIndices]);
    const newlyRevealed = shuffledUnrevealed.slice(0, countToReveal);
    newlyRevealed.forEach(idx => revealedIndices.add(idx));

    const finalUnits = units.map((char, i) => (revealedIndices.has(i) ? char : '_'));
    
    let compactDisplay = '';
    if (isThaiGame1) {
      compactDisplay = finalUnits.join(' ');
    } else {
      for (let i = 0; i < finalUnits.length; i++) {
        const curr = finalUnits[i];
        const prev = finalUnits[i - 1];
        if (curr === '_') {
          compactDisplay += (prev && prev !== '_' ? ' _ ' : '_ ');
        } else {
          compactDisplay += curr;
        }
      }
    }

    const hintMsg = `\`${compactDisplay.replace(/\s+/g, ' ').trim()}\``;

    return {
      error: null,
      hintText: hintMsg,
      updatedHintData: { revealedIndices: Array.from(revealedIndices) }
    };
  }

  return { error: "เกมนี้ไม่รองรับระบบคำใบ้ค่ะ", hintText: null, updatedHintData: null };
}

module.exports = {
  getNextQuestion,
  generateMathProblem,
  maskWord,
  selectBestThaiMask,
  scrambleWord,
  getThaiSafeMaskingUnits,
  getGraphemeClusters,
  generateHint,
  invalidateQuestionCache,
  QUESTION_CACHE
};

