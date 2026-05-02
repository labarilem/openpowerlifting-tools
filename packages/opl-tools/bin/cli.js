#!/usr/bin/env node
import { runGenerate, GENERATE_USAGE } from "../src/cli/generate.js";

const COMMANDS = {
  generate: { run: runGenerate, usage: GENERATE_USAGE },
};

function printRootUsage(log = console.error) {
  log("Usage: opl-tools <command> [args]");
  log("");
  log("Commands:");
  for (const [name, def] of Object.entries(COMMANDS)) {
    log(`  ${name}  ${def.usage}`);
  }
}

const [, , subcommand, ...rest] = process.argv;

if (!subcommand) {
  printRootUsage();
  process.exit(1);
}

if (subcommand === "-h" || subcommand === "--help") {
  printRootUsage(console.log);
  process.exit(0);
}

const cmd = COMMANDS[subcommand];
if (!cmd) {
  console.error(`Unknown command: ${subcommand}`);
  printRootUsage();
  process.exit(1);
}

try {
  await cmd.run(rest);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
