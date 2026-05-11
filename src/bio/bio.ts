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
  BioFile,
  BioCreateResult,
  BioValidationError,
} from "@sentilis/core/bio";
import {
  parseFrontmatter,
  buildMetadata,
  extractImageLinks,
  validateLinks,
  type PartialBioMetadata,
} from "@sentilis/core/bio/markdown";

export interface CreateBioOptions {
  /**
   * When true, validation errors are accumulated in the returned `errors`
   * array instead of throwing on the first one.
   */
  collectErrors?: boolean;
}

const ATTACHMENTS_DIR = "attachments";

const AVATAR_CANDIDATES = [
  "avatar.png",
  "avatar.jpg",
  "avatar.jpeg",
  "avatar.webp",
  "profile.png",
  "profile.jpg",
  "profile.jpeg",
  "profile.webp",
];

/**
 * Create a bio entry from a file (single-language) or a directory
 * (multi-language with optional shared attachments).
 */
export async function createBio(
  inputPath: string,
  options: CreateBioOptions = {},
): Promise<BioCreateResult> {
  const resolved = isAbsolute(inputPath) ? inputPath : resolve(inputPath);
  const info = await stat(resolved).catch(() => null);

  if (!info) {
    throw new Error(`Path does not exist: ${resolved}`);
  }

  const errors: BioValidationError[] = [];
  const collect = options.collectErrors === true ? errors : undefined;

  if (info.isDirectory()) {
    return createFromDirectory(resolved, collect, errors);
  }

  if (info.isFile()) {
    assertMarkdown(resolved);
    const rootDir = dirname(resolved);
    const fileBase = basename(resolved, extname(resolved));
    const file = await readBioFile({
      filePath: resolved,
      inferredName: fileBase,
      inferredSlug: fileBase,
      inferredLanguage: "en",
      rootDir,
      collect,
      allowAttachments: false,
      autoDetectAvatar: false,
    });
    return { main: file, variants: [], errors };
  }

  throw new Error(`Unsupported path type: ${resolved}`);
}

async function createFromDirectory(
  dirPath: string,
  collect: BioValidationError[] | undefined,
  errors: BioValidationError[],
): Promise<BioCreateResult> {
  const entries = await readdir(dirPath);
  const mdFiles = entries.filter((f) => extname(f).toLowerCase() === ".md");

  if (mdFiles.length === 0) {
    throw new Error(
      `No markdown files found in ${dirPath}. Create a markdown file (.md) to continue.`,
    );
  }

  mdFiles.sort();

  const dirName = basename(dirPath);
  const inferredSlug = dirName;
  const rootDir = dirPath;

  const detectedAvatar = await autoDetectAvatar(rootDir);

  const hasIndex = mdFiles.includes("index.md");
  const mainFilename = hasIndex ? "index.md" : mdFiles[0];

  const main = await readBioFile({
    filePath: join(dirPath, mainFilename),
    inferredName: dirName,
    inferredSlug,
    inferredLanguage: languageFromFilename(mainFilename, "en"),
    rootDir,
    collect,
    allowAttachments: true,
    autoDetectAvatar: true,
    detectedAvatar,
  });

  const variants: BioFile[] = [];
  for (const f of mdFiles) {
    if (f === mainFilename) continue;
    const language = languageFromFilename(f, "en");
    const file = await readBioFile({
      filePath: join(dirPath, f),
      inferredName: main.metadata.name,
      // Variant slug is its language code (forced below).
      inferredSlug: language,
      inferredLanguage: language,
      rootDir,
      collect,
      allowAttachments: true,
      autoDetectAvatar: true,
      detectedAvatar,
      isVariant: true,
      // Variants inherit lifecycle from main only when their own frontmatter
      // doesn't declare the field explicitly.
      statusFallback: main.metadata.status,
      visibilityFallback: main.metadata.visibility,
      passwordFallback: main.metadata.password,
    });
    variants.push(file);
  }

  // Slug is structural — always the language code, never frontmatter-overridable.
  for (const v of variants) {
    v.metadata.slug = v.metadata.language;
  }

  return { main, variants, errors };
}

