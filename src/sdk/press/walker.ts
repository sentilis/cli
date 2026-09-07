import type { ValidationIssue } from "../errors.js";
import { SentilisError } from "../errors.js";
import {
  type FileSystem,
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve as resolvePath,
} from "../fs.js";
import {
  ATTACHMENTS_DIR,
  assertInsideRoot,
  isRemote,
  resolveRef,
  validateLocalAssetRef,
} from "../walker.js";
import {
  buildMetadata,
  extractImageLinks,
  extractMarkdownLinks,
  extractVideoLinks,
  parseFrontmatter,
  validateLinks,
} from "./markdown.js";
import type {
  PressCreateResult,
  PressFile,
  PressLinkRef,
} from "./types.js";
import type { PressMetadata } from "./types.js";

const COVER_CANDIDATES = [
  "cover.png",
  "cover.jpg",
  "cover.jpeg",
  "cover.webp",
];

export interface CreatePressOptions {
  /**
   * When true, validation issues are accumulated in `result.issues`
   * instead of throwing on the first one. Structural problems (missing
   * path, no markdown files) still throw via `SentilisError`.
   */
  collectErrors?: boolean;
}

/**
 * Create a press entry from a file or directory path using the provided
 * filesystem adapter.
 */
export async function createPress(
  fs: FileSystem,
  inputPath: string,
  options: CreatePressOptions = {},
): Promise<PressCreateResult> {
  const resolved = isAbsolute(inputPath) ? inputPath : resolvePath(".", inputPath);
  const info = await fs.stat(resolved);

  if (!info) {
    throw new SentilisError({
      code: "PATH_NOT_EXIST",
      params: { path: resolved },
    });
  }

  const issues: ValidationIssue[] = [];
  const collect = options.collectErrors === true ? issues : undefined;

  if (info.isDirectory) {
    return createFromDirectory(fs, resolved, collect, issues);
  }

  if (info.isFile) {
    assertMarkdown(resolved);
    const rootDir = dirname(resolved);
    const file = await readPressFile(fs, {
      filePath: resolved,
      inferredName: basename(resolved, extname(resolved)),
      rootDir,
      collect,
      allowAttachments: false,
    });
    resolveLinkSlugs([file]);
    return { main: file, hidden: [], issues };
  }

  throw new SentilisError({
    code: "UNSUPPORTED_PATH_TYPE",
    params: { path: resolved },
  });
}

async function createFromDirectory(
  fs: FileSystem,
  dirPath: string,
  collect: ValidationIssue[] | undefined,
  issues: ValidationIssue[],
): Promise<PressCreateResult> {
  const entries = await fs.readDir(dirPath);
  const mdFiles = entries.filter((f) => extname(f).toLowerCase() === ".md");

  if (mdFiles.length === 0) {
    throw new SentilisError({
      code: "NO_MARKDOWN_FILES",
      params: { dir: dirPath },
    });
  }

  const hasIndex = mdFiles.includes("index.md");
  if (!hasIndex && mdFiles.length > 1) {
    throw new SentilisError({
      code: "MULTIPLE_NO_INDEX",
      params: { dir: dirPath },
    });
  }

  const rootDir = dirPath;

  if (!hasIndex && mdFiles.length === 1) {
    const main = await readPressFile(fs, {
      filePath: join(dirPath, mdFiles[0]),
      inferredName: basename(mdFiles[0], extname(mdFiles[0])),
      rootDir,
      collect,
      allowAttachments: true,
    });
    resolveLinkSlugs([main]);
    return { main, hidden: [], issues };
  }

  const dirName = basename(dirPath);
  const main = await readPressFile(fs, {
    filePath: join(dirPath, "index.md"),
    inferredName: dirName,
    rootDir,
    collect,
    allowAttachments: true,
  });

  const hidden: PressFile[] = [];
  for (const f of mdFiles) {
    if (f === "index.md") continue;
    const file = await readPressFile(fs, {
      filePath: join(dirPath, f),
      inferredName: basename(f, extname(f)),
      rootDir,
      statusFallback: main.metadata.status,
      visibilityFallback: main.metadata.visibility,
      collect,
      allowAttachments: true,
    });
    hidden.push(file);
  }

  resolveLinkSlugs([main, ...hidden]);
  return { main, hidden, issues };
}

/**
 * Once every entry has been parsed and slugified, fill in `targetSlug`
 * for each link by matching its href to the sibling press file it
 * references. Mutates in place.
 */
function resolveLinkSlugs(files: PressFile[]): void {
  const slugByFilename = new Map<string, string>();
  for (const f of files) {
    slugByFilename.set(basename(f.filePath), f.metadata.slug);
  }
  for (const f of files) {
    f.links = f.links.map((link): PressLinkRef => {
      if (link.targetSlug) return link;
      const decoded = decodeRefSafe(link.href);
      const filename = basename(decoded);
      const slug = slugByFilename.get(filename);
      return { alt: link.alt, href: link.href, targetSlug: slug ?? "" };
    });
  }
}

