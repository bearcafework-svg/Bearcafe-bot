// scratch/test_akari_optimizations.js
const assert = require('assert');
const { createTextImageBuffer, CANVAS_IMAGE_CACHE } = require('../src/features/minigames/canvasGenerator');
const { flushTenantPoints, flushAllTenantPoints, bufferTenantPoints, getBufferedPoints } = require('../src/akari/minigames/minigamesEngine');

async function runTests() {
  console.log('🧪 Starting Akari Optimization Unit Tests...');

  // Test 1: Canvas Image LRU Cache
  console.log('Test 1: Canvas LRU Cache');
  CANVAS_IMAGE_CACHE.clear();
  const buf1 = createTextImageBuffer('หมีกาแฟ');
  assert(Buffer.isBuffer(buf1), 'Should return a Buffer');
  assert(CANVAS_IMAGE_CACHE.has('หมีกาแฟ'), 'Cache should contain the word');

  const buf2 = createTextImageBuffer('หมีกาแฟ');
  assert.strictEqual(buf1, buf2, 'Repeated call should return exact same Buffer from cache (0ms)');
  console.log('  ✅ Canvas LRU Cache passed');

  // Test 2: flushTenantPoints with RPC
  console.log('Test 2: flushTenantPoints with RPC');
  let rpcCalledWith = null;
  const mockSupabaseRpc = {
    rpc: async (name, params) => {
      rpcCalledWith = { name, params };
      return { error: null };
    }
  };

  bufferTenantPoints('guild_123', 'user_456', 15, 1);
  await flushTenantPoints(mockSupabaseRpc, 'guild_123', 'user_456', 0, 0);

  assert(rpcCalledWith !== null, 'Should have called RPC');
  assert.strictEqual(rpcCalledWith.name, 'increment_tenant_score');
  assert.strictEqual(rpcCalledWith.params.p_guild_id, 'guild_123');
  assert.strictEqual(rpcCalledWith.params.p_user_id, 'user_456');
  assert.strictEqual(rpcCalledWith.params.p_points, 15);
  assert.strictEqual(rpcCalledWith.params.p_wins, 1);
  console.log('  ✅ RPC flushTenantPoints passed');

  // Test 3: flushTenantPoints fallback to SELECT + UPSERT when RPC errors
  console.log('Test 3: flushTenantPoints RPC fallback');
  let upsertCalledWith = null;
  const mockSupabaseFallback = {
    rpc: async () => ({ error: { message: 'Function not found' } }),
    from: (table) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { points: 10, wins: 2 } })
          })
        })
      }),
      upsert: async (payload) => {
        upsertCalledWith = payload;
        return { data: null, error: null };
      }
    })
  };

  bufferTenantPoints('guild_123', 'user_fallback', 5, 1);
  await flushTenantPoints(mockSupabaseFallback, 'guild_123', 'user_fallback', 0, 0);

  assert(upsertCalledWith !== null, 'Should fall back to upsert');
  assert.strictEqual(upsertCalledWith.points, 15); // 10 existing + 5
  assert.strictEqual(upsertCalledWith.wins, 3);   // 2 existing + 1
  console.log('  ✅ RPC fallback passed');

  // Test 4: flushAllTenantPoints across all guilds on shutdown
  console.log('Test 4: flushAllTenantPoints shutdown flush');
  const rpcCalls = [];
  const mockShutdownSupabase = {
    rpc: async (name, params) => {
      rpcCalls.push(params);
      return { error: null };
    }
  };

  bufferTenantPoints('g1', 'u1', 10, 1);
  bufferTenantPoints('g2', 'u2', 20, 2);

  await flushAllTenantPoints(mockShutdownSupabase); // null guildId means all
  assert.strictEqual(rpcCalls.length, 2, 'Should flush all buffered entries across all guilds');
  console.log('  ✅ flushAllTenantPoints passed');

  console.log('\n🎉 ALL AKARI OPTIMIZATION TESTS PASSED SUCCESSFULLY! 🐻⚡');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
