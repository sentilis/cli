import {
  access,
  readFile,
  readdir,
  realpath as nodeRealpath,
  stat,
} from "node:fs/promises";
import type { FileSystem, StatInfo } from "./fs.js";

/**
 * Node-backed implementation of {@link FileSystem}. Designed for the CLI
 * and any Node server consumer. Accepts both POSIX and platform paths
 * (Node normalizes them in `fs` calls).
 *
 * This module is the *only* place in `@sentilis/cli` that imports from
 * `node:*`. Importing the main package (`@sentilis/cli`) stays safe in
 * browsers and Obsidian; only `@sentilis/cli/node` pulls in Node APIs.
 */
export class NodeFileSystem implements FileSystem {
  async stat(path: string): Promise<StatInfo | null> {
    try {
      const info = await stat(path);
      return { isFile: info.isFile(), isDirectory: info.isDirectory() };
    } catch {
      return null;
    }
  }

  async readText(path: string): Promise<string> {
    return readFile(path, "utf-8");
  }

  async readBinary(path: string): Promise<Uint8Array> {
    const data = await readFile(path);
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }

  async readDir(path: string): Promise<string[]> {
    return readdir(path);
  }

  async exists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  async realpath(path: string): Promise<string> {
    return nodeRealpath(path);
  }
}
