// utils/errorThrottler.js
// Utility to detect Supabase quota limit errors and throttle repetitive error logs

const errorCounts = new Map();
const lastLoggedTimes = new Map();

/**
 * Checks if an error object or string indicates a Supabase quota violation.
 * @param {any} err 
 * @returns {boolean}
 */
function isSupabaseQuotaError(err) {
  if (!err) return false;
  const msg = typeof err === "string"
    ? err
    : err.message || JSON.stringify(err.response?.data || err);

  return (
    typeof msg === "string" &&
    (msg.includes("exceed_egress_quota") ||
     msg.includes("restricted due to the following violations") ||
     msg.includes("quota") ||
     msg.includes("SUPABASE_EDGE_RUNTIME_SERVICE_DEGRADED"))
  );
}

/**
 * Determines whether an error log should be printed or suppressed.
 * @param {string} key Unique identifier for the error category/source
 * @param {any} error Error object or message
 * @param {number} throttleMs Time window in milliseconds (default: 5 minutes)
 * @returns {{ shouldLog: boolean, count: number, message: string }}
 */
function shouldLogThrottledError(key, error, throttleMs = 5 * 60 * 1000) {
  const now = Date.now();
  const lastTime = lastLoggedTimes.get(key) || 0;
  const currentCount = (errorCounts.get(key) || 0) + 1;
  errorCounts.set(key, currentCount);

  const errorMsg = typeof error === "string"
    ? error
    : error?.message || JSON.stringify(error?.response?.data || error);

  if (now - lastTime >= throttleMs) {
    lastLoggedTimes.set(key, now);
    const suppressed = currentCount - 1;
    errorCounts.set(key, 0); // Reset count after logging

    let formattedMsg = errorMsg;
    if (suppressed > 0) {
      formattedMsg = `[Suppressed ${suppressed} identical errors over past ${Math.round(throttleMs / 60000)}m] ${errorMsg}`;
    }

    return {
      shouldLog: true,
      count: currentCount,
      message: formattedMsg
    };
  }

  return {
    shouldLog: false,
    count: currentCount,
    message: errorMsg
  };
}

module.exports = {
  isSupabaseQuotaError,
  shouldLogThrottledError
};
