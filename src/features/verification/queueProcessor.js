const { Client, GatewayIntentBits } = require("discord.js");

// Keep track of secondary bot client instances
let secondaryClientInstance = null;
let isProcessingQueue = false;

/**
 * Dynamically logs in a secondary bot client for Token 2
 * @returns {Promise<Client>}
 */
async function getSecondaryClient() {
  if (secondaryClientInstance) return secondaryClientInstance;

  const token = process.env.SECONDARY_BOT_TOKEN;
  if (!token) {
    throw new Error("SECONDARY_BOT_TOKEN is missing in environment variables.");
  }

  console.log("[queue-processor] Logging in secondary bot client...");
  const tempClient = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers
    ]
  });

  await tempClient.login(token);
  secondaryClientInstance = tempClient;
  console.log(`[queue-processor] Secondary bot "${tempClient.user.tag}" logged in successfully.`);
  return tempClient;
}

/**
 * Destroys the secondary bot client to free resources
 */
function destroySecondaryClient() {
  if (secondaryClientInstance) {
    try {
      secondaryClientInstance.destroy();
      console.log("[queue-processor] Secondary bot client destroyed.");
    } catch (e) {
      console.error("[queue-processor] Error destroying secondary client:", e);
    }
    secondaryClientInstance = null;
  }
}

/**
 * Starts the polling loop for background DM broadcast queues
 * @param {Client} client Main bot client
 * @param {SupabaseClient} supabase Supabase client
 */
function startQueueProcessor(client, supabase) {
  console.log("[queue-processor] Polling loop started (every 10 seconds)");

  setInterval(async () => {
    if (isProcessingQueue) return; // Skip if already processing a queue

    try {
      // 1. Check for any active processing queue
      const { data: processingQueues, error: procErr } = await supabase
        .from("dm_broadcast_queues")
        .select("*")
        .eq("status", "processing")
        .order("created_at", { ascending: true })
        .limit(1);

      if (procErr) throw procErr;

      if (processingQueues && processingQueues.length > 0) {
        isProcessingQueue = true;
        await processQueue(processingQueues[0], client, supabase);
        isProcessingQueue = false;
        return;
      }

      // 2. If no processing queue, check for pending queue to initialize
      const { data: pendingQueues, error: pendErr } = await supabase
        .from("dm_broadcast_queues")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(1);

      if (pendErr) throw pendErr;

      if (pendingQueues && pendingQueues.length > 0) {
        isProcessingQueue = true;
        await initializeQueue(pendingQueues[0], client, supabase);
        isProcessingQueue = false;
      }

    } catch (err) {
      console.error("[queue-processor] Error in background polling cycle:", err.message);
      isProcessingQueue = false;
    }
  }, 10 * 1000);
}

/**
 * Initialize a pending queue: Fetch targets, insert logs, and set status to processing
 */
async function initializeQueue(queue, client, supabase) {
  console.log(`[queue-processor] Initializing queue: "${queue.title}" (${queue.id})`);

  try {
    let targetUserIds = [];

    // Fetch targets based on target type
    if (queue.target_type === "all") {
      const guildId = process.env.GUILD_ID || "1144251788493602848";
      const guild = client.guilds.cache.get(guildId) || client.guilds.cache.first();
      
      if (!guild) {
        throw new Error("Guild not found in bot cache.");
      }

      console.log(`[queue-processor] Fetching all members for guild: ${guild.name}`);
      const members = await guild.members.fetch();
      targetUserIds = members.map((m) => m.user.id);
    } else if (queue.target_type === "option" && queue.target_value) {
      console.log(`[queue-processor] Fetching subscribers for option: ${queue.target_value}`);
      const { data: subs, error: subErr } = await supabase
        .from("dms_options")
        .select("user_id")
        .eq("option_value", queue.target_value);

      if (subErr) throw subErr;
      targetUserIds = (subs || []).map((s) => s.user_id);
    } else if (queue.target_type === "test" && queue.target_value) {
      console.log(`[queue-processor] Fetching test targets: ${queue.target_value}`);
      targetUserIds = queue.target_value.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
    }

    // Remove duplicates
    targetUserIds = [...new Set(targetUserIds)];

    console.log(`[queue-processor] Target users count: ${targetUserIds.length}`);

    if (targetUserIds.length === 0) {
      // No targets found, mark as completed
      await supabase
        .from("dm_broadcast_queues")
        .update({ status: "completed", total_targets: 0, updated_at: new Date().toISOString() })
        .eq("id", queue.id);
      
      console.log(`[queue-processor] Queue "${queue.title}" marked completed: No target users.`);
      return;
    }

    // Update queue status to processing
    await supabase
      .from("dm_broadcast_queues")
      .update({
        status: "processing",
        total_targets: targetUserIds.length,
        updated_at: new Date().toISOString()
      })
      .eq("id", queue.id);

    // Bulk insert logs in chunks of 1000
    const logs = targetUserIds.map((uid) => ({
      queue_id: queue.id,
      user_id: uid,
      status: "pending"
    }));

    for (let i = 0; i < logs.length; i += 1000) {
      const chunk = logs.slice(i, i + 1000);
      const { error: insErr } = await supabase.from("dm_broadcast_logs").insert(chunk);
      if (insErr) throw insErr;
    }

    console.log(`[queue-processor] Initialized ${logs.length} delivery log rows.`);

  } catch (err) {
    console.error(`[queue-processor] Failed to initialize queue ${queue.id}:`, err.message);
    // Mark as failed/cancelled
    await supabase
      .from("dm_broadcast_queues")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", queue.id);
  }
}

