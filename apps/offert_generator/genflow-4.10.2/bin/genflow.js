#!/usr/bin/env node
import { runPreflight } from "../server/lib/preflight.js";

console.log("\n  genflow v0.1.0\n");

const check = runPreflight();
if (!check.ok) {
  console.error(`  ✗ ${check.error}\n`);
  process.exit(1);
}

console.log("  ✓ Claude Code ready");
console.log("  ✓ Python ready");
console.log("  ✓ Starting server...\n");

// Prevent crashes from killing the server
process.on("uncaughtException", (err) => {
  console.error(`  [UNCAUGHT] ${err.message}`);
});
process.on("unhandledRejection", (err) => {
  console.error(`  [UNHANDLED] ${err}`);
});

const { startServer } = await import("../server/index.js");
startServer(1337);
