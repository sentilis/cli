import { defineCommand } from "citty";
import { formatIssue, type ValidationIssue } from "../sdk/errors.js";
import { discoverWorkspace, type WorkspaceEntry } from "../sdk/workspace/index.js";
import { createBio, publishBio } from "../sdk/bio/index.js";
import { createPress, publishPress } from "../sdk/press/index.js";
import { createProduct, publishProduct } from "../sdk/market/index.js";
import { NodeFileSystem } from "../sdk/node.js";
import type { RestClient } from "../sdk/client.js";

const fs = new NodeFileSystem();

interface EntryResult {
  entry: WorkspaceEntry;
  issues: ValidationIssue[];
  /** Set once a validated entry has been published. */
  published?: {
    id: string;
    url: string | null;
    slug: string;
  };
  /** Set when validation threw structurally (e.g. NO_MARKDOWN_FILES). */
  fatal?: Error;
}

function reportError(err: unknown): never {
  const e = err as Error;
  console.error(`Error: ${e.message ?? String(err)}`);
  if (process.env.DEBUG && e.stack) {
    console.error(e.stack);
  }
  process.exit(1);
}

function printIssues(label: string, issues: ValidationIssue[]): void {
  console.error(
    `  ${label}: ${issues.length} issue${issues.length === 1 ? "" : "s"}`,
  );
  for (const issue of issues) {
    console.error(
      `    - [${issue.code}] ${
        issue.file ? `(${issue.file}) ` : ""
      }${formatIssue(issue)}`,
    );
  }
}

/**
 * Validate one workspace entry without touching the network. Returns the
 * resolved "create result" for later publication along with any issues
 * surfaced during parsing. Structural problems (missing path, wrong type)
 * are caught and reported as a `fatal` rather than thrown — sync should
 * keep moving across entries.
 */
async function validateEntry(
  entry: WorkspaceEntry,
): Promise<{
  result?: PressCreate | BioCreate | MarketCreate;
  issues: ValidationIssue[];
  fatal?: Error;
}> {
  try {
    if (entry.kind === "bio") {
      const result = await createBio(fs, entry.path, { collectErrors: true });
      return { result: { kind: "bio", value: result }, issues: result.issues };
    }
    if (entry.kind === "press") {
      const result = await createPress(fs, entry.path, { collectErrors: true });
      return {
        result: { kind: "press", value: result },
        issues: result.issues,
      };
    }
    const result = await createProduct(fs, entry.path, { collectErrors: true });
    return { result: { kind: "market", value: result }, issues: result.issues };
  } catch (err) {
    return { issues: [], fatal: err as Error };
  }
}

type PressCreate = {
  kind: "press";
  value: Awaited<ReturnType<typeof createPress>>;
};
type BioCreate = {
  kind: "bio";
  value: Awaited<ReturnType<typeof createBio>>;
};
type MarketCreate = {
  kind: "market";
  value: Awaited<ReturnType<typeof createProduct>>;
};
type AnyCreate = PressCreate | BioCreate | MarketCreate;

async function publishEntry(
  client: RestClient,
  result: AnyCreate,
): Promise<{ id: string; url: string | null; slug: string }> {
  if (result.kind === "bio") {
    const res = await publishBio(client, fs, result.value);
    return {
      id: String(res.data.id),
      url: null,
      slug: res.data.slug ?? result.value.main.metadata.slug,
    };
  }
  if (result.kind === "press") {
    const res = await publishPress(client, fs, result.value);
    return {
      id: String(res.data.id),
      url: res.data.url,
      slug: res.data.slug ?? result.value.main.metadata.slug,
    };
  }
  const res = await publishProduct(client, fs, result.value);
  return {
    id: String(res.data.id),
    url: res.data.url,
    slug: res.data.slug ?? result.value.main.metadata.slug,
  };
}

function entryLabel(entry: WorkspaceEntry): string {
  return `${entry.kind}/${entry.label}`;
}

