import { SentilisError } from "../errors.js";
import {
  type FileSystem,
  basename,
  extname,
  isAbsolute,
  join,
  resolve as resolvePath,
} from "../fs.js";
import { ATTACHMENTS_DIR } from "../walker.js";

/**
 * Kinds of entries a workspace can contain. Each kind maps to one of the
 * top-level command-type folders inside the workspace root:
 *
 *   <workspace>/
 *     bio/        → one bio entry (the folder itself, with variants)
 *     press/      → many press entries (subfolders or top-level .md files)
 *     market/     → many market entries (subfolders or top-level .md files)
 */
export type WorkspaceEntryKind = "bio" | "press" | "market";

/**
 * A single, pushable entry discovered inside a workspace tree. The `path`
 * is what gets handed to `createBio` / `createPress` / `createProduct` —
 * either a directory containing a `.md`, or a standalone `.md` file.
 *
 * `label` is a human-friendly identifier (folder name or file base name)
 * intended for logging only; the real identity comes from frontmatter.
 */
export interface WorkspaceEntry {
  kind: WorkspaceEntryKind;
  /** Absolute path to a directory or `.md` file. */
  path: string;
  /** "directory" when `path` is a folder, "file" for standalone markdown. */
  type: "directory" | "file";
  /** Display label for logs; not authoritative. */
  label: string;
}

/**
 * A discovered workspace tree. `rootDir` is the absolute, resolved
 * workspace path. Each command-type list is the entries the CLI (or any
 * other adapter — Obsidian, browser plugin) should iterate over.
 *
 * `bio` is at most one entry because a workspace represents a single
 * persona: there is one bio per persona, with language variants living
 * as siblings inside the `bio/` folder.
 */
export interface WorkspaceTree {
  rootDir: string;
  bio: WorkspaceEntry | null;
  press: WorkspaceEntry[];
  market: WorkspaceEntry[];
}

/**
 * Folder names recognized as command-type roots inside a workspace.
 * Anything else at the top level is ignored (so users can keep
 * `.git/`, `README.md`, etc. next to their content).
 */
const COMMAND_FOLDERS: WorkspaceEntryKind[] = ["bio", "press", "market"];

function isMarkdown(name: string): boolean {
  return extname(name).toLowerCase() === ".md";
}

/**
 * Walk a workspace root and group everything into pushable entries. Does
 * *not* parse markdown or validate content — that's `createBio`,
 * `createPress`, and `createProduct`. This function only answers "what
 * are the entries to push, and where do they live on disk?".
 *
 * Path semantics mirror the per-kind walkers:
 *   - `bio/` (the folder itself) is the bio entry.
 *   - Each subdirectory of `press/` and `market/` is one entry.
 *   - Each top-level `.md` file inside `press/` and `market/` is a
 *     standalone single-file entry.
 *   - `attachments/` folders are ignored at the workspace level (they
 *     belong to their sibling entry).
 */
export async function discoverWorkspace(
  fs: FileSystem,
  inputPath: string,
): Promise<WorkspaceTree> {
  const rootDir = isAbsolute(inputPath)
    ? inputPath
    : resolvePath(".", inputPath);
  const info = await fs.stat(rootDir);
  if (!info) {
    throw new SentilisError({
      code: "PATH_NOT_EXIST",
      params: { path: rootDir },
    });
  }
  if (!info.isDirectory) {
    throw new SentilisError({
      code: "UNSUPPORTED_PATH_TYPE",
      params: { path: rootDir },
    });
  }

  const tree: WorkspaceTree = {
    rootDir,
    bio: null,
    press: [],
    market: [],
  };

  const topEntries = await fs.readDir(rootDir);

  for (const kind of COMMAND_FOLDERS) {
    if (!topEntries.includes(kind)) continue;
    const kindDir = join(rootDir, kind);
    const kindInfo = await fs.stat(kindDir);
    if (!kindInfo || !kindInfo.isDirectory) continue;

    if (kind === "bio") {
      tree.bio = {
        kind: "bio",
        path: kindDir,
        type: "directory",
        label: "bio",
      };
      continue;
    }

    const entries = await collectEntries(fs, kindDir, kind);
    if (kind === "press") tree.press = entries;
    else if (kind === "market") tree.market = entries;
  }

  return tree;
}

async function collectEntries(
  fs: FileSystem,
  kindDir: string,
  kind: WorkspaceEntryKind,
): Promise<WorkspaceEntry[]> {
  const names = await fs.readDir(kindDir);
  const out: WorkspaceEntry[] = [];

  for (const name of names.sort()) {
    if (name === ATTACHMENTS_DIR) continue;
    if (name.startsWith(".")) continue;

    const childPath = join(kindDir, name);
    const childInfo = await fs.stat(childPath);
    if (!childInfo) continue;

    if (childInfo.isDirectory) {
      out.push({
        kind,
        path: childPath,
        type: "directory",
        label: name,
      });
      continue;
    }

    if (childInfo.isFile && isMarkdown(name)) {
      out.push({
        kind,
        path: childPath,
        type: "file",
        label: basename(name, extname(name)),
      });
    }
  }

  return out;
}
