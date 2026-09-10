const { getNextQuestion, invalidateQuestionCache, QUESTION_CACHE } = require('../src/features/minigames/questionBank');

async function testCache() {
  console.log('🧪 Testing In-Memory Question Cache...');
  
  // 1. Initially cache is empty
  console.log(`Initial cache size: ${QUESTION_CACHE.size}`);
  
  // 2. Mock Supabase client that counts queries
  let queryCount = 0;
  const mockSupabase = {
    from: (table) => ({
      select: () => ({
        in: (col, vals) => ({
          eq: async (statusCol, statusVal) => {
            queryCount++;
            console.log(`📡 [MockDB] Query #${queryCount} executed on ${table} for games ${vals}`);
            return {
              data: [
                { id: 1, game_id: 1, word_or_question: 'ความรัก', answer: 'ความรัก', is_active: true },
                { id: 2, game_id: 1, word_or_question: 'มิตรภาพ', answer: 'มิตรภาพ', is_active: true }
              ],
              error: null
            };
          }
        })
      })
    })
  };

  // Call 1: Should query DB
  const q1 = await getNextQuestion(mockSupabase, 1);
  console.log('Call 1 result:', q1.wordOrQuestion, '| Query count:', queryCount);
  if (queryCount !== 1) throw new Error('Call 1 did not query DB');
  if (QUESTION_CACHE.size === 0) throw new Error('Cache was not populated');

  // Call 2: Should hit cache (NO DB query!)
  const q2 = await getNextQuestion(mockSupabase, 1);
  console.log('Call 2 result:', q2.wordOrQuestion, '| Query count:', queryCount);
  if (queryCount !== 1) throw new Error('Call 2 queried DB instead of cache!');

  // Call 3: Game 2 (different game) -> should query DB once and cache
  const q3 = await getNextQuestion(mockSupabase, 2);
  console.log('Call 3 result:', q3.wordOrQuestion, '| Query count:', queryCount);
  if (queryCount !== 2) throw new Error('Call 3 did not query DB for new game');

  // Call 4: Game 2 again -> cache hit
  const q4 = await getNextQuestion(mockSupabase, 2);
  console.log('Call 4 result:', q4.wordOrQuestion, '| Query count:', queryCount);
  if (queryCount !== 2) throw new Error('Call 4 queried DB instead of cache!');

  // Test invalidateQuestionCache
  invalidateQuestionCache('minigame_questions');
  console.log(`Cache size after invalidate: ${QUESTION_CACHE.size}`);
  if (QUESTION_CACHE.size !== 0) throw new Error('Cache was not invalidated!');

  // Call 5 after invalidate: Should query DB again
  const q5 = await getNextQuestion(mockSupabase, 1);
  console.log('Call 5 result:', q5.wordOrQuestion, '| Query count:', queryCount);
  if (queryCount !== 3) throw new Error('Call 5 did not re-query after invalidation');

  console.log('✅ ALL IN-MEMORY QUESTION CACHE TESTS PASSED SUCCESSFULLY!');
}

testCache().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
