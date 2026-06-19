const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const requiredFiles = [
  "index.js",
  "config.js",
  "package.json",
  "package-lock.json",
  "Dockerfile",
];

const requiredEnv = [
  "BOT_TOKEN",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
];

const optionalEnv = ["PORT", "WEBHOOK_URL", "ROOM_LOG_WEBHOOK_URL", "VOICE_POINTS_URL"];

function fail(message) {
  console.error(`[preflight] FAIL: ${message}`);
  process.exitCode = 1;
}

function warn(message) {
  console.warn(`[preflight] WARN: ${message}`);
}

function ok(message) {
  console.log(`[preflight] OK: ${message}`);
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(fullPath, files);
    else files.push(fullPath);
  }
  return files;
}

for (const file of requiredFiles) {
  exists(file) ? ok(`${file} exists`) : fail(`${file} is missing`);
}

if (exists(".env")) {
  require("dotenv").config({ path: path.join(root, ".env") });
  ok(".env loaded for local preflight");
} else {
  warn(".env not found locally");
}

if (!process.env.BOT_TOKEN && process.env.DISCORD_TOKEN) {
  warn("DISCORD_TOKEN is set, but deploy uses BOT_TOKEN. Rename DISCORD_TOKEN to BOT_TOKEN before Koyeb.");
}

for (const key of requiredEnv) {
  process.env[key] ? ok(`${key} is set`) : fail(`${key} is missing`);
}

for (const key of optionalEnv) {
  if (!process.env[key]) warn(`${key} is not set`);
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
if (packageJson.scripts?.start !== "node index.js") {
  warn("start script is not node index.js");
}
if (!packageJson.engines?.node) {
  warn("package.json has no engines.node");
}

const dockerfile = fs.readFileSync(path.join(root, "Dockerfile"), "utf8");
if (!dockerfile.includes("package-lock.json")) {
  warn("Dockerfile does not copy package-lock.json before install");
}
if (!dockerfile.includes("npm ci")) {
  warn("Dockerfile should use npm ci --omit=dev for deterministic Koyeb builds");
}

const suspicious = walk(root).filter((file) => {
  const lower = path.basename(file).toLowerCase();
  return lower.endsWith(".zip") || fs.statSync(file).size > 5 * 1024 * 1024;
});

if (suspicious.length) {
  for (const file of suspicious) warn(`check committed file: ${path.relative(root, file)}`);
} else {
  ok("no suspicious large/archive files found");
}

const jsFiles = walk(root).filter((file) => file.endsWith(".js"));
for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ["--check", file], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status === 0) {
    ok(`syntax ${path.relative(root, file)}`);
  } else {
    fail(`syntax ${path.relative(root, file)}\n${result.stderr || result.stdout}`);
  }
}

if (!process.exitCode) {
  console.log("[preflight] Ready for deploy.");
}
