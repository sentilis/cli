import { defineCommand } from "citty";
import { formatIssue, splitIssues, SentilisApiError } from "@sentilis/sdk";
import { createGallery, publishGallery } from "@sentilis/sdk/gallery";
import type { GalleryFile } from "@sentilis/sdk/gallery";
import { NodeFileSystem } from "@sentilis/sdk/node";

function reportError(err: unknown): never {
  // Entre publicar el paquete y desplegar la plataforma hay una ventana en la
  // que la ruta no existe todavía. Decirlo es más barato que un ticket.
  if (err instanceof SentilisApiError && err.status === 404) {
    console.error(
      "Error: Gallery is not available on this server yet. Update required.",
    );
    process.exit(1);
  }
  const e = err as Error;
  console.error(`Error: ${e.message ?? String(err)}`);
  if (process.env.DEBUG && e.stack) {
    console.error(e.stack);
  }
  process.exit(1);
}

const fs = new NodeFileSystem();

/** La cartela, tal y como se leerá en la pared. */
function printEntry(entry: GalleryFile): void {
  const { metadata } = entry;
  console.log(`  Name:       ${metadata.name}`);
  console.log(`  Slug:       ${metadata.slug}`);
  if (metadata.year) console.log(`  Year:       ${metadata.year}`);
  if (metadata.medium) console.log(`  Medium:     ${metadata.medium}`);
  if (metadata.dimensions) console.log(`  Dimensions: ${metadata.dimensions}`);
  if (metadata.edition) console.log(`  Edition:    ${metadata.edition}`);
  if (metadata.series) console.log(`  Series:     ${metadata.series}`);
  console.log(`  Status:     ${metadata.status} / ${metadata.visibility}`);
  console.log(`  Images:     ${entry.images.length}`);
  if (metadata.cover) console.log(`  Cover:      ${metadata.cover}`);
}

export default defineCommand({
  meta: {
    name: "gallery",
    description: "Manage gallery entries (one or more images with a wall label)",
  },
  subCommands: {
    push: defineCommand({
      meta: {
        name: "push",
        description: "Push a gallery entry from a markdown file or directory",
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
            const result = await createGallery(fs, args.path, {
              collectErrors: true,
            });
            const { errors, warnings } = splitIssues(result.issues);
            // Un aviso se imprime y se sigue: si abortara, una errata en una
            // clave impediría publicar la entrada entera.
            for (const issue of warnings) {
              console.error(
                `  ! [${issue.code}]${issue.file ? ` (${issue.file})` : ""} ${formatIssue(issue)}`,
              );
            }
            if (errors.length > 0) {
              console.error(
                `Found ${errors.length} validation error${
                  errors.length === 1 ? "" : "s"
                }:`,
              );
              for (const issue of errors) {
                console.error(
                  `  - [${issue.code}] ${
                    issue.file ? `(${issue.file}) ` : ""
                  }${formatIssue(issue)}`,
                );
              }
              process.exit(1);
            }
            console.log("Dry run: no problems found.");
            printEntry(result.main);
          } catch (err) {
            reportError(err);
          }
          return;
        }

        try {
          const { requireAuth } = await import("../config.js");
          const profile = await requireAuth();
          const { createClient } = await import("../client.js");

          const result = await createGallery(fs, args.path);
          const client = createClient(profile);
          const res = await publishGallery(client, fs, result);

          console.log(
            `Gallery entry pushed: ${result.main.metadata.name} (id: ${res.data.id})`,
          );
          console.log(`  URL:        ${res.data.url}`);
          printEntry({
            ...result.main,
            metadata: {
              ...result.main.metadata,
              slug: res.data.slug ?? result.main.metadata.slug,
            },
          });
        } catch (err) {
          reportError(err);
        }
      },
    }),
    list: defineCommand({
      meta: { name: "list", description: "List gallery entries" },
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
          const result = await client.listGallery({
            page: Number(args.page) || 1,
            limit: Number(args.limit) || 20,
            visibility: ["public", "private", "prime"],
          });

          const entries = result?.data ?? [];
          if (entries.length === 0) {
            console.log("No gallery entries found.");
            return;
          }

          for (const entry of entries) {
            console.log(`[${entry.id}] ${entry.name}`);
            console.log(`     Slug:     ${entry.slug}`);
            if (entry.category) console.log(`     Series:   ${entry.category}`);
            console.log(`     Images:   ${entry.imageCount}`);
            console.log(`     State:    ${entry.status} / ${entry.visibility}`);
            console.log(`     URL:      ${entry.url}`);
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
      meta: { name: "info", description: "Show a gallery entry by ID" },
      args: {
        id: { type: "positional", description: "Entry ID", required: true },
      },
      async run({ args }) {
        try {
          const { requireAuth } = await import("../config.js");
          const profile = await requireAuth();
          const { createClient } = await import("../client.js");

          const client = createClient(profile);
          const { data } = await client.getGallery(String(args.id));

          console.log(`${data.name} (id: ${data.id})`);
          console.log(`  Slug:       ${data.slug}`);
          if (data.year) console.log(`  Year:       ${data.year}`);
          if (data.medium) console.log(`  Medium:     ${data.medium}`);
          if (data.dimensions) console.log(`  Dimensions: ${data.dimensions}`);
          if (data.edition) console.log(`  Edition:    ${data.edition}`);
          if (data.category) console.log(`  Series:     ${data.category}`);
          console.log(`  Status:     ${data.status} / ${data.visibility}`);
          for (const image of data.images ?? []) {
            const size =
              image.width && image.height
                ? ` (${image.width}×${image.height})`
                : "";
            console.log(`  - ${image.caption ?? image.alt ?? ""}${size}`);
          }
        } catch (err) {
          reportError(err);
        }
      },
    }),
    remove: defineCommand({
      meta: { name: "remove", description: "Remove a gallery entry by ID" },
      args: {
        id: { type: "positional", description: "Entry ID", required: true },
      },
      async run({ args }) {
        try {
          const { requireAuth } = await import("../config.js");
          const profile = await requireAuth();
          const { createClient } = await import("../client.js");

          const client = createClient(profile);
          await client.removeGallery(String(args.id));
          console.log(`Gallery entry ${args.id} taken down.`);
        } catch (err) {
          reportError(err);
        }
      },
    }),
  },
});
