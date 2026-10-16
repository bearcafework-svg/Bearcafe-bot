// ==============================================================================
// src/features/healJai/services/shiftService.js
// Heal Jai Counselor Shift & Status Management Service (Revision 5)
//
// Features:
// - Manages status transitions (ONLINE, BUSY, BREAK, OFFLINE)
// - Eliminates blind reset to ONLINE at session end (respects break intentions)
// - Logs all shift events into heal_jai_counselor_shifts
// - Emits STAFF_SHIFT_CHANGED analytics event with idempotency
// ==============================================================================

const analyticsService = require("./analyticsService");

// In-memory registry for counselors who requested a break during an active session
const pendingBreakCounselors = new Set();

class ShiftService {
  constructor() {
    this.pendingBreaks = pendingBreakCounselors;
  }

  /**
   * Request a break after current session finishes
   * @param {string} counselorId
   */
  requestPostSessionBreak(counselorId) {
    if (!counselorId) return;
    this.pendingBreaks.add(counselorId);
    console.log(`[HealJai-Shift] Counselor <@${counselorId}> requested break after current session.`);
  }

  /**
   * Clear break request for counselor
   * @param {string} counselorId 
   */
  clearPostSessionBreak(counselorId) {
    if (!counselorId) return;
    this.pendingBreaks.delete(counselorId);
  }

  /**
   * Record and update counselor status transition safely
   * @param {import('@supabase/supabase-js').SupabaseClient} supabase
   * @param {object} param0
   */
  async updateCounselorStatus(supabase, {
    counselorId,
    guildId,
    newStatus,
    reason = "MANUAL_ACTION",
    orderId = null,
    previousStatus = null,
    metadata = {}
  }) {
    if (!supabase || !counselorId || !newStatus) return null;

    try {
      // 1. Fetch current status if previousStatus not provided
      let prevStatus = previousStatus;
      if (!prevStatus) {
        const { data: current, error: fetchErr } = await supabase
          .from("heal_jai_counselors")
          .select("status, display_name")
          .eq("user_id", counselorId)
          .maybeSingle();

        if (fetchErr) {
          console.error(`[HealJai-Shift] Error fetching status for ${counselorId}:`, fetchErr.message);
        }

        prevStatus = current?.status || "UNKNOWN";
      }

      // 2. Prevent redundant transition if status is already identical
      if (prevStatus === newStatus && reason !== "FORCE_SYNC" && reason !== "MIDNIGHT_RESET") {
        return { unchanged: true, status: newStatus };
      }

      const now = new Date().toISOString();

      // 3. Update heal_jai_counselors table
      const { error: updateErr } = await supabase
        .from("heal_jai_counselors")
        .update({
          status: newStatus,
          updated_at: now,
          ...(newStatus === "ONLINE" || newStatus === "BUSY" ? { last_shift_at: now } : {})
        })
        .eq("user_id", counselorId);

      if (updateErr) {
        console.error(`[HealJai-Shift] Failed to update counselor status:`, updateErr.message);
        return null;
      }

      // 4. Record audit log into heal_jai_counselor_shifts
      const { error: shiftLogErr } = await supabase
        .from("heal_jai_counselor_shifts")
        .insert({
          counselor_id: counselorId,
          guild_id: String(guildId),
          previous_status: prevStatus,
          new_status: newStatus,
          reason: reason,
          order_id: orderId ? Number(orderId) : null,
          metadata: metadata
        });

      if (shiftLogErr) {
        console.error(`[HealJai-Shift] Failed to insert shift log:`, shiftLogErr.message);
      }

      // 5. Emit Analytics Event
      const idempotencyKey = `shift:${counselorId}:${prevStatus}:${newStatus}:${Date.now()}`;
      analyticsService.trackEvent({
        eventName: "STAFF_SHIFT_CHANGED",
        eventCategory: "STAFF",
        status: "SUCCESS",
        idempotencyKey,
        actorId: counselorId,
        guildId: String(guildId),
        orderId: orderId,
        metadata: {
          previousStatus: prevStatus,
          newStatus,
          reason,
          ...metadata
        }
      });

      console.log(`[HealJai-Shift] ✅ Counselor <@${counselorId}> status: ${prevStatus} ➔ ${newStatus} (Reason: ${reason})`);
      return { prevStatus, newStatus };
    } catch (err) {
      console.error(`[HealJai-Shift] Exception in updateCounselorStatus:`, err.message);
      return null;
    }
  }

  /**
   * Determine and apply counselor status when a session ends
   * Inspects if counselor wanted a break or stayed online
   * @param {import('@supabase/supabase-js').SupabaseClient} supabase
   * @param {object} param0
   */
  async handleSessionEndStatus(supabase, { counselorId, guildId, orderId }) {
    if (!counselorId) return;

    let targetStatus = "ONLINE";
    let reason = "SESSION_COMPLETED";

    if (this.pendingBreaks.has(counselorId)) {
      targetStatus = "BREAK";
      reason = "SESSION_COMPLETED_BREAK_REQUESTED";
      this.pendingBreaks.delete(counselorId);
    }

    return await this.updateCounselorStatus(supabase, {
      counselorId,
      guildId,
      newStatus: targetStatus,
      reason,
      orderId
    });
  }
}

const shiftService = new ShiftService();

module.exports = shiftService;
