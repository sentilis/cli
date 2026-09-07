/**
 * Filesystem adapter the SDK calls into. Adapters keep the SDK isomorphic:
 *  - Node servers / the CLI use the bundled `NodeFileSystem`
 *    (`@sentilis/cli/node`).
 *  - Obsidian and browser apps implement this interface over their own
 *    storage (vault, IndexedDB, virtual FS, …).
 *
 * All paths exchanged with adapter methods are strings. The walkers use
 * the path utilities in this file to normalize and inspect them, so the
 * adapter only deals with whole-string keys it controls.
 *
 * Adapters may treat every path as POSIX-style ("/"-separated) without
 * loss; `NodeFileSystem` translates to native separators internally.
 */
export interface StatInfo {
  isFile: boolean;
  isDirectory: boolean;
}

export interface FileSystem {
  /** Return file metadata, or `null` if the path does not exist. */
  stat(path: string): Promise<StatInfo | null>;

  /** Read a text file as UTF-8. */
  readText(path: string): Promise<string>;

  /** Read a binary file as bytes. */
  readBinary(path: string): Promise<Uint8Array>;

  /** List direct children of a directory (names only, not full paths). */
  readDir(path: string): Promise<string[]>;

  /** Cheap existence check. Adapters may implement as `stat() !== null`. */
  exists(path: string): Promise<boolean>;

  /**
   * Resolve symlinks. Used to defeat symlink-escape attacks.
   * Adapters without symlink support (e.g. Obsidian vault) may return
   * the input path unchanged.
   */
  realpath(path: string): Promise<string>;
}

// ---------- POSIX path utilities ----------
//
// Pure string helpers safe for any runtime. Walkers use these instead of
// `node:path` so the same code works in Node, Obsidian, and the browser.
// Inputs are treated as POSIX (forward-slash) paths; backslashes are
// accepted but normalized to "/".

function normSep(p: string): string {
  return p.replace(/\\/g, "/");
}

/**
 * Join one or more path segments, collapsing redundant separators and
 * `.` / `..` segments. Always produces a POSIX-style path.
 */
export function join(...parts: string[]): string {
  if (parts.length === 0) return ".";
  const segments: string[] = [];
  let leading = "";

  for (let i = 0; i < parts.length; i++) {
    const part = normSep(parts[i]);
    if (part === "") continue;
    if (i === 0 && part.startsWith("/")) leading = "/";
    for (const seg of part.split("/")) {
      if (seg === "" || seg === ".") continue;
      if (seg === "..") {
        if (segments.length > 0 && segments[segments.length - 1] !== "..") {
          segments.pop();
        } else if (!leading) {
          segments.push("..");
        }
      } else {
        segments.push(seg);
      }
    }
  }

  const result = leading + segments.join("/");
  return result === "" ? "." : result;
}

export function isAbsolute(path: string): boolean {
  const p = normSep(path);
  if (p.startsWith("/")) return true;
  return /^[a-zA-Z]:\//.test(p);
}

export function dirname(path: string): string {
  const p = normSep(path);
  const i = p.lastIndexOf("/");
  if (i === -1) return ".";
  if (i === 0) return "/";
  return p.slice(0, i);
}

export function basename(path: string, ext?: string): string {
  const p = normSep(path);
  const i = p.lastIndexOf("/");
  const base = i === -1 ? p : p.slice(i + 1);
  if (ext && base.endsWith(ext) && base.length > ext.length) {
    return base.slice(0, base.length - ext.length);
  }
  return base;
}

export function extname(path: string): string {
  const base = basename(path);
  const i = base.lastIndexOf(".");
  if (i <= 0) return "";
  return base.slice(i);
}

/**
 * Relative path from `from` to `to`. Both may be absolute or relative
 * (treated as if anchored at the same root). Returns a POSIX path.
 */
export function relative(from: string, to: string): string {
  const fromAbs = isAbsolute(from);
  const toAbs = isAbsolute(to);

  const fromParts = (fromAbs ? from : "/" + from).split("/").filter(Boolean);
  const toParts = (toAbs ? to : "/" + to).split("/").filter(Boolean);

  // Walk forward through shared prefix.
  let i = 0;
  while (
    i < fromParts.length &&
    i < toParts.length &&
    fromParts[i] === toParts[i]
  ) {
    i++;
  }

  const up = new Array(fromParts.length - i).fill("..");
  const down = toParts.slice(i);
  const out = [...up, ...down].join("/");
  return out;
}

/**
 * Resolve a path to an absolute form. Walkers pass an explicit anchor
 * (typically the input directory) so this never depends on a runtime
 * "current directory" — keeping it deterministic in adapters that have
 * no cwd concept (Obsidian, browser).
 */
export function resolve(anchor: string, path: string): string {
  if (isAbsolute(path)) return join(path);
  return join(anchor, path);
}

/**
 * Decode a percent-encoded markdown ref. Wraps `decodeURIComponent` so
 * malformed refs surface as a normal validation error instead of throwing
 * out of the walker.
 */
export function safeDecode(ref: string): string {
  try {
    return decodeURIComponent(ref);
  } catch {
    return ref;
  }
}