/**
 * Process a queue that is currently in 'processing' status
 */
async function processQueue(queue, client, supabase) {
  console.log(`[queue-processor] Processing queue: "${queue.title}" (${queue.id})`);

  let activeClient = client;
  let useSecondary = queue.token_type === "token2";

  try {
    if (useSecondary) {
      activeClient = await getSecondaryClient();
    }
  } catch (err) {
    console.error("[queue-processor] Failed to initialize Token 2 client:", err.message);
    // Cancel the queue as we cannot connect
    await supabase
      .from("dm_broadcast_queues")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", queue.id);
    return;
  }

  try {
    // Fetch pending logs for this queue
    const { data: pendingLogs, error: logErr } = await supabase
      .from("dm_broadcast_logs")
      .select("*")
      .eq("queue_id", queue.id)
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (logErr) throw logErr;

    if (!pendingLogs || pendingLogs.length === 0) {
      // Completed!
      await supabase
        .from("dm_broadcast_queues")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("id", queue.id);
      
      console.log(`[queue-processor] Queue "${queue.title}" processing completed.`);
      if (useSecondary) destroySecondaryClient();
      return;
    }

    let sent = queue.sent_count;
    let failed = queue.failed_count;

    for (const log of pendingLogs) {
      // Check if queue has been cancelled in the database
      const { data: freshQueue, error: freshErr } = await supabase
        .from("dm_broadcast_queues")
        .select("status")
        .eq("id", queue.id)
        .single();

      if (freshErr) throw freshErr;

      if (freshQueue.status !== "processing") {
        console.log(`[queue-processor] Queue status changed to: ${freshQueue.status}. Aborting loop.`);
        if (useSecondary) destroySecondaryClient();
        return;
      }

      // Try sending the DM
      let success = false;
      let errorMsg = null;
      let username = null;

      try {
        const userObj = await activeClient.users.fetch(log.user_id);
        username = userObj.username;
        
        // Parse message payload (if it's Component V2 JSON, check format)
        let payload = queue.message_payload;
        if (payload && payload.data) {
          payload = payload.data;
        }
        
        // Discord.js allows sending raw components or V2 payloads if we structure them properly
        await userObj.send(payload);
        success = true;
        
        // Update user DM status in db to open
        await supabase.from("member_dm_status").upsert({
          user_id: log.user_id,
          username: username,
          dm_status: "open",
          last_checked_at: new Date().toISOString(),
          last_error: null
        });

      } catch (sendErr) {
        errorMsg = sendErr.message || "Failed to send DM";
        console.warn(`[queue-processor] DM Failed to user ${log.user_id}: ${errorMsg}`);
        
        // Check if DM is closed (50007)
        if (sendErr.code === 50007) {
          await supabase.from("member_dm_status").upsert({
            user_id: log.user_id,
            username: username,
            dm_status: "closed",
            last_checked_at: new Date().toISOString(),
            last_error: errorMsg
          });
        }
      }

      // Update individual delivery log
      await supabase
        .from("dm_broadcast_logs")
        .update({
          status: success ? "success" : "failed",
          error_message: errorMsg,
          username: username,
          sent_at: new Date().toISOString()
        })
        .eq("id", log.id);

      // Update counters in queue table
      if (success) sent++;
      else failed++;

      await supabase
        .from("dm_broadcast_queues")
        .update({
          sent_count: sent,
          failed_count: failed,
          updated_at: new Date().toISOString()
        })
        .eq("id", queue.id);

      // Safe rate-limit delay: 1.5 seconds (1500 ms)
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    // Re-evaluate if there are any remaining pending logs
    const { data: remainingLogs } = await supabase
      .from("dm_broadcast_logs")
      .select("id")
      .eq("queue_id", queue.id)
      .eq("status", "pending")
      .limit(1);

    if (!remainingLogs || remainingLogs.length === 0) {
      await supabase
        .from("dm_broadcast_queues")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("id", queue.id);
      
      console.log(`[queue-processor] Queue "${queue.title}" processing completed (finished all items).`);
      if (useSecondary) destroySecondaryClient();
    }

  } catch (err) {
    console.error(`[queue-processor] Error processing queue ${queue.id}:`, err.message);
    if (useSecondary) destroySecondaryClient();
  }
}

module.exports = { startQueueProcessor };
