import { stat, readdir, readFile, access, realpath } from "node:fs/promises";
import {
  join,
  basename,
  extname,
  dirname,
  resolve,
  isAbsolute,
  relative,
  sep,
} from "node:path";
import type {
  PressFile,
  PressCreateResult,
  PressLinkRef,
  PressValidationError,
} from "@sentilis/core/press";
import type { LifecycleStatus, LifecycleVisibility } from "@sentilis/core";
import {
  parseFrontmatter,
  buildMetadata,
  extractImageLinks,
  extractVideoLinks,
  extractMarkdownLinks,
  validateLinks,
} from "@sentilis/core/press/markdown";

export interface CreatePressOptions {
  /**
   * When true, validation errors are accumulated in the returned
   * `errors` array instead of throwing on the first one. Useful for
   * dry-run reports where we want to show every issue at once.
   */
  collectErrors?: boolean;
}

/**
 * Create a press entry from a file or directory path.
 */
export async function createPress(
  inputPath: string,
  options: CreatePressOptions = {},
): Promise<PressCreateResult> {
  const resolved = isAbsolute(inputPath) ? inputPath : resolve(inputPath);
  const info = await stat(resolved).catch(() => null);

  if (!info) {
    throw new Error(`Path does not exist: ${resolved}`);
  }

  const errors: PressValidationError[] = [];
  const collect = options.collectErrors === true ? errors : undefined;

  if (info.isDirectory()) {
    return createFromDirectory(resolved, collect, errors);
  }

  if (info.isFile()) {
    assertMarkdown(resolved);
    const rootDir = dirname(resolved);
    // Single-file mode: no local assets allowed (no attachments/ folder context).
    const file = await readPressFile(
      resolved,
      basename(resolved, extname(resolved)),
      rootDir,
      undefined,
      undefined,
      collect,
      false,
    );
    resolveLinkSlugs([file]);
    return { main: file, hidden: [], errors };
  }

  throw new Error(`Unsupported path type: ${resolved}`);
}

// ---------- Directory handling ----------

async function createFromDirectory(
  dirPath: string,
  collect: PressValidationError[] | undefined,
  errors: PressValidationError[],
): Promise<PressCreateResult> {
  const entries = await readdir(dirPath);
  const mdFiles = entries.filter((f) => extname(f).toLowerCase() === ".md");

  if (mdFiles.length === 0) {
    throw new Error(
      `No markdown files found in ${dirPath}. Create a markdown file (.md) to continue.`,
    );
  }

  const hasIndex = mdFiles.includes("index.md");

  if (!hasIndex && mdFiles.length > 1) {
    throw new Error(
      `Multiple markdown files found in ${dirPath} without an index.md. ` +
        `Create an index.md file to use as the main press file.`,
    );
  }

  // rootDir is always the input directory — no file may reference outside it
  const rootDir = dirPath;

  // Single file without index.md — treat it as the main file
  if (!hasIndex && mdFiles.length === 1) {
    const mainFile = await readPressFile(
      join(dirPath, mdFiles[0]),
      basename(mdFiles[0], extname(mdFiles[0])),
      rootDir,
      undefined,
      undefined,
      collect,
      true,
    );
    resolveLinkSlugs([mainFile]);
    return { main: mainFile, hidden: [], errors };
  }

  // Has index.md — it's the main file, others are its children
  const dirName = basename(dirPath);
  const mainFile = await readPressFile(
    join(dirPath, "index.md"),
    dirName,
    rootDir,
    undefined,
    undefined,
    collect,
    true,
  );

  const hidden: PressFile[] = [];
  for (const f of mdFiles) {
    if (f === "index.md") continue;
    const file = await readPressFile(
      join(dirPath, f),
      basename(f, extname(f)),
      rootDir,
      mainFile.metadata.status,
      mainFile.metadata.visibility,
      collect,
      true,
    );
    hidden.push(file);
  }

  resolveLinkSlugs([mainFile, ...hidden]);
  return { main: mainFile, hidden, errors };
}

/**
 * Fill in the `targetSlug` of each link by matching its href to the
 * sibling press file it references. Mutates the entries in place.
 *
 * Done in a second pass because slugs aren't known until every file
 * has been parsed. Links to unknown files keep `targetSlug = ""`;
 * upstream validation rejects those refs separately, so the empty
 * string here doesn't create false positives.
 */
function resolveLinkSlugs(files: PressFile[]): void {
  const slugByFilename = new Map<string, string>();
  for (const f of files) {
    slugByFilename.set(basename(f.filePath), f.metadata.slug);
  }

  for (const f of files) {
    f.links = f.links.map((link): PressLinkRef => {
      if (link.targetSlug) return link;
      const decoded = decodeURIComponent(link.href);
      const filename = basename(decoded);
      const slug = slugByFilename.get(filename);
      return { alt: link.alt, href: link.href, targetSlug: slug ?? "" };
    });
  }
}

// ---------- File reading & validation ----------

const ATTACHMENTS_DIR = "attachments";
const IMAGE_CANDIDATES = [
  "image.png",
  "image.jpg",
  "image.jpeg",
  "image.webp",
];

