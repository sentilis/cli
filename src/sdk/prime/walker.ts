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
import { ATTACHMENTS_DIR, isRemote, validateLocalAssetRef } from "../walker.js";
import {
  buildMetadata,
  extractImageLinks,
  extractVideoLinks,
  parseFrontmatter,
  validateLinks,
} from "./markdown.js";
import type { PrimeCreateResult, PrimeFile, PrimeMetadata } from "./types.js";

const COVER_CANDIDATES = ["cover.png", "cover.jpg", "cover.jpeg", "cover.webp"];

export interface CreatePrimeOptions {
  collectErrors?: boolean;
}

/**
 * Lee un plan Prime: una carpeta con un solo `.md` y su `attachments/`, o un
 * `.md` suelto sin assets locales. Misma forma que un producto de Market menos
 * el adjunto, porque un plan no entrega archivos.
 */
export async function createPrime(
  fs: FileSystem,
  inputPath: string,
  options: CreatePrimeOptions = {},
): Promise<PrimeCreateResult> {
  const resolved = isAbsolute(inputPath)
    ? inputPath
    : resolvePath(".", inputPath);
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
    const main = await readPrimeFile(fs, {
      filePath: resolved,
      inferredName: basename(resolved, extname(resolved)),
      rootDir: dirname(resolved),
      collect,
      allowAttachments: false,
    });
    return { main, issues };
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
): Promise<PrimeCreateResult> {
  const entries = await fs.readDir(dirPath);
  const mdFiles = entries.filter((f) => extname(f).toLowerCase() === ".md");

  if (mdFiles.length === 0) {
    throw new SentilisError({
      code: "NO_MARKDOWN_FILES",
      params: { dir: dirPath },
    });
  }
  if (mdFiles.length > 1) {
    throw new SentilisError({
      code: "PRIME_MULTIPLE_FILES",
      params: { dir: dirPath },
    });
  }

  const main = await readPrimeFile(fs, {
    filePath: join(dirPath, mdFiles[0]),
    inferredName: basename(mdFiles[0], extname(mdFiles[0])),
    rootDir: dirPath,
    collect,
    allowAttachments: true,
  });
  return { main, issues };
}

interface ReadPrimeFileInput {
  filePath: string;
  inferredName: string;
  rootDir: string;
  collect: ValidationIssue[] | undefined;
  allowAttachments: boolean;
}

async function readPrimeFile(
  fs: FileSystem,
  input: ReadPrimeFileInput,
): Promise<PrimeFile> {
  const { filePath, inferredName, rootDir, collect, allowAttachments } = input;

  const push = (issue: ValidationIssue) => {
    const withFile = { ...issue, file: issue.file ?? filePath };
    if (collect) collect.push(withFile);
    else throw new SentilisError(withFile);
  };

  const raw = await fs.readText(filePath);
  const { metadata: partial, body, issues: parseIssues } = parseFrontmatter(raw);
  for (const i of parseIssues) push(i);

  const autoDetected = allowAttachments
    ? await autoDetectCover(fs, rootDir, partial, push)
    : { cover: null };

  const { metadata, issues: metaIssues } = buildMetadata({
    partial,
    inferredName,
    autoDetected,
  });
  for (const i of metaIssues) push(i);

  const dir = dirname(filePath);

  if (metadata.cover) {
    if (isRemote(metadata.cover)) {
      push({
        code: "PRODUCT_FIELD_MUST_BE_LOCAL",
        params: {
          field: "cover",
          attachmentsDir: ATTACHMENTS_DIR,
          value: metadata.cover,
        },
      });
    } else {
      const refIssues = await validateLocalAssetRef(
        fs,
        metadata.cover,
        dir,
        rootDir,
        "cover",
        allowAttachments,
      );
      for (const i of refIssues) push(i);
    }
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
    for (const i of refIssues) push(i);
  }

  for (const issue of validateLinks(body)) push(issue);

  return { filePath, content: body, metadata, images, videos };
}

async function autoDetectCover(
  fs: FileSystem,
  rootDir: string,
  partial: Partial<PrimeMetadata>,
  push: (issue: ValidationIssue) => void,
): Promise<{ cover: string | null }> {
  if (partial.cover !== undefined) return { cover: null };

  const attachmentsRoot = join(rootDir, ATTACHMENTS_DIR);
  const matches: string[] = [];
  for (const candidate of COVER_CANDIDATES) {
    if (await fs.exists(join(attachmentsRoot, candidate))) {
      matches.push(candidate);
    }
  }

  if (matches.length > 1) {
    push({
      code: "MULTIPLE_COVER_CANDIDATES",
      params: { attachmentsDir: ATTACHMENTS_DIR, matches: matches.join(", ") },
    });
    return { cover: null };
  }

  return {
    cover: matches.length === 1 ? `./${ATTACHMENTS_DIR}/${matches[0]}` : null,
  };
}

function assertMarkdown(filePath: string): void {
  if (extname(filePath).toLowerCase() !== ".md") {
    throw new SentilisError({
      code: "NOT_MARKDOWN",
      params: { path: filePath },
    });
  }
}
