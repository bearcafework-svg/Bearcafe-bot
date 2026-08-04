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

async function checkAndSendBroadcasts(client) {
  if (!supabase || isProcessing) return;
  isProcessing = true;

  try {
    // 1. Check if broadcast schedule is enabled
    const { data: configData, error: configErr } = await supabase
      .from("campaign_schedule_config")
      .select("*")
      .eq("id", SCHEDULE_CONFIG_ID)
      .maybeSingle();

    if (configErr) {
      console.error("[broadcastScheduler] Error fetching config:", configErr.message);
      return;
    }

    if (!configData || configData.is_enabled === false) {
      return;
    }

    const intervalMinutes = Math.max(
      5,
      configData.interval_minutes ?? ((configData.interval_hours ?? 1) * 60)
    );

    // 2. Fetch due campaign messages (next_send_at <= NOW and is_active = true)
    const nowIso = new Date().toISOString();
    const { data: dueCampaigns, error: campaignErr } = await supabase
      .from("campaign_messages")
      .select("*")
      .eq("is_active", true)
      .lte("next_send_at", nowIso)
      .order("next_send_at", { ascending: true });

    if (campaignErr) {
      console.error("[broadcastScheduler] Error fetching due campaigns:", campaignErr.message);
      return;
    }

    if (!dueCampaigns || dueCampaigns.length === 0) {
      return;
    }

    // 3. Process each due campaign
    for (const campaign of dueCampaigns) {
      const targetChannels = Array.isArray(campaign.target_channels) ? campaign.target_channels : [];
      const payload = campaign.payload;

      if (targetChannels.length === 0 || !payload) {
        console.warn(`[broadcastScheduler] Campaign "${campaign.internal_name}" has no target channels or payload.`);
      } else {
        let sentCount = 0;
        for (const channelId of targetChannels) {
          try {
            const ch = await client.channels.fetch(channelId).catch(() => null);
            if (ch) {
              await ch.send(payload);
              sentCount++;
            } else {
              console.warn(`[broadcastScheduler] Channel ${channelId} not found or inaccessible.`);
            }
          } catch (sendErr) {
            console.error(`[broadcastScheduler] Failed to send campaign "${campaign.internal_name}" to channel ${channelId}:`, sendErr.message);
          }
        }
        console.log(`[broadcastScheduler] Sent campaign "${campaign.internal_name}" (${campaign.id}) to ${sentCount}/${targetChannels.length} channel(s).`);
      }

      // 4. Calculate next send time and update DB
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

  // Initial check after 10s startup buffer
  setTimeout(() => checkAndSendBroadcasts(client), 10 * 1000);

  // Periodic check interval
  setInterval(() => checkAndSendBroadcasts(client), CHECK_INTERVAL_MS);

  console.log("[broadcastScheduler] ✅ ระบบส่งโฆษณาบรอดแคสต์อัตโนมัติพร้อมทำงานแล้ว");
}

module.exports = { setupBroadcastScheduler, checkAndSendBroadcasts };