async function readPressFile(
  filePath: string,
  inferredName: string,
  rootDir: string,
  statusFallback: LifecycleStatus | undefined,
  visibilityFallback: LifecycleVisibility | undefined,
  collect: PressValidationError[] | undefined,
  allowAttachments: boolean,
): Promise<PressFile> {
  const fail = (msg: string): void => {
    if (collect) collect.push({ file: filePath, message: msg });
    else throw new Error(msg);
  };
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

  // Auto-detect image in ./attachments/ when not set explicitly
  const autoDetected = allowAttachments
    ? await autoDetectAssets(rootDir, partial)
    : { image: null };

  // buildMetadata can throw on bad slug/tag; wrap so we keep collecting.
  let metadata;
  try {
    metadata = buildMetadata(
      partial,
      inferredName,
      statusFallback,
      visibilityFallback,
      autoDetected,
    );
  } catch (e) {
    if (!collect) throw e;
    collect.push({ file: filePath, message: (e as Error).message });
    // Fall back to a minimally-valid metadata so we can keep validating refs.
    metadata = {
      name: partial.name ?? inferredName,
      slug: "",
      category: partial.category ?? null,
      status: partial.status ?? statusFallback ?? "published",
      visibility: partial.visibility ?? visibilityFallback ?? "public",
      image: partial.image ?? autoDetected.image,
      tags: [],
      authors: partial.authors ?? [],
    };
  }

  const dir = dirname(filePath);

  // Validate explicit image frontmatter field
  if (metadata.image) {
    const ref = metadata.image;
    if (ref.startsWith("http://") || ref.startsWith("https://")) {
      // remote images are OK for OpenGraph
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
            `Image file not found: "${ref}" referenced in metadata of ${filePath}`,
          );
        }
      });
    }
  }

  // Validate image links — ensure referenced images exist on disk and inside ./attachments/
  const images = extractImageLinks(body);
  for (const img of images) {
    if (img.src.startsWith("http://") || img.src.startsWith("https://")) {
      continue; // remote images are OK
    }
    await safe(async () => {
      const decodedSrc = decodeURIComponent(img.src);
      const imgPath = isAbsolute(decodedSrc)
        ? decodedSrc
        : join(dir, decodedSrc);
      await assertInsideRoot(imgPath, rootDir, img.src, filePath);
      await assertInsideAttachments(
        imgPath,
        rootDir,
        img.src,
        filePath,
        allowAttachments,
      );
      const exists = await access(imgPath)
        .then(() => true)
        .catch(() => false);
      if (!exists) {
        throw new Error(
          `Image file not found: "${img.src}" referenced in ${filePath}`,
        );
      }
    });
  }

  // Validate video links — ensure referenced videos exist on disk and inside ./attachments/
  const videos = extractVideoLinks(body);
  for (const video of videos) {
    if (video.src.startsWith("http://") || video.src.startsWith("https://")) {
      continue; // remote videos are OK
    }
    await safe(async () => {
      const decodedSrc = decodeURIComponent(video.src);
      const videoPath = isAbsolute(decodedSrc)
        ? decodedSrc
        : join(dir, decodedSrc);
      await assertInsideRoot(videoPath, rootDir, video.src, filePath);
      await assertInsideAttachments(
        videoPath,
        rootDir,
        video.src,
        filePath,
        allowAttachments,
      );
      const exists = await access(videoPath)
        .then(() => true)
        .catch(() => false);
      if (!exists) {
        throw new Error(
          `Video file not found: "${video.src}" referenced in ${filePath}`,
        );
      }
    });
  }

  // Validate links — only web page links allowed (no media links)
  const linkErrors = validateLinks(body);
  if (linkErrors.length > 0) {
    if (collect) {
      for (const e of linkErrors) {
        collect.push({ file: filePath, message: e.message });
      }
    } else {
      fail(
        `Invalid links in ${filePath}:\n` +
          linkErrors.map((e) => `  - ${e.message}`).join("\n"),
      );
    }
  }

  // Extract and validate local markdown links
  const links = extractMarkdownLinks(body);
  for (const link of links) {
    if (link.href.startsWith("http://") || link.href.startsWith("https://")) {
      continue;
    }
    await safe(async () => {
      const decodedHref = decodeURIComponent(link.href);
      const linkPath = isAbsolute(decodedHref)
        ? decodedHref
        : join(dir, decodedHref);
      await assertInsideRoot(linkPath, rootDir, link.href, filePath);
      if (dirname(relative(rootDir, linkPath)) !== ".") {
        throw new Error(
          `Linked file must live at the top level of the press directory: ` +
            `"${link.href}" referenced in ${filePath}`,
        );
      }
      const exists = await access(linkPath)
        .then(() => true)
        .catch(() => false);
      if (!exists) {
        throw new Error(
          `Linked file not found: "${link.href}" referenced in ${filePath}`,
        );
      }
    });
  }

  const linkRefs: PressLinkRef[] = links.map((l) => ({
    alt: l.alt,
    href: l.href,
    targetSlug: "",
  }));

  return { filePath, content: body, metadata, images, videos, links: linkRefs };
}

async function autoDetectAssets(
  rootDir: string,
  partial: Partial<import("@sentilis/core/press").PressMetadata>,
): Promise<{ image: string | null }> {
  const attachmentsRoot = join(rootDir, ATTACHMENTS_DIR);
  const out: { image: string | null } = {
    image: null,
  };

  if (partial.image === undefined) {
    const matches: string[] = [];
    for (const candidate of IMAGE_CANDIDATES) {
      const abs = join(attachmentsRoot, candidate);
      const exists = await access(abs)
        .then(() => true)
        .catch(() => false);
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
    // If realpath fails (e.g. file doesn't exist), we let the later
    // existence check handle it.
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

  // Prevent symlink bypass for attachments too
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
