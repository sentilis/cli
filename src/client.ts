import { createRequire } from "node:module";
import os from "node:os";
import { RestClient } from "@sentilis/core";
import type { Profile } from "@sentilis/core";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pkg = require("../package.json") as { name: string; version: string };

let cached: Record<string, string> | null = null;

/**
 * Build the headers that identify this CLI process to the API.
 * Computed once per process — the values are static at runtime.
 */
export function buildClientHeaders(): Record<string, string> {
  if (cached) return cached;
  cached = {
    Origin: "https://sentilis.me",
    "x-ss-tenant-id": "cli",
    "X-Client-Name": pkg.name,
    "X-Client-Version": pkg.version,
    "X-OS-Platform": os.platform(),
    "X-OS-Release": os.release(),
    "X-OS-Arch": os.arch(),
    "X-Node-Version": process.version,
  };
  return cached;
}

/**
 * Construct a `RestClient` pre-wired with the CLI's identification headers.
 * Every command path should go through this factory.
 */
export function createClient(profile: Profile): RestClient {
  return new RestClient(profile.token, profile.env, {
    headers: buildClientHeaders(),
  });
}
