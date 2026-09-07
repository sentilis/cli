import type { ValidationIssue } from "../errors.js";
import { SentilisError } from "../errors.js";
import {
  type FileSystem,
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  resolve as resolvePath,
} from "../fs.js";
import {
  ATTACHMENTS_DIR,
  isRemote,
  validateLocalAssetRef,
} from "../walker.js";
import {
  buildMetadata,
  extractImageLinks,
  parseFrontmatter,
  validateLinks,
  type PartialBioMetadata,
} from "./markdown.js";
import type { BioCreateResult, BioFile } from "./types.js";
import type { LifecycleStatus, LifecycleVisibility } from "../types.js";

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

export interface CreateBioOptions {
  collectErrors?: boolean;
}

export async function createBio(
  fs: FileSystem,
  inputPath: string,
  options: CreateBioOptions = {},
): Promise<BioCreateResult> {
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
    const fileBase = basename(resolved, extname(resolved));
    const main = await readBioFile(fs, {
      filePath: resolved,
      inferredName: fileBase,
      inferredSlug: fileBase,
      inferredLanguage: "en",
      rootDir,
      collect,
      allowAttachments: false,
      autoDetectAvatar: false,
    });
    return { main, variants: [], issues };
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
): Promise<BioCreateResult> {
  const entries = await fs.readDir(dirPath);
  const mdFiles = entries
    .filter((f) => extname(f).toLowerCase() === ".md")
    .sort();

  if (mdFiles.length === 0) {
    throw new SentilisError({
      code: "NO_MARKDOWN_FILES",
      params: { dir: dirPath },
    });
  }

  const dirName = basename(dirPath);
  const inferredSlug = dirName;
  const rootDir = dirPath;

  const detectedAvatar = await autoDetectAvatar(fs, rootDir, (i) => {
    if (collect) collect.push(i);
    else throw new SentilisError(i);
  });

  const hasIndex = mdFiles.includes("index.md");
  const mainFilename = hasIndex ? "index.md" : mdFiles[0];

  const main = await readBioFile(fs, {
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
    const file = await readBioFile(fs, {
      filePath: join(dirPath, f),
      inferredName: main.metadata.name,
      inferredSlug: language,
      inferredLanguage: language,
      rootDir,
      collect,
      allowAttachments: true,
      autoDetectAvatar: true,
      detectedAvatar,
      isVariant: true,
      statusFallback: main.metadata.status,
      visibilityFallback: main.metadata.visibility,
      passwordFallback: main.metadata.password,
    });
    variants.push(file);
  }

  // Slug is structural — always the language code for variants.
  for (const v of variants) {
    v.metadata.slug = v.metadata.language;
  }

  return { main, variants, issues };
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
  collect: ValidationIssue[] | undefined;
  allowAttachments: boolean;
  autoDetectAvatar: boolean;
  detectedAvatar?: string | null;
  isVariant?: boolean;
  statusFallback?: LifecycleStatus;
  visibilityFallback?: LifecycleVisibility;
  passwordFallback?: string | null;
}

async function readBioFile(
  fs: FileSystem,
  input: ReadBioFileInput,
): Promise<BioFile> {
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

  const push = (issue: ValidationIssue) => {
    const withFile = { ...issue, file: issue.file ?? filePath };
    if (collect) collect.push(withFile);
    else throw new SentilisError(withFile);
  };

  const raw = await fs.readText(filePath);
  let partial: PartialBioMetadata = {};
  let body = raw;
  try {
    const parsed = parseFrontmatter(raw);
    partial = parsed.metadata;
    body = parsed.body;
    for (const i of parsed.issues) push(i);
  } catch (e) {
    if (collect)
      collect.push({
        code: "INVALID_STATUS",
        params: { value: (e as Error).message },
        file: filePath,
      });
    else throw e;
  }

  const auto = shouldAutoDetect
    ? { avatar: partial.avatar === undefined ? (detectedAvatar ?? null) : null }
    : { avatar: null };

  // Variants reuse main's slug structurally (forced to the language code below).
  if (isVariant) {
    delete partial.slug;
  }

  const { metadata, issues: metaIssues } = buildMetadata({
    partial,
    inferredName,
    inferredSlug,
    inferredLanguage,
    autoDetected: auto,
    statusFallback,
    visibilityFallback,
    passwordFallback,
  });
  for (const i of metaIssues) push(i);

  const dir = dirname(filePath);

  if (metadata.avatar && !isRemote(metadata.avatar)) {
    const refIssues = await validateLocalAssetRef(
      fs,
      metadata.avatar,
      dir,
      rootDir,
      "avatar",
      allowAttachments,
    );
    for (const i of refIssues) push(i);
  }

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
    for (const i of refIssues) push(i);
  }

  for (const issue of validateLinks(body)) push(issue);

  return { filePath, content: body, metadata, images };
}

async function autoDetectAvatar(
  fs: FileSystem,
  rootDir: string,
  push: (issue: ValidationIssue) => void,
): Promise<string | null> {
  const attachmentsRoot = join(rootDir, ATTACHMENTS_DIR);
  const matches: string[] = [];
  for (const candidate of AVATAR_CANDIDATES) {
    if (await fs.exists(join(attachmentsRoot, candidate))) {
      matches.push(candidate);
    }
  }
  if (matches.length > 1) {
    push({
      code: "MULTIPLE_AVATAR_CANDIDATES",
      params: { attachmentsDir: ATTACHMENTS_DIR, matches: matches.join(", ") },
    });
    return null;
  }
  if (matches.length === 1) {
    return `./${ATTACHMENTS_DIR}/${matches[0]}`;
  }
  return null;
}

function assertMarkdown(filePath: string): void {
  if (extname(filePath).toLowerCase() !== ".md") {
    throw new SentilisError({
      code: "NOT_MARKDOWN",
      params: { path: filePath },
    });
  }
}
