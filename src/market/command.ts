import { defineCommand } from "citty";
import { formatIssue } from "../sdk/errors.js";
import { createProduct, publishProduct } from "../sdk/market/index.js";
import { NodeFileSystem } from "../sdk/node.js";

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
  meta: { name: "market", description: "Manage market products" },
  subCommands: {
    push: defineCommand({
      meta: {
        name: "push",
        description: "Push a product from a markdown file or directory",
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
        const dryRun = args["dry-run"] === true;

        if (dryRun) {
          try {
            const result = await createProduct(fs, args.path, {
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
          const { createClient } = await import("../client.js");

          const result = await createProduct(fs, args.path);
          const client = createClient(profile);
          const res = await publishProduct(client, fs, result);

          const { metadata } = result.main;
          console.log(`Product pushed: ${metadata.name} (id: ${res.data.id})`);
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
          const { createClient } = await import("../client.js");

          const client = createClient(profile);
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
          const { createClient } = await import("../client.js");

          const client = createClient(profile);
          await client.removeProduct(String(args.id));
          console.log(`Product ${args.id} removed.`);
        } catch (err) {
          reportError(err);
        }
      },
    }),
    attach: defineCommand({
      meta: {
        name: "attach",
        description: "Upload a private attachment to a product by ID",
      },
      args: {
        id: {
          type: "positional",
          description: "Product ID",
          required: true,
        },
        file: {
          type: "positional",
          description: "Path to the file to attach",
          required: true,
        },
      },
      async run({ args }) {
        try {
          const id = String(args.id).trim();
          if (!id) {
            throw new Error("Product ID is required.");
          }

          const { stat, readFile } = await import("node:fs/promises");
          const { basename, isAbsolute, resolve } = await import("node:path");

          const filePath = isAbsolute(args.file)
            ? args.file
            : resolve(args.file);
          const info = await stat(filePath).catch(() => null);
          if (!info || !info.isFile()) {
            throw new Error(`File does not exist: ${filePath}`);
          }
          if (info.size === 0) {
            throw new Error(`File is empty: ${filePath}`);
          }

          const { requireAuth } = await import("../config.js");
          const profile = await requireAuth();
          const { createClient } = await import("../client.js");

          const data = await readFile(filePath);
          const ab = new ArrayBuffer(data.byteLength);
          new Uint8Array(ab).set(data);

          const formData = new FormData();
          formData.append("file", new Blob([ab]), basename(filePath));

          const client = createClient(profile);
          const res = await client.attachProduct(id, formData);

          console.log(`Attachment uploaded for product ${res.data.id}.`);
          console.log(`  Attachment: ${res.data.attachment}`);
        } catch (err) {
          reportError(err);
        }
      },
    }),
  },
});