export default defineCommand({
  meta: {
    name: "sync",
    description:
      "Validate and publish every bio / press / market entry under a workspace directory",
  },
  args: {
    path: {
      type: "positional",
      description: "Workspace root (the folder containing bio/, press/, market/)",
      required: true,
    },
    strict: {
      type: "boolean",
      description:
        "Fail the whole run if any entry has validation errors (nothing is published)",
      default: false,
    },
    "dry-run": {
      type: "boolean",
      description: "Validate everything without publishing",
      default: false,
    },
  },
  async run({ args }) {
    const strict = args.strict === true;
    const dryRun = args["dry-run"] === true;

    let tree;
    try {
      tree = await discoverWorkspace(fs, args.path);
    } catch (err) {
      reportError(err);
    }

    const entries: WorkspaceEntry[] = [
      ...(tree.bio ? [tree.bio] : []),
      ...tree.press,
      ...tree.market,
    ];

    if (entries.length === 0) {
      console.log(
        `No entries found in ${tree.rootDir}. ` +
          `Expected a bio/, press/, or market/ subfolder.`,
      );
      return;
    }

    console.log(
      `Discovered ${entries.length} entr${
        entries.length === 1 ? "y" : "ies"
      } in ${tree.rootDir}:`,
    );
    if (tree.bio) console.log(`  bio:    1 (the bio/ folder)`);
    if (tree.press.length > 0) console.log(`  press:  ${tree.press.length}`);
    if (tree.market.length > 0) console.log(`  market: ${tree.market.length}`);
    console.log("");

    const results: Array<EntryResult & { create?: AnyCreate }> = [];
    for (const entry of entries) {
      const { result, issues, fatal } = await validateEntry(entry);
      results.push({ entry, issues, fatal, create: result });
    }

    const totalIssues = results.reduce((n, r) => n + r.issues.length, 0);
    const fatalCount = results.filter((r) => r.fatal).length;
    const badCount = results.filter(
      (r) => r.fatal || r.issues.length > 0,
    ).length;

    if (totalIssues > 0 || fatalCount > 0) {
      console.error(
        `Validation: ${badCount} of ${entries.length} entr${
          entries.length === 1 ? "y has" : "ies have"
        } issues.`,
      );
      for (const r of results) {
        if (r.fatal) {
          console.error(
            `  ${entryLabel(r.entry)}: ${r.fatal.message}`,
          );
        }
        if (r.issues.length > 0) {
          printIssues(entryLabel(r.entry), r.issues);
        }
      }
      console.error("");
    } else {
      console.log(`All ${entries.length} entries validated cleanly.`);
    }

    const shouldAbort = strict && (totalIssues > 0 || fatalCount > 0);
    if (shouldAbort) {
      console.error(
        `--strict: aborting without publishing because ${badCount} entr${
          badCount === 1 ? "y has" : "ies have"
        } issues.`,
      );
      process.exit(1);
    }

    if (dryRun) {
      const wouldPublish = results.filter(
        (r) => !r.fatal && r.issues.length === 0,
      ).length;
      console.log(
        `Dry run: ${wouldPublish} of ${entries.length} entr${
          entries.length === 1 ? "y" : "ies"
        } would be published.`,
      );
      if (totalIssues > 0 || fatalCount > 0) process.exit(1);
      return;
    }

    const publishable = results.filter(
      (r) => r.create && !r.fatal && r.issues.length === 0,
    );
    if (publishable.length === 0) {
      console.error("Nothing to publish.");
      process.exit(1);
    }

    const { requireAuth } = await import("../config.js");
    const profile = await requireAuth();
    const { createClient } = await import("../client.js");
    const client = createClient(profile);

    console.log(
      `Publishing ${publishable.length} entr${
        publishable.length === 1 ? "y" : "ies"
      }...`,
    );

    let published = 0;
    let failed = 0;
    for (const r of publishable) {
      try {
        // Non-null: publishable filter requires `create`.
        const summary = await publishEntry(client, r.create as AnyCreate);
        r.published = summary;
        published++;
        const where = summary.url ? ` → ${summary.url}` : ` (slug: ${summary.slug})`;
        console.log(
          `  ✓ ${entryLabel(r.entry)}${where} (id: ${summary.id})`,
        );
      } catch (err) {
        failed++;
        const e = err as Error;
        console.error(`  ✗ ${entryLabel(r.entry)}: ${e.message ?? err}`);
        if (process.env.DEBUG && e.stack) console.error(e.stack);
      }
    }

    const skipped = results.length - publishable.length;
    console.log("");
    console.log(
      `Done. Published: ${published}, failed: ${failed}, skipped: ${skipped}.`,
    );

    if (failed > 0 || (strict && skipped > 0)) {
      process.exit(1);
    }
  },
});
