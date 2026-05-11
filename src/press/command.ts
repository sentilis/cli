import { defineCommand } from "citty";

function reportError(err: unknown): never {
  const e = err as Error;
  console.error(`Error: ${e.message ?? String(err)}`);
  if (process.env.DEBUG && e.stack) {
    console.error(e.stack);
  }
  process.exit(1);
}

export default defineCommand({
  meta: { name: "press", description: "Manage press" },
  subCommands: {
    push: defineCommand({
      meta: {
        name: "push",
        description: "Push a press entry from a markdown file or directory",
      },
      args: {
        path: {
          type: "positional",
          description:
            "Path to a markdown file or directory containing markdown files",
          required: true,
        },
        "dry-run": {
          type: "boolean",
          description:
            "Validate all files and report every error without uploading",
          default: false,
        },
      },
      async run({ args }) {
        const { createPress } = await import("./press.js");

        const dryRun = args["dry-run"] === true;

        if (dryRun) {
          try {
            const result = await createPress(args.path, {
              collectErrors: true,
            });
            if (result.errors.length > 0) {
              console.error(
                `Found ${result.errors.length} validation error${
                  result.errors.length === 1 ? "" : "s"
                }:`,
              );
              for (const e of result.errors) {
                console.error(`  - [${e.file}] ${e.message}`);
              }
              process.exit(1);
            }
            const { metadata } = result.main;
            console.log(
              `Dry run OK — ${result.hidden.length + 1} file(s) would be pushed.`,
            );
            console.log(`  Main:     ${metadata.name} (slug: ${metadata.slug})`);
            if (result.hidden.length > 0) {
              console.log(
                `  Children: ${result.hidden
                  .map((h) => `${h.metadata.name} (${h.metadata.slug})`)
                  .join(", ")}`,
              );
            }
          } catch (err) {
            // Fatal structural errors (missing path, no .md files, etc.)
            // surface here even in dry-run mode.
            reportError(err);
          }
          return;
        }

        try {
          const { requireAuth } = await import("../config.js");
          const profile = await requireAuth();
          const { RestClient } = await import("@sentilis/core");
          const { publishPress } = await import("./repository.js");

          const result = await createPress(args.path);
          const client = new RestClient(profile.token, profile.env);

          const res = await publishPress(client, result);

          const { metadata } = result.main;
          console.log(
            `Press pushed: ${metadata.name} (id: ${res.data.id})`,
          );
          console.log(`  URL:      ${res.data.url}`);
          console.log(`  Slug:     ${res.data.slug ?? metadata.slug}`);
          console.log(`  Status:   ${metadata.status}`);
          console.log(`  Category: ${metadata.category ?? "(none)"}`);
          if (metadata.tags.length > 0) {
            console.log(`  Tags:     ${metadata.tags.join(", ")}`);
          }
          if (metadata.authors.length > 0) {
            console.log(`  Authors:  ${metadata.authors.join(", ")}`);
          }
          if (result.hidden.length > 0) {
            console.log(
              `  Children: ${result.hidden.map((h) => h.metadata.name).join(", ")}`,
            );
          }
        } catch (err) {
          reportError(err);
        }
      },
    }),
    list: defineCommand({
      meta: { name: "list", description: "List press entries" },
      args: {
        visibility: {
          type: "string",
          description:
            "Filter by visibility (public, private, protected, prime). Comma-separated or multiple flags.",
          default: "public",
        },
        page: {
          type: "string",
          description: "Page number (1-based)",
          default: "1",
        },
        limit: {
          type: "string",
          description: "Items per page (1–100)",
          default: "20",
        },
      },
      async run({ args }) {
        try {
          const { requireAuth } = await import("../config.js");
          const profile = await requireAuth();
          const { RestClient } = await import("@sentilis/core");

          const client = new RestClient(profile.token, profile.env);

          let visibilityArr: string[] = [];
          if (Array.isArray(args.visibility)) {
            visibilityArr = args.visibility;
          } else if (typeof args.visibility === "string") {
            visibilityArr = args.visibility.split(",").map(s => s.trim());
          }

          const result = await client.listPress({
            visibility: visibilityArr,
            page: Number(args.page) || 1,
            limit: Number(args.limit) || 20,
          });

          const entries = result?.data ?? [];
          if (entries.length === 0) {
            console.log("No press entries found.");
            return;
          }

          for (const s of entries) {
            console.log(`[${s.id}] ${s.name}`);
            console.log(`     Slug:       ${s.slug}`);
            if (s.status) console.log(`     Status:     ${s.status}`);
            if (s.visibility) console.log(`     Visibility: ${s.visibility}`);
            if (s.category) console.log(`     Category:   ${s.category}`);
            if (s.tags && s.tags.length > 0) {
              console.log(`     Tags:       ${s.tags.join(", ")}`);
            }
            console.log(`     URL:        ${s.url}`);
          }

          const { pagination } = result;
          if (pagination) {
            console.log(
              `\nPage ${pagination.page}/${pagination.totalPages} ` +
                `(${entries.length} of ${pagination.total} entries, limit ${pagination.limit})`,
            );
          }
        } catch (err) {
          reportError(err);
        }
      },
    }),
    info: defineCommand({
      meta: { name: "info", description: "Get details of a press entry by ID" },
      args: {
        id: {
          type: "positional",
          description: "Press entry ID",
          required: true,
        },
      },
      async run({ args }) {
        try {
          const { requireAuth } = await import("../config.js");
          const profile = await requireAuth();
          const { RestClient } = await import("@sentilis/core");

          const client = new RestClient(profile.token, profile.env);
          const result = await client.getPress(String(args.id));
          const p = result.data;

          console.log(`[${p.id}] ${p.name}`);
          console.log(`  Slug:       ${p.slug}`);
          console.log(`  Status:     ${p.status}`);
          console.log(`  Visibility: ${p.visibility}`);
          if (p.category) console.log(`  Category:   ${p.category}`);
          if (p.tags && p.tags.length > 0) {
            console.log(`  Tags:       ${p.tags.join(", ")}`);
          }
          if (p.authors && p.authors.length > 0) {
            console.log(`  Authors:    ${p.authors.join(", ")}`);
          }
          console.log(`  URL:        ${p.url}`);

          if (p.children && p.children.length > 0) {
            console.log(`\n  Children (${p.children.length}):`);
            for (const child of p.children) {
              console.log(`    - [${child.id}] ${child.name}`);
              console.log(`        Slug:       ${child.slug}`);
              if (child.status) console.log(`        Status:     ${child.status}`);
              if (child.visibility) console.log(`        Visibility: ${child.visibility}`);
              if (child.category) console.log(`        Category:   ${child.category}`);
              if (child.url) console.log(`        URL:        ${child.url}`);
            }
          }
        } catch (err) {
          reportError(err);
        }
      },
    }),
    remove: defineCommand({
      meta: { name: "remove", description: "Remove a press entry by ID" },
      args: {
        id: {
          type: "positional",
          description: "Press entry ID",
          required: true,
        },
      },
      async run({ args }) {
        try {
          const { requireAuth } = await import("../config.js");
          const profile = await requireAuth();
          const { RestClient } = await import("@sentilis/core");

          const client = new RestClient(profile.token, profile.env);
          await client.removePress(String(args.id));
          console.log(`Press entry ${args.id} removed.`);
        } catch (err) {
          reportError(err);
        }
      },
    }),
  },
});
