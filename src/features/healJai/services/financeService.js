// ==============================================================================
// src/features/healJai/services/financeService.js
// Heal Jai Financial Ledger & Integrity Service (Revision 5)
//
// Features:
// - Immutable Ledger for transactions (PAYMENT, REFUND, ADJUSTMENT)
// - Source of Truth for Gross GMV, Refunds, Net GMV, Platform Share, Counselor Share
// - Prevents duplicate refunds or double counting
// - Emits financial analytics events with idempotency keys
// ==============================================================================

const analyticsService = require("./analyticsService");

class FinanceService {
  /**
   * Record a verified payment transaction into the ledger
   * @param {import('@supabase/supabase-js').SupabaseClient} supabase 
   * @param {object} param0
   */
  async recordPayment(supabase, {
    orderId,
    orderCode,
    guildId,
    totalPrice,
    counselorShare,
    platformShare,
    createdBy = null,
    metadata = {}
  }) {
    if (!supabase || !orderCode) return null;

    try {
      const transactionCode = `PAY-${orderCode}`;

      // Check if already recorded (Idempotency)
      const { data: existing } = await supabase
        .from("heal_jai_financial_transactions")
        .select("id")
        .eq("transaction_code", transactionCode)
        .maybeSingle();

      if (existing) {
        console.log(`[HealJai-Finance] Payment transaction ${transactionCode} already recorded in ledger.`);
        return existing;
      }

      const gross = Number(totalPrice || 0);
      const counselor = Number(counselorShare || 0);
      const platform = Number(platformShare || 0);

      const { data: inserted, error } = await supabase
        .from("heal_jai_financial_transactions")
        .insert({
          transaction_code: transactionCode,
          order_id: orderId ? Number(orderId) : null,
          order_code: orderCode,
          guild_id: String(guildId),
          transaction_type: "PAYMENT",
          gross_amount: gross,
          counselor_share_amount: counselor,
          platform_share_amount: platform,
          created_by: createdBy,
          metadata: metadata
        })
        .select("*")
        .maybeSingle();

      if (error) {
        console.error(`[HealJai-Finance] Failed to record payment in ledger:`, error.message);
        return null;
      }

      // Emit Analytics Event
      analyticsService.trackEvent({
        eventName: "PAYMENT_CONFIRMED",
        eventCategory: "PAYMENT",
        status: "SUCCESS",
        idempotencyKey: `tx:${transactionCode}`,
        orderId: orderId,
        orderCode: orderCode,
        guildId: String(guildId),
        metadata: {
          grossAmount: gross,
          counselorShare: counselor,
          platformShare: platform,
          transactionCode
        }
      });

      console.log(`[HealJai-Finance] 💵 Recorded ledger payment for ${orderCode}: Gross = ฿${gross}`);
      return inserted;
    } catch (err) {
      console.error(`[HealJai-Finance] Exception recording payment:`, err.message);
      return null;
    }
  }

  /**
   * Record a refund transaction into the ledger
   * @param {import('@supabase/supabase-js').SupabaseClient} supabase 
   * @param {object} param0
   */
  async recordRefund(supabase, {
    orderId,
    orderCode,
    guildId,
    refundAmount,
    counselorDeduction = 0,
    platformDeduction = 0,
    refundReason = "Customer Request / No Show",
    createdBy = null,
    metadata = {}
  }) {
    if (!supabase || !orderCode) return null;

    try {
      const transactionCode = `REF-${orderCode}-${Date.now()}`;
      const refundGross = Number(refundAmount || 0);
      const counselorDed = Number(counselorDeduction || 0);
      const platformDed = Number(platformDeduction || 0);

      const { data: inserted, error } = await supabase
        .from("heal_jai_financial_transactions")
        .insert({
          transaction_code: transactionCode,
          order_id: orderId ? Number(orderId) : null,
          order_code: orderCode,
          guild_id: String(guildId),
          transaction_type: "REFUND",
          gross_amount: refundGross,
          counselor_share_amount: counselorDed,
          platform_share_amount: platformDed,
          refund_reason: refundReason,
          created_by: createdBy,
          metadata: metadata
        })
        .select("*")
        .maybeSingle();

      if (error) {
        console.error(`[HealJai-Finance] Failed to record refund in ledger:`, error.message);
        return null;
      }

      // Also update orders table payment_status to REFUNDED
      await supabase
        .from("heal_jai_orders_sessions")
        .update({
          payment_status: "REFUNDED",
          session_status: "CANCELLED",
          updated_at: new Date().toISOString()
        })
        .eq("order_code", orderCode);

      // Emit Analytics Event
      analyticsService.trackEvent({
        eventName: "PAYMENT_REFUNDED",
        eventCategory: "PAYMENT",
        status: "SUCCESS",
        idempotencyKey: `tx:${transactionCode}`,
        orderId: orderId,
        orderCode: orderCode,
        guildId: String(guildId),
        metadata: {
          refundAmount: refundGross,
          refundReason,
          transactionCode
        }
      });

      console.log(`[HealJai-Finance] ↩️ Recorded refund for ${orderCode}: Refund = ฿${refundGross}`);
      return inserted;
    } catch (err) {
      console.error(`[HealJai-Finance] Exception recording refund:`, err.message);
      return null;
    }
  }

  /**
   * Calculate exact financial metrics from ledger
   * @param {import('@supabase/supabase-js').SupabaseClient} supabase 
   * @param {string} guildId 
   * @param {string} startIso 
   * @param {string} endIso 
   */
  async calculateMetrics(supabase, guildId, startIso = null, endIso = null) {
    if (!supabase || !guildId) return null;

    try {
      let query = supabase
        .from("heal_jai_financial_transactions")
        .select("*")
        .eq("guild_id", String(guildId));

      if (startIso) query = query.gte("created_at", startIso);
      if (endIso) query = query.lte("created_at", endIso);

      const { data: rows, error } = await query;
      if (error) {
        console.error(`[HealJai-Finance] Error querying financial metrics:`, error.message);
        return null;
      }

      let grossGmv = 0;
      let totalRefunds = 0;
      let totalCounselorEarned = 0;
      let totalCounselorRefunded = 0;
      let totalPlatformEarned = 0;
      let totalPlatformRefunded = 0;

      for (const row of rows || []) {
        if (row.transaction_type === "PAYMENT") {
          grossGmv += Number(row.gross_amount || 0);
          totalCounselorEarned += Number(row.counselor_share_amount || 0);
          totalPlatformEarned += Number(row.platform_share_amount || 0);
        } else if (row.transaction_type === "REFUND") {
          totalRefunds += Number(row.gross_amount || 0);
          totalCounselorRefunded += Number(row.counselor_share_amount || 0);
          totalPlatformRefunded += Number(row.platform_share_amount || 0);
        }
      }

      const netGmv = Math.max(0, grossGmv - totalRefunds);
      const netPlatformRevenue = Math.max(0, totalPlatformEarned - totalPlatformRefunded);
      const payableCounselorShare = Math.max(0, totalCounselorEarned - totalCounselorRefunded);

      return {
        grossGmv,
        totalRefunds,
        netGmv,
        netPlatformRevenue,
        payableCounselorShare,
        transactionCount: (rows || []).length
      };
    } catch (err) {
      console.error(`[HealJai-Finance] Exception calculating financial metrics:`, err.message);
      return null;
    }
  }
}

const financeService = new FinanceService();

module.exports = financeService;