function decodeRefSafe(ref: string): string {
  try {
    return decodeURIComponent(ref);
  } catch {
    return ref;
  }
}

interface ReadPressFileInput {
  filePath: string;
  inferredName: string;
  rootDir: string;
  statusFallback?: PressMetadata["status"];
  visibilityFallback?: PressMetadata["visibility"];
  collect: ValidationIssue[] | undefined;
  allowAttachments: boolean;
}

async function readPressFile(
  fs: FileSystem,
  input: ReadPressFileInput,
): Promise<PressFile> {
  const {
    filePath,
    inferredName,
    rootDir,
    statusFallback,
    visibilityFallback,
    collect,
    allowAttachments,
  } = input;

  const fileScopedPush = (issue: ValidationIssue) => {
    const withFile = { ...issue, file: issue.file ?? filePath };
    if (collect) collect.push(withFile);
    else throw new SentilisError(withFile);
  };

  const raw = await fs.readText(filePath);
  const { metadata: partial, body, issues: parseIssues } = parseFrontmatter(raw);
  for (const i of parseIssues) fileScopedPush(i);

  const autoDetected = allowAttachments
    ? await autoDetectAssets(fs, rootDir, partial, fileScopedPush)
    : { cover: null };

  const { metadata, issues: metaIssues } = buildMetadata({
    partial,
    inferredName,
    statusFallback,
    visibilityFallback,
    autoDetected,
  });
  for (const i of metaIssues) fileScopedPush(i);

  const dir = dirname(filePath);

  // Cover field
  if (metadata.cover && !isRemote(metadata.cover)) {
    const refIssues = await validateLocalAssetRef(
      fs,
      metadata.cover,
      dir,
      rootDir,
      "cover",
      allowAttachments,
    );
    for (const i of refIssues) fileScopedPush(i);
  }

  // Inline images
  const images = extractImageLinks(body);
  for (const img of images) {
    if (isRemote(img.src)) continue;
    const refIssues = await validateLocalAssetRef(
      fs,
      img.src,
      dir,
      rootDir,
      "image",
      allowAttachments,
    );
    for (const i of refIssues) fileScopedPush(i);
  }

  // Inline videos
  const videos = extractVideoLinks(body);
  for (const video of videos) {
    if (isRemote(video.src)) continue;
    const refIssues = await validateLocalAssetRef(
      fs,
      video.src,
      dir,
      rootDir,
      "video",
      allowAttachments,
    );
    for (const i of refIssues) fileScopedPush(i);
  }

  // Plain links (only web allowed; media or .md rejected handled here)
  for (const issue of validateLinks(body)) {
    fileScopedPush(issue);
  }

  // Local markdown links must live at the top level of the directory.
  const links = extractMarkdownLinks(body);
  for (const link of links) {
    if (isRemote(link.href)) continue;
    const linkAbs = resolveRef(dir, link.href);
    const insideIssues = await assertInsideRoot(fs, linkAbs, rootDir, link.href);
    for (const i of insideIssues) fileScopedPush(i);
    if (insideIssues.length > 0) continue;
    if (dirname(relative(rootDir, linkAbs)) !== ".") {
      fileScopedPush({
        code: "LINK_NOT_TOP_LEVEL",
        params: { ref: link.href },
      });
      continue;
    }
    if (!(await fs.exists(linkAbs))) {
      fileScopedPush({
        code: "LINK_NOT_FOUND",
        params: { ref: link.href },
      });
    }
  }

  const linkRefs: PressLinkRef[] = links.map((l) => ({
    alt: l.alt,
    href: l.href,
    targetSlug: "",
  }));

  return {
    filePath,
    content: body,
    metadata,
    images,
    videos,
    links: linkRefs,
  };
}

async function autoDetectAssets(
  fs: FileSystem,
  rootDir: string,
  partial: Partial<PressMetadata>,
  push: (issue: ValidationIssue) => void,
): Promise<{ cover: string | null }> {
  const attachmentsRoot = join(rootDir, ATTACHMENTS_DIR);
  const out: { cover: string | null } = { cover: null };

  if (partial.cover === undefined) {
    const matches: string[] = [];
    for (const candidate of COVER_CANDIDATES) {
      if (await fs.exists(join(attachmentsRoot, candidate))) {
        matches.push(candidate);
      }
    }
    if (matches.length > 1) {
      push({
        code: "MULTIPLE_COVER_CANDIDATES",
        params: {
          attachmentsDir: ATTACHMENTS_DIR,
          matches: matches.join(", "),
        },
      });
    } else if (matches.length === 1) {
      out.cover = `./${ATTACHMENTS_DIR}/${matches[0]}`;
    }
  }
  return out;
}

function assertMarkdown(filePath: string): void {
  if (extname(filePath).toLowerCase() !== ".md") {
    throw new SentilisError({
      code: "NOT_MARKDOWN",
      params: { path: filePath },
    });
  }
}