function languageFromFilename(filename: string, fallback: string): string {
  const base = basename(filename, extname(filename)).toLowerCase();
  if (base === "index") return fallback;
  if (/^[a-z]{2,8}(-[a-z0-9]{2,8})?$/.test(base)) return base;
  return fallback;
}

interface ReadBioFileInput {
  filePath: string;
  inferredName: string;
  inferredSlug: string;
  inferredLanguage: string;
  rootDir: string;
  collect: BioValidationError[] | undefined;
  allowAttachments: boolean;
  autoDetectAvatar: boolean;
  detectedAvatar?: string | null;
  /**
   * When true the entry is treated as a language variant: its `slug` is
   * forced by the caller and lifecycle fields fall back to the main bio's
   * values when not declared in the variant's own frontmatter.
   */
  isVariant?: boolean;
  statusFallback?: "draft" | "published" | "archived";
  visibilityFallback?: "public" | "protected" | "private" | "prime";
  passwordFallback?: string | null;
}

async function readBioFile(input: ReadBioFileInput): Promise<BioFile> {
  const {
    filePath,
    inferredName,
    inferredSlug,
    inferredLanguage,
    rootDir,
    collect,
    allowAttachments,
    autoDetectAvatar: shouldAutoDetect,
    detectedAvatar,
    isVariant,
    statusFallback,
    visibilityFallback,
    passwordFallback,
  } = input;

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
  let partial: PartialBioMetadata = {};
  let body = raw;
  try {
    const parsed = parseFrontmatter(raw);
    partial = parsed.metadata;
    body = parsed.body;
  } catch (e) {
    if (collect) collect.push({ file: filePath, message: (e as Error).message });
    else throw e;
  }

  const auto = shouldAutoDetect
    ? { avatar: partial.avatar === undefined ? (detectedAvatar ?? null) : null }
    : { avatar: null };

  // For variants, drop only the structural `slug` override (slug is forced to
  // the language code). `status`, `visibility`, and `password` are allowed
  // through and either keep their explicit frontmatter values or fall back to
  // the main bio via the fallbacks below.
  if (isVariant) {
    delete partial.slug;
  }

  const { metadata, errors: metaErrors } = buildMetadata({
    partial,
    inferredName,
    inferredSlug,
    inferredLanguage,
    autoDetected: auto,
    statusFallback,
    visibilityFallback,
    passwordFallback,
  });

  if (metaErrors.length > 0) {
    if (collect) {
      for (const m of metaErrors) collect.push({ file: filePath, message: m });
    } else {
      throw new Error(metaErrors.join("\n"));
    }
  }

  const dir = dirname(filePath);

  if (metadata.avatar) {
    const ref = metadata.avatar;
    if (ref.startsWith("http://") || ref.startsWith("https://")) {
      // Remote avatar OK.
    } else {
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
            `Avatar file not found: "${ref}" referenced in ${filePath}`,
          );
        }
      });
    }
  }

  const images = extractImageLinks(body);
  for (const img of images) {
    if (img.src.startsWith("http://") || img.src.startsWith("https://")) {
      continue;
    }
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

  return { filePath, content: body, metadata, images };
}

async function autoDetectAvatar(rootDir: string): Promise<string | null> {
  const attachmentsRoot = join(rootDir, ATTACHMENTS_DIR);
  const matches: string[] = [];
  for (const candidate of AVATAR_CANDIDATES) {
    const abs = join(attachmentsRoot, candidate);
    const exists = await access(abs)
      .then(() => true)
      .catch(() => false);
    if (exists) matches.push(candidate);
  }
  if (matches.length > 1) {
    throw new Error(
      `Multiple avatar candidates found in ./${ATTACHMENTS_DIR}/: ${matches.join(
        ", ",
      )}. Set the "avatar" field explicitly to pick one.`,
    );
  }
  if (matches.length === 1) {
    return `./${ATTACHMENTS_DIR}/${matches[0]}`;
  }
  return null;
}

function assertMarkdown(filePath: string): void {
  if (extname(filePath).toLowerCase() !== ".md") {
    throw new Error(
      `File "${filePath}" is not a markdown file. Only .md files are supported.`,
    );
  }
}

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
    // existence check handles it later
  }
}

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
    // existence check handles it later
  }
}
