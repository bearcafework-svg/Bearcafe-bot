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
 * Check if the bot has exceeded sending limits (default: 50/hour or 500/day)
 * @returns {Promise<{ allowed: boolean, reason: string | null }>}
 */
async function checkThrottleLimits(supabase, hourlyLimit = 50, dailyLimit = 500) {
  const now = new Date();

  // 1. Check hourly limit (last 60 minutes)
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const { count: hourlyCount, error: hourErr } = await supabase
    .from("dm_broadcast_logs")
    .select("id", { count: "exact", head: true })
    .eq("status", "success")
    .gte("sent_at", oneHourAgo.toISOString());

  if (hourErr) {
    console.error("[queue-processor] Hourly count query error:", hourErr.message);
    return { allowed: false, reason: "Database error" };
  }

  if (hourlyCount >= hourlyLimit) {
    return { allowed: false, reason: `Hourly limit reached (${hourlyCount}/${hourlyLimit} in the last hour)` };
  }

  // 2. Check daily limit (last 24 hours)
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const { count: dailyCount, error: dayErr } = await supabase
    .from("dm_broadcast_logs")
    .select("id", { count: "exact", head: true })
    .eq("status", "success")
    .gte("sent_at", oneDayAgo.toISOString());

  if (dayErr) {
    console.error("[queue-processor] Daily count query error:", dayErr.message);
    return { allowed: false, reason: "Database error" };
  }

  if (dailyCount >= dailyLimit) {
    return { allowed: false, reason: `Daily limit reached (${dailyCount}/${dailyLimit} in the last 24 hours)` };
  }

  return { allowed: true, reason: null };
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

      // 2. If no processing queue, check for any paused queue to see if we can resume it
      const { data: pausedQueues, error: pausedErr } = await supabase
        .from("dm_broadcast_queues")
        .select("*")
        .eq("status", "paused")
        .order("created_at", { ascending: true })
        .limit(1);

      if (pausedErr) throw pausedErr;

      if (pausedQueues && pausedQueues.length > 0) {
        const queueOpts = pausedQueues[0].message_payload?.options || {};
        const throttle = await checkThrottleLimits(supabase, queueOpts.hourly_limit || 50, queueOpts.daily_limit || 500);
        if (throttle.allowed) {
          console.log(`[queue-processor] Resuming paused queue: "${pausedQueues[0].title}"`);
          await supabase
            .from("dm_broadcast_queues")
            .update({ status: "processing", updated_at: new Date().toISOString() })
            .eq("id", pausedQueues[0].id);
          
          isProcessingQueue = true;
          const resumedQueue = { ...pausedQueues[0], status: "processing" };
          await processQueue(resumedQueue, client, supabase);
          isProcessingQueue = false;
          return;
        }
      }

      // 3. If no active/paused queue, check for pending queue to initialize
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

    // Deduplication filter: Exclude users who already received any broadcast successfully in the past
    const options = queue.message_payload?.options || {};
    const excludePreviousSuccess = options.exclude_previous_success !== false; // default true

    if (excludePreviousSuccess && targetUserIds.length > 0) {
      console.log(`[queue-processor] Deduplication enabled: Checking previously successful recipients...`);
      const { data: prevSuccess, error: prevErr } = await supabase
        .from("dm_broadcast_logs")
        .select("user_id")
        .eq("status", "success");

      if (!prevErr && prevSuccess && prevSuccess.length > 0) {
        const successUserIds = new Set(prevSuccess.map((row) => row.user_id));
        const originalCount = targetUserIds.length;
        targetUserIds = targetUserIds.filter((uid) => !successUserIds.has(uid));
        console.log(`[queue-processor] Excluded ${originalCount - targetUserIds.length} already-successful users. Remaining targets: ${targetUserIds.length}`);
      }
    }

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

  const options = queue.message_payload?.options || {};
  const minDelaySec = options.min_delay_sec || 15;
  const maxDelaySec = options.max_delay_sec || 35;
  const hourlyLimit = options.hourly_limit || 50;
  const dailyLimit = options.daily_limit || 500;
  const maxConsecutiveFailures = options.consecutive_failure_limit || 5;

  // Initial safety limit check
  const initialThrottle = await checkThrottleLimits(supabase, hourlyLimit, dailyLimit);
  if (!initialThrottle.allowed) {
    console.log(`[queue-processor] Queue "${queue.title}" cannot be processed right now: ${initialThrottle.reason}. Pausing.`);
    await supabase
      .from("dm_broadcast_queues")
      .update({ status: "paused", updated_at: new Date().toISOString() })
      .eq("id", queue.id);
    return;
  }

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
      .order("id", { ascending: true });

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

    // Fetch closed DM statuses for the user IDs in this batch
    const userIds = pendingLogs.map(log => log.user_id);
    const { data: closedStatuses, error: statusFetchErr } = await supabase
      .from("member_dm_status")
      .select("user_id")
      .in("user_id", userIds)
      .eq("dm_status", "closed");

    if (statusFetchErr) {
      console.error("[queue-processor] Error fetching closed statuses from member_dm_status:", statusFetchErr.message);
    }

    const closedUserIds = new Set((closedStatuses || []).map(item => item.user_id));
    console.log(`[queue-processor] Found ${closedUserIds.size} users with known closed DMs out of ${userIds.length} targets.`);

    let sent = queue.sent_count;
    let failed = queue.failed_count;
    let processedInSession = 0;
    let consecutiveFailures = 0;

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

      // Check if user has closed DMs
      if (closedUserIds.has(log.user_id)) {
        console.log(`[queue-processor] Skipping user ${log.user_id} (DM is closed in database)`);

        await supabase
          .from("dm_broadcast_logs")
          .update({
            status: "failed",
            error_message: "Skipped: DM status is closed in database",
            sent_at: new Date().toISOString()
          })
          .eq("id", log.id);

        failed++;

        await supabase
          .from("dm_broadcast_queues")
          .update({
            failed_count: failed,
            updated_at: new Date().toISOString()
          })
          .eq("id", queue.id);

        continue; // Immediately proceed to the next target
      }

      // Check throttle limits every 5 attempts
      processedInSession++;
      if (processedInSession % 5 === 0) {
        const throttleStatus = await checkThrottleLimits(supabase, hourlyLimit, dailyLimit);
        if (!throttleStatus.allowed) {
          console.log(`[queue-processor] Throttling triggered: ${throttleStatus.reason}. Pausing queue.`);
          await supabase
            .from("dm_broadcast_queues")
            .update({ status: "paused", updated_at: new Date().toISOString() })
            .eq("id", queue.id);
          if (useSecondary) destroySecondaryClient();
          return;
        }
      }

      // Try sending the DM
      let success = false;
      let errorMsg = null;
      let username = null;

      try {
        const userObj = await activeClient.users.fetch(log.user_id);
        username = userObj.username;
        
        // Parse message payload (if it's Component V2 JSON, check format)
        let payloadToSend = queue.message_payload;
        if (payloadToSend && payloadToSend.data) {
          payloadToSend = payloadToSend.data;
        }
        if (payloadToSend && payloadToSend.options) {
          const { options: _opts, ...cleanPayload } = payloadToSend;
          payloadToSend = cleanPayload;
        }
        
        // Discord.js allows sending raw components or V2 payloads if we structure them properly
        await userObj.send(payloadToSend);
        success = true;
        consecutiveFailures = 0; // Reset counter on success
        
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
        consecutiveFailures++;
        console.warn(`[queue-processor] DM Failed (${consecutiveFailures}/${maxConsecutiveFailures} consecutive) to user ${log.user_id}: ${errorMsg}`);
        
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

      // Auto-Pause protection if consecutive failures exceed threshold
      if (consecutiveFailures >= maxConsecutiveFailures) {
        console.warn(`[queue-processor] Triggering Auto-Pause: ${consecutiveFailures} consecutive failures reached.`);
        await supabase
          .from("dm_broadcast_queues")
          .update({
            status: "paused",
            updated_at: new Date().toISOString()
          })
          .eq("id", queue.id);

        if (useSecondary) destroySecondaryClient();
        return;
      }

      // Safe randomized delay: minDelaySec to maxDelaySec
      const delayMs = Math.floor(Math.random() * ((maxDelaySec - minDelaySec) * 1000 + 1)) + (minDelaySec * 1000);
      console.log(`[queue-processor] Waiting ${(delayMs / 1000).toFixed(1)}s before next DM...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
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
