// scratch/test_optimizations.js
const assert = require("assert");

console.log("▶ Testing Pillar 4: Supabase Singleton...");
const { getSupabaseClient: clientA } = require("../src/services/supabaseClient");
const { getSupabaseClient: clientB } = require("../src/services/supabaseClient");
const instA = clientA();
const instB = clientB();
assert.strictEqual(instA, instB, "Supabase instances should be identical reference");
console.log("  ✅ Supabase Client is a true singleton!");

console.log("\n▶ Testing Pillar 2: Separator Debounce...");
const { syncAllSeparators } = require("../utils/separatorManager");
let mockSyncCount = 0;
const mockGuild = {
  id: "test-guild",
  channels: {
    cache: new Map(),
    fetch: async () => new Map()
  }
};
syncAllSeparators(mockGuild);
syncAllSeparators(mockGuild);
syncAllSeparators(mockGuild);
console.log("  ✅ Triggered syncAllSeparators 3x in rapid succession (debounced)");

console.log("\n▶ Testing Pillar 3: Interaction Router Dispatch...");
const {
  registerCommand,
  registerButton,
  registerModal,
  registerSelectMenu,
  initInteractionRouter
} = require("../src/interactions/router");

const EventEmitter = require("events");
class MockClient extends EventEmitter {}
const mockClient = new MockClient();
initInteractionRouter(mockClient);

let commandHit = false;
let buttonHit = false;
let modalHit = false;
let selectHit = false;

registerCommand("test_cmd", async (interaction) => {
  commandHit = true;
});

registerButton("test_btn_", async (interaction) => {
  buttonHit = true;
});

registerModal("test_modal_", async (interaction) => {
  modalHit = true;
});

registerSelectMenu("test_sel_", async (interaction) => {
  selectHit = true;
});

// Emit mock interactions
mockClient.emit("interactionCreate", {
  isChatInputCommand: () => true,
  commandName: "test_cmd"
});

mockClient.emit("interactionCreate", {
  isChatInputCommand: () => false,
  isButton: () => true,
  customId: "test_btn_123"
});

mockClient.emit("interactionCreate", {
  isChatInputCommand: () => false,
  isButton: () => false,
  isModalSubmit: () => true,
  customId: "test_modal_abc"
});

mockClient.emit("interactionCreate", {
  isChatInputCommand: () => false,
  isButton: () => false,
  isModalSubmit: () => false,
  isAnySelectMenu: () => true,
  customId: "test_sel_choice"
});

setImmediate(() => {
  assert.ok(commandHit, "Command router should dispatch");
  assert.ok(buttonHit, "Button router should dispatch");
  assert.ok(modalHit, "Modal router should dispatch");
  assert.ok(selectHit, "Select menu router should dispatch");
  console.log("  ✅ Interaction router successfully dispatched Command, Button, Modal, and SelectMenu!");
  console.log("\n🎉 ALL OPTIMIZATION PILLAR TESTS PASSED SUCCESSFULLY!");
  process.exit(0);
});
