#!/usr/bin/env node

import { defineCommand, runMain } from "citty";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { name: string; version: string };

// Extract --profile / -p and --debug from argv before citty parses it
const argv = process.argv.slice(2);
const profileIdx = argv.findIndex((a) => a === "--profile" || a === "-p");
if (profileIdx !== -1 && argv[profileIdx + 1]) {
  process.env.SENTILIS_PROFILE = argv[profileIdx + 1];
  argv.splice(profileIdx, 2);
}
for (const flag of ["--debug", "--verbose", "-v"]) {
  const idx = argv.indexOf(flag);
  if (idx !== -1) {
    process.env.DEBUG = "1";
    argv.splice(idx, 1);
  }
}

const main = defineCommand({
  meta: {
    name: "sentilis",
    version: pkg.version,
    description: "Sentilis CLI",
  },
  subCommands: {
    auth: () => import("./auth/command.js").then((m) => m.default),
    press: () => import("./press/command.js").then((m) => m.default),
    market: () => import("./market/command.js").then((m) => m.default),
  },
});

runMain(main, { rawArgs: argv });
