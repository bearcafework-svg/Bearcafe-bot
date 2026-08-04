// src/services/broadcastScheduler.js
const { createClient } = require("@supabase/supabase-js");
if (!global.WebSocket) global.WebSocket = require("ws");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;
if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

const CHECK_INTERVAL_MS = 30 * 1000; // Check every 30 seconds
const SCHEDULE_CONFIG_ID = "00000000-0000-0000-0000-000000000001";
let isProcessing = false;
let hasLoggedDisabledWarning = false;

// ── Payload Sanitizer for Component V2 ─────────────────────────────────────
// Discord API rejects Link buttons (style: 5 or having url) if custom_id is present
function sanitizePayload(obj) {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(sanitizePayload);
  const copy = { ...obj };

  if (copy.type === 2 && (copy.style === 5 || copy.url)) {
    delete copy.custom_id;
  }

  for (const key of Object.keys(copy)) {
    if (typeof copy[key] === "object" && copy[key] !== null) {
      copy[key] = sanitizePayload(copy[key]);
    }
  }
  return copy;
}

async function checkAndSendBroadcasts(client) {
  if (!supabase || isProcessing) return;
  isProcessing = true;

  try {
    // 1. Check if broadcast schedule config exists and is enabled
    const { data: configData, error: configErr } = await supabase
      .from("campaign_schedule_config")
      .select("*")
      .eq("id", SCHEDULE_CONFIG_ID)
      .maybeSingle();

    if (configErr) {
      console.error("[broadcastScheduler] Error fetching schedule config:", configErr.message);
      return;
    }

    if (!configData || configData.is_enabled === false) {
      if (!hasLoggedDisabledWarning) {
        const { count } = await supabase
          .from("campaign_messages")
          .select("*", { count: "exact", head: true })
          .eq("is_active", true);

        if (count && count > 0) {
          console.warn(`[broadcastScheduler] ⚠️ มีโฆษณาบรอดแคสต์ active อยู่ ${count} รายการ แต่การตั้งค่าระบบบรอดแคสต์ถูกปิดอยู่ (is_enabled = false) กรุณากดเปิดใช้งานในหน้าเว็บ /admin/campaigns ค่ะ`);
          hasLoggedDisabledWarning = true;
        }
      }
      return;
    }
    hasLoggedDisabledWarning = false;

    const intervalMinutes = Math.max(
      1,
      (configData.interval_minutes ?? 0) > 0
        ? configData.interval_minutes
        : ((configData.interval_hours ?? 1) * 60)
    );

    // 2. Check global cooldown: Has intervalMinutes elapsed since any active campaign ad was last sent?
    const { data: lastSentRecord } = await supabase
      .from("campaign_messages")
      .select("last_sent_at")
      .eq("is_active", true)
      .not("last_sent_at", "is", null)
      .order("last_sent_at", { ascending: false })
      .limit(1);

    if (lastSentRecord && lastSentRecord.length > 0 && lastSentRecord[0].last_sent_at) {
      const lastSentMs = new Date(lastSentRecord[0].last_sent_at).getTime();
      const elapsedMinutes = (Date.now() - lastSentMs) / (60 * 1000);
      if (elapsedMinutes < intervalMinutes) {
        return;
      }
    }

    // 3. Fetch due campaign messages (next_send_at IS NULL OR next_send_at <= NOW) AND is_active = true
    const nowIso = new Date().toISOString();
    const { data: dueCampaigns, error: campaignErr } = await supabase
      .from("campaign_messages")
      .select("*")
      .eq("is_active", true)
      .or(`next_send_at.is.null,next_send_at.lte.${nowIso}`);

    if (campaignErr) {
      console.error("[broadcastScheduler] Error fetching due campaigns:", campaignErr.message);
      return;
    }

    if (!dueCampaigns || dueCampaigns.length === 0) {
      return;
    }

    // 4. Sort due campaigns to pick the next one sequentially:
    // Campaigns never sent (last_sent_at IS NULL) come first (ordered by sort_order ASC).
    // Campaigns previously sent are ordered by last_sent_at ASC (oldest sent first), then sort_order ASC.
    dueCampaigns.sort((a, b) => {
      if (!a.last_sent_at && b.last_sent_at) return -1;
      if (a.last_sent_at && !b.last_sent_at) return 1;
      if (a.last_sent_at && b.last_sent_at) {
        const diff = new Date(a.last_sent_at).getTime() - new Date(b.last_sent_at).getTime();
        if (diff !== 0) return diff;
      }
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });

    // Send ONLY 1 campaign per schedule interval according to order
    const campaign = dueCampaigns[0];

    // 5. Process the single selected campaign
    const targetChannels = Array.isArray(campaign.target_channels) ? campaign.target_channels : [];
    const cleanPayload = sanitizePayload(campaign.payload);

    if (targetChannels.length === 0 || !cleanPayload) {
      console.warn(`[broadcastScheduler] Campaign "${campaign.internal_name}" (${campaign.id}) has no target channels or valid payload.`);
    } else {
      let sentCount = 0;
      for (const channelId of targetChannels) {
        try {
          const ch = await client.channels.fetch(channelId).catch((err) => {
            console.warn(`[broadcastScheduler] Failed to fetch channel ${channelId}:`, err.message);
            return null;
          });

          if (ch) {
            await ch.send(cleanPayload);
            sentCount++;
          } else {
            console.warn(`[broadcastScheduler] Channel ${channelId} not found or bot lacks permissions.`);
          }
        } catch (sendErr) {
          console.error(`[broadcastScheduler] Failed to send campaign "${campaign.internal_name}" (${campaign.id}) to channel ${channelId}:`, sendErr.message);
        }
      }
      console.log(`[broadcastScheduler] 🚀 Sent campaign "${campaign.internal_name}" (${campaign.id}) to ${sentCount}/${targetChannels.length} channel(s).`);
    }

    // 6. Calculate next send time and update DB for this single campaign
    const nextSendTime = new Date(Date.now() + intervalMinutes * 60 * 1000).toISOString();
    const { error: updateErr } = await supabase
      .from("campaign_messages")
      .update({
        last_sent_at: new Date().toISOString(),
        next_send_at: nextSendTime,
      })
      .eq("id", campaign.id);

    if (updateErr) {
      console.error(`[broadcastScheduler] Failed to update campaign ${campaign.id}:`, updateErr.message);
    }
  } catch (err) {
    console.error("[broadcastScheduler] Exception in broadcast check:", err.message);
  } finally {
    isProcessing = false;
  }
}

function setupBroadcastScheduler(client) {
  if (!supabaseUrl || !supabaseKey) {
    console.log("[broadcastScheduler] Skip check: Supabase environment variables not set.");
    return;
  }

  // Initial check after 5s startup buffer
  setTimeout(() => checkAndSendBroadcasts(client), 5 * 1000);

  // Periodic check interval
  setInterval(() => checkAndSendBroadcasts(client), CHECK_INTERVAL_MS);

  console.log("[broadcastScheduler] ✅ ระบบส่งโฆษณาบรอดแคสต์อัตโนมัติพร้อมทำงานแล้ว");
}

module.exports = { setupBroadcastScheduler, checkAndSendBroadcasts };
