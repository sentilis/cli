import type { ValidationIssue } from "./errors.js";
import {
  type FileSystem,
  isAbsolute,
  join,
  relative,
  safeDecode,
} from "./fs.js";

export const ATTACHMENTS_DIR = "attachments";

/**
 * Check that `resolvedPath` does not escape `rootDir`, both logically and
 * after symlink resolution. Returns the issues to push; empty when OK.
 */
export async function assertInsideRoot(
  fs: FileSystem,
  resolvedPath: string,
  rootDir: string,
  originalRef: string,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  const rel = relative(rootDir, resolvedPath);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    issues.push({
      code: "REF_OUTSIDE_ROOT",
      params: { ref: originalRef },
    });
    return issues;
  }
  try {
    const [realPath, realRoot] = await Promise.all([
      fs.realpath(resolvedPath),
      fs.realpath(rootDir),
    ]);
    const realRel = relative(realRoot, realPath);
    if (realRel.startsWith("..") || isAbsolute(realRel)) {
      issues.push({
        code: "REF_OUTSIDE_ROOT_SYMLINK",
        params: { ref: originalRef },
      });
    }
  } catch {
    // realpath failed (file missing); existence check handles it.
  }
  return issues;
}

/**
 * Enforce the "all assets live in ./attachments/" rule. In single-file
 * mode (no attachments dir context) any local asset is rejected outright.
 */
export async function assertInsideAttachments(
  fs: FileSystem,
  resolvedPath: string,
  rootDir: string,
  originalRef: string,
  allowAttachments: boolean,
): Promise<ValidationIssue[]> {
  if (!allowAttachments) {
    return [
      {
        code: "REF_SINGLE_FILE_NO_ASSETS",
        params: { ref: originalRef, attachmentsDir: ATTACHMENTS_DIR },
      },
    ];
  }
  const issues: ValidationIssue[] = [];
  const attachmentsRoot = join(rootDir, ATTACHMENTS_DIR);
  const rel = relative(attachmentsRoot, resolvedPath);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
    issues.push({
      code: "REF_OUTSIDE_ATTACHMENTS",
      params: { ref: originalRef, attachmentsDir: ATTACHMENTS_DIR },
    });
    return issues;
  }
  try {
    const [realPath, realAttachments] = await Promise.all([
      fs.realpath(resolvedPath),
      fs.realpath(attachmentsRoot),
    ]);
    const realRel = relative(realAttachments, realPath);
    if (realRel === "" || realRel.startsWith("..") || isAbsolute(realRel)) {
      issues.push({
        code: "REF_OUTSIDE_ATTACHMENTS_SYMLINK",
        params: { ref: originalRef, attachmentsDir: ATTACHMENTS_DIR },
      });
    }
  } catch {
    // existence check handles it
  }
  return issues;
}

/**
 * Resolve a markdown ref to an absolute path inside `dir`, decoding any
 * percent-encoding.
 */
export function resolveRef(dir: string, ref: string): string {
  const decoded = safeDecode(ref);
  return isAbsolute(decoded) ? decoded : join(dir, decoded);
}

/**
 * Validate a local (non-remote) asset reference: must stay inside the
 * root, inside `./attachments/`, and exist on disk. Returns the issues
 * to push (empty when OK).
 */
export async function validateLocalAssetRef(
  fs: FileSystem,
  ref: string,
  dir: string,
  rootDir: string,
  kind: string,
  allowAttachments: boolean,
): Promise<ValidationIssue[]> {
  const absPath = resolveRef(dir, ref);
  const issues = await assertInsideRoot(fs, absPath, rootDir, ref);
  issues.push(
    ...(await assertInsideAttachments(
      fs,
      absPath,
      rootDir,
      ref,
      allowAttachments,
    )),
  );
  if (issues.length === 0) {
    const exists = await fs.exists(absPath);
    if (!exists) {
      issues.push({ code: "ASSET_NOT_FOUND", params: { ref, kind } });
    }
  }
  return issues;
}

export function isRemote(ref: string): boolean {
  return ref.startsWith("http://") || ref.startsWith("https://");
}
