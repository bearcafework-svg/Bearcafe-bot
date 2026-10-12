// ==============================================================================
// scripts/test-healjai-analytics.js
// Verification Suite for Heal Jai Analytics & Logging (Revision 5)
// ==============================================================================

require("dotenv").config();
const path = require("path");
const fs = require("fs");
const analyticsService = require("../src/features/healJai/services/analyticsService");
const shiftService = require("../src/features/healJai/services/shiftService");
const financeService = require("../src/features/healJai/services/financeService");
const { createClient } = require("@supabase/supabase-js");

async function runTestSuite() {
  console.log("==================================================================");
  console.log("🧪 Heal Jai Analytics Revision 5 — Test Verification Suite");
  console.log("==================================================================\n");

  const results = [];
  const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;

  // Test 1: Event Ingestion & Idempotency Key
  try {
    const key = `test_idemp_${Date.now()}`;
    const res1 = analyticsService.trackEvent({
      eventName: "TEST_EVENT",
      eventCategory: "SYSTEM",
      status: "SUCCESS",
      idempotencyKey: key,
      metadata: { test: true }
    });

    // Immediate duplicate attempt
    const res2 = analyticsService.trackEvent({
      eventName: "TEST_EVENT",
      eventCategory: "SYSTEM",
      status: "SUCCESS",
      idempotencyKey: key,
      metadata: { test: true }
    });

    if (res1 === true && res2 === false) {
      results.push({ name: "Event Deduplication & Idempotency (In-Memory)", status: "PASS" });
    } else {
      results.push({ name: "Event Deduplication & Idempotency (In-Memory)", status: "FAIL", reason: `res1=${res1}, res2=${res2}` });
    }
  } catch (err) {
    results.push({ name: "Event Deduplication & Idempotency (In-Memory)", status: "FAIL", reason: err.message });
  }

  // Test 2: Admin Kill Switch
  try {
    analyticsService.setEnabled(false);
    const blocked = analyticsService.trackEvent({
      eventName: "TEST_KILL_SWITCH",
      idempotencyKey: `kill_${Date.now()}`
    });
    analyticsService.setEnabled(true);
    const allowed = analyticsService.trackEvent({
      eventName: "TEST_KILL_SWITCH_RESTORED",
      idempotencyKey: `restore_${Date.now()}`
    });

    if (blocked === false && allowed === true) {
      results.push({ name: "Admin Kill Switch (Toggle & Halt)", status: "PASS" });
    } else {
      results.push({ name: "Admin Kill Switch (Toggle & Halt)", status: "FAIL", reason: `blocked=${blocked}, allowed=${allowed}` });
    }
  } catch (err) {
    results.push({ name: "Admin Kill Switch (Toggle & Halt)", status: "FAIL", reason: err.message });
  }

  // Test 3: Spillover File Handling
  try {
    const dummy = { event_name: "SPILLOVER_TEST", idempotency_key: `spill_${Date.now()}` };
    analyticsService.writeToSpillover(dummy);
    const spilloverPath = path.join(__dirname, "../data/heal_jai_analytics_spillover.jsonl");
    const exists = fs.existsSync(spilloverPath);
    if (exists) {
      results.push({ name: "Spillover File Writing (Bounded Buffer)", status: "PASS" });
    } else {
      results.push({ name: "Spillover File Writing (Bounded Buffer)", status: "FAIL", reason: "File not created" });
    }
  } catch (err) {
    results.push({ name: "Spillover File Writing (Bounded Buffer)", status: "FAIL", reason: err.message });
  }

  // Test 4: Financial Ledger Integrity & Deduplication
  if (supabase) {
    try {
      const testCode = `TEST-ORDER-${Date.now()}`;
      const rec1 = await financeService.recordPayment(supabase, {
        orderCode: testCode,
        guildId: "1536199707922141254",
        totalPrice: 100,
        counselorShare: 70,
        platformShare: 30
      });

      const rec2 = await financeService.recordPayment(supabase, {
        orderCode: testCode,
        guildId: "1536199707922141254",
        totalPrice: 100,
        counselorShare: 70,
        platformShare: 30
      });

      if (rec1 && rec2 && rec1.id === rec2.id) {
        results.push({ name: "Financial Ledger Idempotent Payment Record", status: "PASS" });
      } else {
        results.push({ name: "Financial Ledger Idempotent Payment Record", status: "FAIL", reason: "Duplicate recorded" });
      }

      // Cleanup test row
      await supabase.from("heal_jai_financial_transactions").delete().eq("order_code", testCode);
    } catch (err) {
      results.push({ name: "Financial Ledger Idempotent Payment Record", status: "FAIL", reason: err.message });
    }
  } else {
    results.push({ name: "Financial Ledger Idempotent Payment Record", status: "NOT RUN", reason: "No Supabase credentials" });
  }

  // Test 5: Counselor Shift Post-Session Logic
  try {
    const counselorId = "test_counselor_123";
    shiftService.requestPostSessionBreak(counselorId);
    const hasBreak = shiftService.pendingBreaks.has(counselorId);
    shiftService.clearPostSessionBreak(counselorId);
    const cleared = !shiftService.pendingBreaks.has(counselorId);

    if (hasBreak && cleared) {
      results.push({ name: "Counselor Post-Session Break Preference State", status: "PASS" });
    } else {
      results.push({ name: "Counselor Post-Session Break Preference State", status: "FAIL" });
    }
  } catch (err) {
    results.push({ name: "Counselor Post-Session Break Preference State", status: "FAIL", reason: err.message });
  }

  console.log("\n📊 Test Summary Report:");
  for (const r of results) {
    const badge = r.status === "PASS" ? "✅ [PASS]" : r.status === "FAIL" ? "❌ [FAIL]" : "⚠️ [NOT RUN]";
    console.log(`${badge} ${r.name}${r.reason ? ` (${r.reason})` : ""}`);
  }
}

if (require.main === module) {
  runTestSuite().then(() => process.exit(0));
}

module.exports = { runTestSuite };
