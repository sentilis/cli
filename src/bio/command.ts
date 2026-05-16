import { defineCommand } from "citty";
import { formatIssue } from "@sentilis/core";
import { createBio, publishBio } from "@sentilis/core/bio";
import { NodeFileSystem } from "@sentilis/core/node";

function reportError(err: unknown): never {
  const e = err as Error;
  console.error(`Error: ${e.message ?? String(err)}`);
  if (process.env.DEBUG && e.stack) {
    console.error(e.stack);
  }
  process.exit(1);
}

const fs = new NodeFileSystem();

export default defineCommand({
  meta: { name: "bio", description: "Manage bios" },
  subCommands: {
    push: defineCommand({
      meta: {
        name: "push",
        description:
          "Push a bio from a markdown file or directory of language variants",
      },
      args: {
        path: {
          type: "positional",
          description:
            "Path to a markdown file or a directory of language variants",
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
        const dryRun = args["dry-run"] === true;

        if (dryRun) {
          try {
            const result = await createBio(fs, args.path, {
              collectErrors: true,
            });
            if (result.issues.length > 0) {
              console.error(
                `Found ${result.issues.length} validation error${
                  result.issues.length === 1 ? "" : "s"
                }:`,
              );
              for (const issue of result.issues) {
                console.error(
                  `  - [${issue.code}] ${
                    issue.file ? `(${issue.file}) ` : ""
                  }${formatIssue(issue)}`,
                );
              }
              process.exit(1);
            }
            const { metadata } = result.main;
            console.log(
              `Dry run OK — ${result.variants.length + 1} language variant(s) would be pushed.`,
            );
            console.log(`  Name:        ${metadata.name}`);
            console.log(`  Slug:        ${metadata.slug}`);
            console.log(`  Default:     ${metadata.language}`);
            console.log(`  Status:      ${metadata.status}`);
            console.log(`  Visibility:  ${metadata.visibility}`);
            if (metadata.avatar) {
              console.log(`  Avatar:      ${metadata.avatar}`);
            }
            if (result.variants.length > 0) {
              console.log(
                `  Variants:    ${result.variants
                  .map((v) => v.metadata.language)
                  .join(", ")}`,
              );
            }
          } catch (err) {
            reportError(err);
          }
          return;
        }

        try {
          const { requireAuth } = await import("../config.js");
          const profile = await requireAuth();
          const { createClient } = await import("../client.js");

          const result = await createBio(fs, args.path);
          const client = createClient(profile);

          const res = await publishBio(client, fs, result);

          const { metadata } = result.main;
          console.log(`Bio pushed: ${metadata.name} (id: ${res.data.id})`);
          console.log(`  Slug:        ${res.data.slug ?? metadata.slug}`);
          console.log(`  Default:     ${metadata.language}`);
          console.log(`  Status:      ${metadata.status}`);
          console.log(`  Visibility:  ${metadata.visibility}`);
          if (result.variants.length > 0) {
            console.log(
              `  Variants:    ${result.variants
                .map((v) => v.metadata.language)
                .join(", ")}`,
            );
          }
        } catch (err) {
          reportError(err);
        }
      },
    }),
    list: defineCommand({
      meta: { name: "list", description: "List bios" },
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
          const { createClient } = await import("../client.js");

          const client = createClient(profile);

          let visibilityArr: string[] = [];
          if (Array.isArray(args.visibility)) {
            visibilityArr = args.visibility;
          } else if (typeof args.visibility === "string") {
            visibilityArr = args.visibility.split(",").map((s) => s.trim());
          }

          const result = await client.listBio({
            visibility: visibilityArr,
            page: Number(args.page) || 1,
            limit: Number(args.limit) || 20,
          });

          const entries = result?.data ?? [];
          if (entries.length === 0) {
            console.log("No bios found.");
            return;
          }

          for (const b of entries) {
            console.log(`[${b.id}] ${b.name}`);
            console.log(`     Slug:       ${b.slug}`);
            console.log(`     Language:   ${b.language}`);
            if (b.role) console.log(`     Role:       ${b.role}`);
            if (b.status) console.log(`     Status:     ${b.status}`);
            if (b.visibility) console.log(`     Visibility: ${b.visibility}`);
            console.log(`     URL:        ${b.url}`);
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
      meta: { name: "info", description: "Get details of a bio by ID" },
      args: {
        id: {
          type: "positional",
          description: "Bio ID",
          required: true,
        },
      },
      async run({ args }) {
        try {
          const { requireAuth } = await import("../config.js");
          const profile = await requireAuth();
          const { createClient } = await import("../client.js");

          const client = createClient(profile);
          const result = await client.getBio(String(args.id));
          const b = result.data;

          console.log(`[${b.id}] ${b.name}`);
          console.log(`  Slug:        ${b.slug}`);
          console.log(`  Language:    ${b.language}`);
          console.log(`  Status:      ${b.status}`);
          console.log(
            `  Visibility:  ${b.visibility}${b.hasPassword ? " (password protected)" : ""}`,
          );
          if (b.role) console.log(`  Role:        ${b.role}`);
          if (b.location) console.log(`  Location:    ${b.location}`);
          if (b.email) console.log(`  Email:       ${b.email}`);
          if (b.phone) console.log(`  Phone:       ${b.phone}`);
          if (b.avatarUrl) console.log(`  Avatar:      ${b.avatarUrl}`);
          console.log(`  URL:         ${b.url}`);

          if (b.children && b.children.length > 0) {
            console.log(`\n  Variants (${b.children.length}):`);
            for (const c of b.children) {
              console.log(`    - [${c.id}] ${c.language}: ${c.name}`);
              console.log(`        Slug:       ${c.slug}`);
              if (c.role) console.log(`        Role:       ${c.role}`);
              if (c.status) console.log(`        Status:     ${c.status}`);
              if (c.visibility) console.log(`        Visibility: ${c.visibility}`);
              console.log(`        URL:        ${c.url}`);
            }
          }
        } catch (err) {
          reportError(err);
        }
      },
    }),
    remove: defineCommand({
      meta: { name: "remove", description: "Remove a bio by ID" },
      args: {
        id: {
          type: "positional",
          description: "Bio ID",
          required: true,
        },
      },
      async run({ args }) {
        try {
          const { requireAuth } = await import("../config.js");
          const profile = await requireAuth();
          const { createClient } = await import("../client.js");

          const client = createClient(profile);
          await client.removeBio(String(args.id));
          console.log(`Bio ${args.id} removed.`);
        } catch (err) {
          reportError(err);
        }
      },
    }),
  },
});
