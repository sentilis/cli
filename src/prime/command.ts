import { defineCommand } from "citty";
import { formatIssue, SentilisApiError } from "@sentilis/sdk";
import { createPrime, publishPrime } from "@sentilis/sdk/prime";
import type { PrimeMetadata } from "@sentilis/sdk/prime";
import { NodeFileSystem } from "@sentilis/sdk/node";

function reportError(err: unknown): never {
  // Entre publicar el paquete y desplegar la plataforma hay una ventana en la
  // que la ruta no existe todavía. Decirlo es más barato que un ticket.
  if (err instanceof SentilisApiError && err.status === 404) {
    console.error("Error: Prime is not available on this server yet. Update required.");
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

function printPlan(metadata: PrimeMetadata): void {
  console.log(`  Name:     ${metadata.name}`);
  console.log(`  Slug:     ${metadata.slug}`);
  console.log(
    `  Price:    ${metadata.price}${
      metadata.currency ? " " + metadata.currency : ""
    } / ${metadata.interval}`,
  );
  console.log(`  Status:   ${metadata.status}`);
  if (metadata.category) console.log(`  Category: ${metadata.category}`);
  if (metadata.cover) console.log(`  Cover:    ${metadata.cover}`);
}

export default defineCommand({
  meta: { name: "prime", description: "Manage prime plans (subscriptions)" },
  subCommands: {
    push: defineCommand({
      meta: {
        name: "push",
        description: "Push a prime plan from a markdown file or directory",
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
            const result = await createPrime(fs, args.path, {
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
                  `  [${issue.code}]${issue.file ? ` (${issue.file})` : ""} ${formatIssue(issue)}`,
                );
              }
              process.exit(1);
            }
            console.log("Dry run OK — prime plan would be pushed.");
            printPlan(result.main.metadata);
          } catch (err) {
            reportError(err);
          }
          return;
        }

        try {
          const { requireAuth } = await import("../config.js");
          const profile = await requireAuth();
          const { createClient } = await import("../client.js");

          const result = await createPrime(fs, args.path);
          const client = createClient(profile);
          const res = await publishPrime(client, fs, result);

          const { metadata } = result.main;
          console.log(`Prime plan pushed: ${metadata.name} (id: ${res.data.id})`);
          console.log(`  URL:      ${res.data.url}`);
          printPlan({ ...metadata, slug: res.data.slug ?? metadata.slug });

          // Publicar no falla porque el proveedor rechace el plan, pero nadie
          // podrá suscribirse hasta que se arregle.
          if (res.data.billingError) {
            console.warn(
              `\nWarning: this plan cannot take subscriptions yet (${res.data.billingError}).`,
            );
            console.warn(
              "Check the payment provider in /studio/payments — a restricted key made for Market",
            );
            console.warn(
              "does not have the Products, Prices, Customers and Subscriptions permissions.",
            );
          }
        } catch (err) {
          reportError(err);
        }
      },
    }),
    list: defineCommand({
      meta: { name: "list", description: "List prime plans" },
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
          const result = await client.listPrime({
            page: Number(args.page) || 1,
            limit: Number(args.limit) || 20,
          });

          const entries = result?.data ?? [];
          if (entries.length === 0) {
            console.log("No prime plans found.");
            return;
          }

          for (const plan of entries) {
            const price = `${plan.price}${
              plan.currency?.name ? " " + plan.currency.name : ""
            } / ${plan.interval}`;
            console.log(`[${plan.id}] ${plan.name} (${price})`);
            console.log(`     Slug:        ${plan.slug}`);
            if (plan.category) console.log(`     Category:    ${plan.category}`);
            console.log(`     Subscribers: ${plan.subscribers}`);
            if (plan.billingError) {
              console.log(`     Not selling: ${plan.billingError}`);
            }
            console.log(`     URL:         ${plan.url}`);
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
      meta: { name: "info", description: "Show a prime plan by ID" },
      args: {
        id: { type: "positional", description: "Plan ID", required: true },
      },
      async run({ args }) {
        try {
          const { requireAuth } = await import("../config.js");
          const profile = await requireAuth();
          const { createClient } = await import("../client.js");

          const client = createClient(profile);
          const { data } = await client.getPrime(String(args.id));

          console.log(`${data.name} (id: ${data.id})`);
          console.log(`  Slug:        ${data.slug}`);
          console.log(
            `  Price:       ${data.price}${
              data.currency?.name ? " " + data.currency.name : ""
            } / ${data.interval}`,
          );
          console.log(`  Status:      ${data.status}`);
          console.log(`  Visibility:  ${data.visibility}`);
          if (data.category) console.log(`  Category:    ${data.category}`);
          if (typeof data.subscribers === "number") {
            console.log(`  Subscribers: ${data.subscribers}`);
          }
          if (data.billingError) {
            console.log(`  Not selling: ${data.billingError}`);
          }
        } catch (err) {
          reportError(err);
        }
      },
    }),
    remove: defineCommand({
      meta: {
        name: "remove",
        description:
          "Remove a prime plan by ID (does not cancel live subscriptions)",
      },
      args: {
        id: { type: "positional", description: "Plan ID", required: true },
      },
      async run({ args }) {
        try {
          const { requireAuth } = await import("../config.js");
          const profile = await requireAuth();
          const { createClient } = await import("../client.js");

          const client = createClient(profile);
          await client.removePrime(String(args.id));
          console.log(`Prime plan ${args.id} removed from the catalogue.`);
          console.log(
            "Live subscriptions keep renewing: to stop selling without touching",
          );
          console.log('them, push the plan again with "status: archived".');
        } catch (err) {
          reportError(err);
        }
      },
    }),
  },
});
