import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { Config, Profile } from "@sentilis/core";

const CONFIG_DIR = join(homedir(), ".sentilis");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export function getConfigPath(): string {
  return CONFIG_FILE;
}

export function getActiveProfile(): string | null {
  return process.env.SENTILIS_PROFILE ?? null;
}

export async function loadConfig(): Promise<Config | null> {
  try {
    const data = await readFile(CONFIG_FILE, "utf-8");
    return JSON.parse(data) as Config;
  } catch {
    return null;
  }
}

export async function login(
  token: string,
  username: string,
  env?: string,
): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  const config = (await loadConfig()) ?? { profiles: {} };
  config.profiles[username] = { token, ...(env ? { env } : {}) };
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n");
}

export async function logout(username: string): Promise<boolean> {
  const config = await loadConfig();
  if (!config || !Object.prototype.hasOwnProperty.call(config.profiles, username))
    return false;
  delete config.profiles[username];
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n");
  return true;
}

export async function loadProfile(profile?: string): Promise<Profile | null> {
  const config = await loadConfig();
  if (!config) return null;
  const name = profile ?? getActiveProfile();
  if (name) {
    return Object.prototype.hasOwnProperty.call(config.profiles, name)
      ? config.profiles[name]
      : null;
  }
  // No explicit selection: use the first profile in insertion order.
  const names = Object.keys(config.profiles);
  if (names.length > 0) return config.profiles[names[0]];
  return null;
}

export async function saveConfig(config: Config): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n");
}

export class NotAuthenticatedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotAuthenticatedError";
  }
}

export async function requireAuth(profile?: string): Promise<Profile> {
  const config = await loadConfig();
  const name = profile ?? getActiveProfile();
  const names = config ? Object.keys(config.profiles) : [];

  if (!config || names.length === 0) {
    throw new NotAuthenticatedError(
      "Not logged in. Run: sentilis auth login <token>",
    );
  }

  if (name) {
    if (!Object.prototype.hasOwnProperty.call(config.profiles, name)) {
      throw new NotAuthenticatedError(
        `Profile "${name}" not found. Run: sentilis auth login <token>`,
      );
    }
    return config.profiles[name];
  }

  // No explicit selection: use the first profile in insertion order.
  return config.profiles[names[0]];
}
