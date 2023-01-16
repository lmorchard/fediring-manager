#!/usr/bin/env node
import FediringManager from "./bot.js";

async function main() {
  const bot = new FediringManager();
  return bot.run();
}

await main();
