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
  extractVideoLinks,
  parseFrontmatter,
  validateLinks,
} from "./markdown.js";
import type {
  ProductCreateResult,
  ProductFile,
  ProductMetadata,
} from "./types.js";

const IMAGE_CANDIDATES = [
  "image.png",
  "image.jpg",
  "image.jpeg",
  "image.webp",
];
const ATTACHMENT_CANDIDATES = ["attachment.zip"];

export interface CreateProductOptions {
  collectErrors?: boolean;
}

export async function createProduct(
  fs: FileSystem,
  inputPath: string,
  options: CreateProductOptions = {},
): Promise<ProductCreateResult> {
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
    const main = await readProductFile(fs, {
      filePath: resolved,
      inferredName: basename(resolved, extname(resolved)),
      rootDir,
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
): Promise<ProductCreateResult> {
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
      code: "MARKET_MULTIPLE_FILES",
      params: { dir: dirPath },
    });
  }

  const rootDir = dirPath;
  const main = await readProductFile(fs, {
    filePath: join(dirPath, mdFiles[0]),
    inferredName: basename(mdFiles[0], extname(mdFiles[0])),
    rootDir,
    collect,
    allowAttachments: true,
  });
  return { main, issues };
}

interface ReadProductFileInput {
  filePath: string;
  inferredName: string;
  rootDir: string;
  collect: ValidationIssue[] | undefined;
  allowAttachments: boolean;
}

async function readProductFile(
  fs: FileSystem,
  input: ReadProductFileInput,
): Promise<ProductFile> {
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
    ? await autoDetectAssets(fs, rootDir, partial, push)
    : { image: null, attachment: null };

  const { metadata, issues: metaIssues } = buildMetadata({
    partial,
    inferredName,
    autoDetected,
  });
  for (const i of metaIssues) push(i);

  const dir = dirname(filePath);

  for (const [field, ref] of [
    ["image", metadata.image] as const,
    ["attachment", metadata.attachment] as const,
  ]) {
    if (!ref) continue;
    if (isRemote(ref)) {
      push({
        code: "PRODUCT_FIELD_MUST_BE_LOCAL",
        params: { field, attachmentsDir: ATTACHMENTS_DIR, value: ref },
      });
      continue;
    }
    const refIssues = await validateLocalAssetRef(
      fs,
      ref,
      dir,
      rootDir,
      field,
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

async function autoDetectAssets(
  fs: FileSystem,
  rootDir: string,
  partial: Partial<ProductMetadata>,
  push: (issue: ValidationIssue) => void,
): Promise<{ image: string | null; attachment: string | null }> {
  const attachmentsRoot = join(rootDir, ATTACHMENTS_DIR);
  const out: { image: string | null; attachment: string | null } = {
    image: null,
    attachment: null,
  };

  if (partial.image === undefined) {
    const matches: string[] = [];
    for (const candidate of IMAGE_CANDIDATES) {
      if (await fs.exists(join(attachmentsRoot, candidate))) {
        matches.push(candidate);
      }
    }
    if (matches.length > 1) {
      push({
        code: "MULTIPLE_IMAGE_CANDIDATES",
        params: {
          attachmentsDir: ATTACHMENTS_DIR,
          matches: matches.join(", "),
        },
      });
    } else if (matches.length === 1) {
      out.image = `./${ATTACHMENTS_DIR}/${matches[0]}`;
    }
  }

  if (partial.attachment === undefined) {
    for (const candidate of ATTACHMENT_CANDIDATES) {
      if (await fs.exists(join(attachmentsRoot, candidate))) {
        out.attachment = `./${ATTACHMENTS_DIR}/${candidate}`;
        break;
      }
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
