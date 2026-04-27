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
  meta: { name: "market", description: "Manage market products" },
  subCommands: {
    push: defineCommand({
      meta: {
        name: "push",
        description:
          "Push a product from a markdown file or directory",
      },
      args: {
        path: {
          type: "positional",
          description:
            "Path to a markdown file or a directory containing one .md",
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
        const { createProduct } = await import("./market.js");

        const dryRun = args["dry-run"] === true;

        if (dryRun) {
          try {
            const result = await createProduct(args.path, {
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
            console.log(`Dry run OK — product would be pushed.`);
            console.log(`  Name:     ${metadata.name}`);
            console.log(`  Slug:     ${metadata.slug}`);
            console.log(`  Kind:     ${metadata.kind}`);
            console.log(`  Status:   ${metadata.status}`);
            console.log(
              `  Price:    ${metadata.price}${
                metadata.currency ? " " + metadata.currency : ""
              }`,
            );
            if (metadata.category) {
              console.log(`  Category: ${metadata.category}`);
            }
            if (metadata.image) {
              console.log(`  Image:    ${metadata.image}`);
            }
            if (metadata.attachment) {
              console.log(`  Attach:   ${metadata.attachment}`);
            }
            if (metadata.pressUrl) {
              console.log(`  Press:    ${metadata.pressUrl}`);
            }
          } catch (err) {
            reportError(err);
          }
          return;
        }

        try {
          const { requireAuth } = await import("../config.js");
          const profile = await requireAuth();
          const { RestClient } = await import("@sentilis/core");
          const { publishProduct } = await import("./repository.js");

          const result = await createProduct(args.path);
          const client = new RestClient(profile.token, profile.env);
          const res = await publishProduct(client, result);

          const { metadata } = result.main;
          console.log(
            `Product pushed: ${metadata.name} (id: ${res.data.id})`,
          );
          console.log(`  URL:      ${res.data.url}`);
          console.log(`  Slug:     ${res.data.slug ?? metadata.slug}`);
          console.log(`  Kind:     ${metadata.kind}`);
          console.log(`  Status:   ${metadata.status}`);
          console.log(
            `  Price:    ${metadata.price}${
              metadata.currency ? " " + metadata.currency : ""
            }`,
          );
          if (metadata.category) {
            console.log(`  Category: ${metadata.category}`);
          }
        } catch (err) {
          reportError(err);
        }
      },
    }),
    list: defineCommand({
      meta: { name: "list", description: "List market products" },
      args: {
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
          const result = await client.listProduct({
            page: Number(args.page) || 1,
            limit: Number(args.limit) || 20,
          });

          const entries = result?.data ?? [];
          if (entries.length === 0) {
            console.log("No products found.");
            return;
          }

          for (const p of entries) {
            const priceLabel =
              p.price === 0
                ? "free"
                : `${p.price}${p.currency ? " " + p.currency : ""}`;
            console.log(`[${p.id}] ${p.name} (${p.kind}, ${priceLabel})`);
            console.log(`     Slug:     ${p.slug}`);
            if (p.category) console.log(`     Category: ${p.category}`);
            console.log(`     URL:      ${p.url}`);
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
    remove: defineCommand({
      meta: { name: "remove", description: "Remove a product by ID" },
      args: {
        id: {
          type: "positional",
          description: "Product ID",
          required: true,
        },
      },
      async run({ args }) {
        try {
          const { requireAuth } = await import("../config.js");
          const profile = await requireAuth();
          const { RestClient } = await import("@sentilis/core");

          const client = new RestClient(profile.token, profile.env);
          await client.removeProduct(String(args.id));
          console.log(`Product ${args.id} removed.`);
        } catch (err) {
          reportError(err);
        }
      },
    }),
  },
});
