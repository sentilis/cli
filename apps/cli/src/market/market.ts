import { stat, readdir, readFile, access, realpath } from "node:fs/promises";
import {
  join,
  basename,
  extname,
  dirname,
  resolve,
  isAbsolute,
  relative,
} from "node:path";
import type {
  ProductFile,
  ProductCreateResult,
  ProductValidationError,
  ProductMetadata,
} from "@sentilis/core/market";
import {
  parseFrontmatter,
  buildMetadata,
  extractImageLinks,
  extractVideoLinks,
  validateLinks,
} from "@sentilis/core/market/markdown";

export interface CreateProductOptions {
  /**
   * When true, validation errors are accumulated in the returned
   * `errors` array instead of throwing on the first one.
   */
  collectErrors?: boolean;
}

const ATTACHMENTS_DIR = "attachments";

// Auto-detection candidates (probed in order).
const IMAGE_CANDIDATES = [
  "image.png",
  "image.jpg",
  "image.jpeg",
  "image.webp",
];
const ATTACHMENT_CANDIDATES = ["attachment.zip"];

/**
 * Create a product entry from a file or directory path.
 */
export async function createProduct(
  inputPath: string,
  options: CreateProductOptions = {},
): Promise<ProductCreateResult> {
  const resolved = isAbsolute(inputPath) ? inputPath : resolve(inputPath);
  const info = await stat(resolved).catch(() => null);

  if (!info) {
    throw new Error(`Path does not exist: ${resolved}`);
  }

  const errors: ProductValidationError[] = [];
  const collect = options.collectErrors === true ? errors : undefined;

  if (info.isDirectory()) {
    return createFromDirectory(resolved, collect, errors);
  }

  if (info.isFile()) {
    assertMarkdown(resolved);
    const rootDir = dirname(resolved);
    const file = await readProductFile(
      resolved,
      basename(resolved, extname(resolved)),
      rootDir,
      collect,
      false,
    );
    return { main: file, errors };
  }

  throw new Error(`Unsupported path type: ${resolved}`);
}

async function createFromDirectory(
  dirPath: string,
  collect: ProductValidationError[] | undefined,
  errors: ProductValidationError[],
): Promise<ProductCreateResult> {
  const entries = await readdir(dirPath);
  const mdFiles = entries.filter((f) => extname(f).toLowerCase() === ".md");

  if (mdFiles.length === 0) {
    throw new Error(
      `No markdown files found in ${dirPath}. Create a markdown file (.md) to continue.`,
    );
  }

  if (mdFiles.length > 1) {
    throw new Error(
      `Multiple markdown files found in ${dirPath}. A Product supports a single .md file (no child entries).`,
    );
  }

  const rootDir = dirPath;
  const main = await readProductFile(
    join(dirPath, mdFiles[0]),
    basename(mdFiles[0], extname(mdFiles[0])),
    rootDir,
    collect,
    true,
  );
  return { main, errors };
}

async function readProductFile(
  filePath: string,
  inferredName: string,
  rootDir: string,
  collect: ProductValidationError[] | undefined,
  allowAttachments: boolean,
): Promise<ProductFile> {
  const safe = async (fn: () => Promise<void> | void): Promise<void> => {
    if (!collect) {
      await fn();
      return;
    }
    try {
      await fn();
    } catch (e) {
      collect.push({ file: filePath, message: (e as Error).message });
    }
  };

  const raw = await readFile(filePath, "utf-8");
  const { metadata: partial, body } = parseFrontmatter(raw);

  // Auto-detect image / attachment in ./attachments/ when not set explicitly
  // (only applies in directory mode — single files have no attachments/).
  const autoDetected = allowAttachments
    ? await autoDetectAssets(rootDir, partial)
    : { image: null, attachment: null };

  const { metadata, errors: metaErrors } = buildMetadata(
    partial,
    inferredName,
    autoDetected,
  );
  if (metaErrors.length > 0) {
    if (collect) {
      for (const m of metaErrors) collect.push({ file: filePath, message: m });
    } else {
      throw new Error(metaErrors.join("\n"));
    }
  }

  const dir = dirname(filePath);

  // Validate explicit image / attachment frontmatter fields: must exist and
  // live inside ./attachments/.
  for (const [field, ref] of [
    ["image", metadata.image] as const,
    ["attachment", metadata.attachment] as const,
  ]) {
    if (!ref) continue;
    // Skip remote URLs — not supported for these fields per the guideline,
    // but we still validate to produce a clear error.
    if (ref.startsWith("http://") || ref.startsWith("https://")) {
      await safe(() => {
        throw new Error(
          `Field "${field}" must be a local path inside ./${ATTACHMENTS_DIR}/ (got "${ref}").`,
        );
      });
      continue;
    }
    await safe(async () => {
      const decoded = decodeURIComponent(ref);
      const absPath = isAbsolute(decoded) ? decoded : join(dir, decoded);
      await assertInsideRoot(absPath, rootDir, ref, filePath);
      await assertInsideAttachments(
        absPath,
        rootDir,
        ref,
        filePath,
        allowAttachments,
      );
      const exists = await access(absPath)
        .then(() => true)
        .catch(() => false);
      if (!exists) {
        throw new Error(
          `${field} file not found: "${ref}" referenced in ${filePath}`,
        );
      }
    });
  }

  // Validate body images
  const images = extractImageLinks(body);
  for (const img of images) {
    if (img.src.startsWith("http://") || img.src.startsWith("https://")) continue;
    await safe(async () => {
      const decoded = decodeURIComponent(img.src);
      const absPath = isAbsolute(decoded) ? decoded : join(dir, decoded);
      await assertInsideRoot(absPath, rootDir, img.src, filePath);
      await assertInsideAttachments(
        absPath,
        rootDir,
        img.src,
        filePath,
        allowAttachments,
      );
      const exists = await access(absPath)
        .then(() => true)
        .catch(() => false);
      if (!exists) {
        throw new Error(
          `Image file not found: "${img.src}" referenced in ${filePath}`,
        );
      }
    });
  }

  // Validate body videos
  const videos = extractVideoLinks(body);
  for (const video of videos) {
    if (video.src.startsWith("http://") || video.src.startsWith("https://")) continue;
    await safe(async () => {
      const decoded = decodeURIComponent(video.src);
      const absPath = isAbsolute(decoded) ? decoded : join(dir, decoded);
      await assertInsideRoot(absPath, rootDir, video.src, filePath);
      await assertInsideAttachments(
        absPath,
        rootDir,
        video.src,
        filePath,
        allowAttachments,
      );
      const exists = await access(absPath)
        .then(() => true)
        .catch(() => false);
      if (!exists) {
        throw new Error(
          `Video file not found: "${video.src}" referenced in ${filePath}`,
        );
      }
    });
  }

  // Validate body links (no media, no local .md)
  const linkErrors = validateLinks(body);
  if (linkErrors.length > 0) {
    if (collect) {
      for (const e of linkErrors) {
        collect.push({ file: filePath, message: e.message });
      }
    } else {
      throw new Error(
        `Invalid links in ${filePath}:\n` +
          linkErrors.map((e) => `  - ${e.message}`).join("\n"),
      );
    }
  }

  return { filePath, content: body, metadata, images, videos };
}

