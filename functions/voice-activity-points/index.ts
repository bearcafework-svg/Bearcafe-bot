import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CYCLE_SECONDS = 600;
const BASE_PER_CYCLE = 8;
const MAX_EARNED = 150;
const NOTIFY_CHANNEL_ID = "1524123147987714158";
const NOTIFY_COOLDOWN_MS = 15 * 60 * 1000;

const MULTIPLIER_TABLE = [
    { weight: 50, value: 1.0 },
    { weight: 30, value: 1.2 },
    { weight: 15, value: 1.5 },
    { weight: 4, value: 2.0 },
    { weight: 1, value: 3.0 },
] as const;

const DAILY_CAP_MAP: Record<number, number> = {
    750: 150, 1000: 200, 1500: 250, 2000: 300, 2500: 350,
    3000: 400, 4000: 450, 5000: 500, 6000: 550, 7500: 600,
    9000: 700, 10000: 800, 12000: 1000,
};

function getDailyCap(maxCap: number): number {
    const key = DAILY_CAP_MAP[maxCap];
    return key ?? 150;
}

function getTodayBangkok(): string {
    return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
}

function pickMultiplier(): number {
    const roll = Math.random() * 100;
    let cum = 0;
    for (const e of MULTIPLIER_TABLE) {
        cum += e.weight;
        if (roll < cum) return e.value;
    }
    return 1.0;
}

function calculateReward(duration: number, userCount: number): number {
    const cycles = Math.floor(duration / CYCLE_SECONDS);
    if (cycles === 0) return 0;
    const base = cycles * BASE_PER_CYCLE;
    let earned = Math.round(base * pickMultiplier());
    if (userCount >= 3) earned = Math.round(earned * 1.1);
    if (duration >= 3600) earned += 20;
    return Math.min(earned, MAX_EARNED);
}

function applyDiminishing(current: number, maxCap: number, earned: number): number {
    const r = current / maxCap;
    if (r >= 0.8) return Math.round(earned * 0.5);
    if (r >= 0.7) return Math.round(earned * 0.7);
    return earned;
}

async function updatePoints(
    db: SupabaseClient,
    discordId: string,
    rawEarned: number
): Promise<{ actualEarned: number; newPoints: number; maxCap: number } | null> {
    const { data: row, error } = await db
        .from("user_points")
        .select("points, max_cap, daily_points, last_reset_date")
        .eq("discord_id", discordId)
        .maybeSingle();

    if (error) { console.error("[vap] fetch:", error.message); return null; }

    const current: number = row?.points ?? 0;
    const maxCap: number = row?.max_cap ?? 500;
    const dailyCap = getDailyCap(maxCap);
    const today = getTodayBangkok();
    const lastReset: string = row?.last_reset_date ?? "";
    const needsReset = lastReset !== today;
    const dailyPoints: number = needsReset ? 0 : (row?.daily_points ?? 0);

    // Lifetime cap check
    if (current >= maxCap) return null;

    // Daily cap check
    if (dailyPoints >= dailyCap) {
        console.log(`[vap] ${discordId} daily cap reached (${dailyPoints}/${dailyCap})`);
        return null;
    }

    // Diminishing returns
    let adjusted = applyDiminishing(current, maxCap, rawEarned);

    // Clamp to daily cap remaining
    const dailyRemaining = dailyCap - dailyPoints;
    adjusted = Math.min(adjusted, dailyRemaining);

    // Clamp to lifetime cap
    const newPoints = Math.min(current + adjusted, maxCap);
    const actualEarned = newPoints - current;
    if (actualEarned <= 0) return null;

    const newDailyPoints = dailyPoints + actualEarned;

    if (row) {
        const { error: upErr } = await db
            .from("user_points")
            .update({
                points: newPoints,
                daily_points: newDailyPoints,
                last_reset_date: today,
            })
            .eq("discord_id", discordId);
        if (upErr) { console.error("[vap] update:", upErr.message); return null; }
    } else {
        const { error: inErr } = await db
            .from("user_points")
            .insert({
                discord_id: discordId,
                points: actualEarned,
                max_cap: 500,
                daily_points: actualEarned,
                last_reset_date: today,
            });
        if (inErr) { console.error("[vap] insert:", inErr.message); return null; }
    }

    return { actualEarned, newPoints, maxCap };
}

function computeDefaultAvatarUrl(discordId: string, discriminator?: string): string {
    // Legacy accounts (discriminator !== "0") use discriminator % 5
    // New username system (discriminator === "0") uses (user_id >> 22) % 6
    if (discriminator && discriminator !== "0") {
        const idx = Number(discriminator) % 5;
        return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
    }
    const idx = Number(BigInt(discordId) >> 22n) % 6;
    return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
}

async function fetchDiscordAvatar(discordId: string, botToken: string): Promise<string> {
    try {
        const res = await fetch(`https://discord.com/api/v10/users/${discordId}`, {
            headers: { Authorization: `Bot ${botToken}` },
        });
        if (!res.ok) {
            console.error(`[vap] fetchDiscordAvatar ${res.status} for ${discordId}`);
            return computeDefaultAvatarUrl(discordId);
        }
        const user = await res.json();
        if (!user.avatar) {
            return computeDefaultAvatarUrl(discordId, user.discriminator);
        }
        const ext = user.avatar.startsWith("a_") ? "gif" : "png";
        return `https://cdn.discordapp.com/avatars/${discordId}/${user.avatar}.${ext}?size=256`;
    } catch (err) {
        console.error("[vap] fetchDiscordAvatar error:", err);
        return computeDefaultAvatarUrl(discordId);
    }
}

