// src/services/supabaseClient.js
// ศูนย์กลางเชื่อมต่อ Supabase แบบ Singleton เพื่อแชร์ Connection Pool และประหยัด RAM

const { createClient } = require("@supabase/supabase-js");

let supabaseInstance = null;

/**
 * รับอินสแตนซ์ Supabase Client ส่วนกลาง (Singleton)
 * @returns {import("@supabase/supabase-js").SupabaseClient|null}
 */
function getSupabaseClient() {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  supabaseInstance = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return supabaseInstance;
}

module.exports = {
  getSupabaseClient,
  getSupabase: getSupabaseClient,
};