async function autoDetectAssets(
  rootDir: string,
  partial: Partial<ProductMetadata>,
): Promise<{ image: string | null; attachment: string | null }> {
  const attachmentsRoot = join(rootDir, ATTACHMENTS_DIR);
  const out: { image: string | null; attachment: string | null } = {
    image: null,
    attachment: null,
  };

  if (partial.image === undefined) {
    const matches: string[] = [];
    for (const candidate of IMAGE_CANDIDATES) {
      const abs = join(attachmentsRoot, candidate);
      const exists = await access(abs).then(() => true).catch(() => false);
      if (exists) matches.push(candidate);
    }
    if (matches.length > 1) {
      throw new Error(
        `Multiple image candidates found in ./${ATTACHMENTS_DIR}/: ${matches.join(
          ", ",
        )}. Set the "image" field explicitly to pick one.`,
      );
    }
    if (matches.length === 1) {
      out.image = `./${ATTACHMENTS_DIR}/${matches[0]}`;
    }
  }

  if (partial.attachment === undefined) {
    for (const candidate of ATTACHMENT_CANDIDATES) {
      const abs = join(attachmentsRoot, candidate);
      const exists = await access(abs).then(() => true).catch(() => false);
      if (exists) {
        out.attachment = `./${ATTACHMENTS_DIR}/${candidate}`;
        break;
      }
    }
  }

  return out;
}

function assertMarkdown(filePath: string): void {
  if (extname(filePath).toLowerCase() !== ".md") {
    throw new Error(
      `File "${filePath}" is not a markdown file. Only .md files are supported.`,
    );
  }
}

/**
 * Throws if resolvedPath escapes rootDir.
 * Checks both the logical path and the physical path (resolving symlinks).
 */
async function assertInsideRoot(
  resolvedPath: string,
  rootDir: string,
  originalRef: string,
  fromFile: string,
): Promise<void> {
  const rel = relative(rootDir, resolvedPath);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(
      `Reference "${originalRef}" in ${fromFile} points outside the root directory.`,
    );
  }

  // Prevent symlink bypass
  try {
    const [realPath, realRoot] = await Promise.all([
      realpath(resolvedPath),
      realpath(rootDir),
    ]);
    const realRel = relative(realRoot, realPath);
    if (realRel.startsWith("..") || isAbsolute(realRel)) {
      throw new Error(
        `Reference "${originalRef}" in ${fromFile} resolves to a path outside the root directory (Symlink detected).`,
      );
    }
  } catch {
    // Let later existence check handle it
  }
}

/**
 * Enforce the "all assets live in ./attachments/" rule.
 */
async function assertInsideAttachments(
  resolvedPath: string,
  rootDir: string,
  originalRef: string,
  fromFile: string,
  allowAttachments: boolean,
): Promise<void> {
  if (!allowAttachments) {
    throw new Error(
      `Local asset "${originalRef}" in ${fromFile} is not allowed in single-file mode. ` +
        `Wrap the markdown file in a directory with an ./${ATTACHMENTS_DIR}/ folder.`,
    );
  }
  const attachmentsRoot = join(rootDir, ATTACHMENTS_DIR);
  const rel = relative(attachmentsRoot, resolvedPath);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(
      `Local asset "${originalRef}" in ${fromFile} must live inside ./${ATTACHMENTS_DIR}/.`,
    );
  }

  // Prevent symlink bypass
  try {
    const [realPath, realAttachmentsRoot] = await Promise.all([
      realpath(resolvedPath),
      realpath(attachmentsRoot),
    ]);
    const realRel = relative(realAttachmentsRoot, realPath);
    if (realRel === "" || realRel.startsWith("..") || isAbsolute(realRel)) {
      throw new Error(
        `Local asset "${originalRef}" in ${fromFile} resolves to a path outside the attachments directory.`,
      );
    }
  } catch {
    // Let later existence check handle it
  }
}