async function handleNotification(
    db: SupabaseClient,
    discordId: string,
    earned: number,
    botToken: string,
    channelName: string = "ห้องพูดคุย"
): Promise<void> {
    try {
        const { data: buf } = await db
            .from("user_notify_buffer")
            .select("pending_points, last_sent_at")
            .eq("user_id", discordId)
            .maybeSingle();

        const now = new Date();
        const pending = (buf?.pending_points ?? 0) + earned;
        const lastSentAt = buf?.last_sent_at ? new Date(buf.last_sent_at) : new Date(0);
        const msSinceLast = now.getTime() - lastSentAt.getTime();

        if (msSinceLast < NOTIFY_COOLDOWN_MS) {
            await db.from("user_notify_buffer").upsert(
                { user_id: discordId, pending_points: pending, last_sent_at: lastSentAt.toISOString() },
                { onConflict: "user_id" }
            );
            return;
        }

        await db.from("user_notify_buffer").upsert(
            { user_id: discordId, pending_points: 0, last_sent_at: now.toISOString() },
            { onConflict: "user_id" }
        );

        const avatarUrl = await fetchDiscordAvatar(discordId, botToken);

        const componentsPayload = {
            flags: 32768,
            components: [
                {
                    type: 17,
                    components: [
                        { type: 14, spacing: 1, divider: false },
                        {
                            type: 9,
                            components: [
                                {
                                    type: 10,
                                    content: `## <:strawberryv2:1520439075100688614>︲__\` 𝖳𝖺𝗅𝗄 𝖯𝗈𝗂𝗇𝗍𝗌 ₊ แต้มพูดคุย 𓂃 \`__\n> ยินดีด้วยนะคะ <@${discordId}> คุณได้รับ **+${pending}** จากการลงห้อง \`"${channelName}"\` <:cuteplant:1152834055528783872>`,
                                },
                            ],
                            accessory: {
                                type: 11,
                                media: { url: avatarUrl },
                            },
                        },
                        { type: 14, divider: false },
                        {
                            type: 1,
                            components: [
                                {
                                    type: 2,
                                    style: 5,
                                    label: "︲เช็กแต้มของคุณ",
                                    emoji: { id: "1212856675053346897", name: "bearcafe_star", animated: false },
                                    url: "https://discord.com/channels/1144251788493602848/1524123727724417276",
                                },
                            ],
                        },
                    ],
                },
            ],
        };

        const res = await fetch(
            `https://discord.com/api/v10/channels/${NOTIFY_CHANNEL_ID}/messages`,
            {
                method: "POST",
                headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
                body: JSON.stringify(componentsPayload),
            }
        );

        if (!res.ok) {
            const errText = await res.text();
            console.error(`[vap] Discord notify ${res.status}:`, errText);
            await db.from("user_notify_buffer").upsert(
                { user_id: discordId, pending_points: pending, last_sent_at: lastSentAt.toISOString() },
                { onConflict: "user_id" }
            );
        }
    } catch (err) {
        console.error("[vap] handleNotification (non-fatal):", err);
    }
}

Deno.serve(async (req): Promise<Response> => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
        const botToken = Deno.env.get("DISCORD_BOT_TOKEN") ?? "";

        if (!supabaseUrl || !supabaseKey) {
            return new Response(JSON.stringify({ error: "Missing env vars" }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const db = createClient(supabaseUrl, supabaseKey, {
            auth: { autoRefreshToken: false, persistSession: false },
        });

        const body = await req.json();
        const eventId = String(body.eventId ?? "");
        const userId = String(body.userId ?? "");
        const duration = Number(body.duration ?? 0);
        const userCount = Number(body.userCount ?? 1);
        const channelName = String(body.channelName ?? "ห้องพูดคุย");

        if (!eventId || !userId) {
            return new Response(JSON.stringify({ error: "eventId and userId required" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        if (duration < CYCLE_SECONDS) {
            return new Response(JSON.stringify({ skipped: true, reason: "duration_too_short" }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        if (userCount < 2) {
            return new Response(JSON.stringify({ skipped: true, reason: "alone_in_voice" }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Idempotency
        const { data: existing } = await db
            .from("processed_events").select("event_id").eq("event_id", eventId).maybeSingle();
        if (existing) {
            return new Response(JSON.stringify({ skipped: true, reason: "duplicate_event" }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const { error: evtErr } = await db
            .from("processed_events").insert({ event_id: eventId, user_id: userId });
        if (evtErr) {
            return new Response(JSON.stringify({ skipped: true, reason: "duplicate_event_race" }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const rawEarned = calculateReward(duration, userCount);
        if (rawEarned <= 0) {
            return new Response(JSON.stringify({ skipped: true, reason: "no_reward" }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const result = await updatePoints(db, userId, rawEarned);
        if (!result) {
            return new Response(JSON.stringify({ skipped: true, reason: "at_cap_or_db_error" }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const { actualEarned, newPoints, maxCap } = result;

        if (botToken && actualEarned > 0) {
            handleNotification(db, userId, actualEarned, botToken, channelName).catch((err) => {
                console.error("[vap] notification unhandled:", err);
            });
        }

        console.log(`[vap] OK ${userId} +${actualEarned} → ${newPoints}/${maxCap}`);

        return new Response(
            JSON.stringify({ success: true, eventId, userId, earned: actualEarned, newPoints, maxCap }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (err) {
        console.error("[vap] Unhandled:", err);
        return new Response(JSON.stringify({ error: "Internal server error" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
});