#!/usr/bin/env node
/**
 * Verifies the two invariants of the isomorphic SDK subtree in dist/:
 *
 *   1. No Node-only imports. dist/sdk/node.* is the sole exception — it is
 *      the NodeFileSystem adapter, published as the "./node" subpath.
 *   2. No imports that escape the subtree, i.e. the SDK never reaches into
 *      CLI code (which would drag node:fs / node:os back in with it).
 *
 * This runs on the emitted output rather than the sources, so it also
 * covers .d.ts files and anything the compiler rewrote. tsconfig.sdk.json
 * catches the same class of mistake earlier, at compile time; this is the
 * check on the artifact that actually ships.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = "dist/sdk";
const NODE_ONLY_ALLOWLIST = new Set(["node.js", "node.d.ts"]);

// Matches static imports/re-exports, dynamic import() and require().
const SPECIFIER_RE =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)["']([^"']+)["']/g;

const failures = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (path.endsWith(".js") || path.endsWith(".d.ts")) check(path);
  }
}

function check(file) {
  const rel = relative(ROOT, file).split("\\").join("/");
  const depth = rel.split("/").length - 1; // 0 for dist/sdk/*.js
  const source = readFileSync(file, "utf8");

  for (const [, specifier] of source.matchAll(SPECIFIER_RE)) {
    if (specifier.startsWith("node:") && !NODE_ONLY_ALLOWLIST.has(rel)) {
      failures.push(`${file}: Node-only import "${specifier}" outside dist/sdk/node.*`);
    }
    if (specifier.startsWith(".")) {
      const ups = (specifier.match(/\.\.\//g) ?? []).length;
      if (ups > depth) {
        failures.push(`${file}: relative import "${specifier}" escapes dist/sdk`);
      }
    }
  }
}

try {
  statSync(ROOT);
} catch {
  console.error(`ERROR: ${ROOT} not found — run \`npm run build\` first.`);
  process.exit(1);
}

walk(ROOT);

if (failures.length > 0) {
  console.error("ERROR: SDK boundary violated:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log("OK — dist/sdk is isomorphic and self-contained");
