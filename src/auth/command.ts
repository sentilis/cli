import { defineCommand } from "citty";

export default defineCommand({
  meta: { name: "auth", description: "Manage authentication profiles" },
  subCommands: {
    login: defineCommand({
      meta: { name: "login", description: "Authenticate with a token" },
      args: {
        token: {
          type: "positional",
          description: "Authentication token",
          required: true,
        },
        env: {
          type: "string",
          description: "Environment (dev | prod)",
          default: "prod",
        },
      },
      async run({ args }) {
        const { validateToken } = await import("@sentilis/core");
        const { login, getConfigPath } = await import("../config.js");
        try {
          const username = await validateToken(args.token, args.env);
          await login(args.token, username, args.env);
          console.log(
            `Logged in as "${username}" (${args.env}). Config saved to ${getConfigPath()}`,
          );
        } catch (err) {
          const e = err as Error;
          console.error(`Login failed: ${e.message ?? String(err)}`);
          if (process.env.DEBUG && e.stack) console.error(e.stack);
          process.exit(1);
        }
      },
    }),
    logout: defineCommand({
      meta: { name: "logout", description: "Remove a saved authentication" },
      args: {
        username: {
          type: "positional",
          description: "Username to log out (defaults to active profile)",
          required: false,
        },
        all: {
          type: "boolean",
          description: "Remove all authenticated profiles",
          default: false,
        },
      },
      async run({ args }) {
        const { loadConfig, getActiveProfile, logout, saveConfig, getConfigPath } =
          await import("../config.js");

        if (args.all) {
          await saveConfig({ profiles: {} });
          console.log(`All profiles removed. Config updated at ${getConfigPath()}`);
          return;
        }

        const config = await loadConfig();
        const names = config ? Object.keys(config.profiles) : [];
        if (names.length === 0) {
          console.log("No authenticated profiles to remove.");
          return;
        }
        const target = args.username ?? getActiveProfile() ?? names[0];
        const removed = await logout(target);
        if (!removed) {
          console.error(`Profile "${target}" not found.`);
          process.exit(1);
        }
        console.log(`Logged out "${target}". Config updated at ${getConfigPath()}`);
      },
    }),
    whoami: defineCommand({
      meta: { name: "whoami", description: "Display the active profile" },
      async run() {
        const { loadConfig, getActiveProfile } = await import("../config.js");
        const config = await loadConfig();
        const names = config ? Object.keys(config.profiles) : [];
        if (names.length === 0) {
          console.log("Not logged in.");
          return;
        }
        const active = getActiveProfile() ?? names[0];
        const p = config!.profiles[active];
        if (!p) {
          console.log(`Profile "${active}" selected but not found in config.`);
          return;
        }
        console.log(`${active} (${p.env ?? "prod"})`);
      },
    }),
    profiles: defineCommand({
      meta: { name: "profiles", description: "List all authenticated profiles" },
      async run() {
        const { loadConfig, getActiveProfile } = await import("../config.js");
        const config = await loadConfig();
        const names = config ? Object.keys(config.profiles) : [];
        if (names.length === 0) {
          console.log("No authenticated profiles.");
          return;
        }
        const active = getActiveProfile() ?? names[0];
        for (const name of names) {
          const p = config!.profiles[name];
          const marker = name === active ? "*" : " ";
          console.log(`${marker} ${name} (${p.env ?? "prod"})`);
        }
      },
    }),
  },
});
