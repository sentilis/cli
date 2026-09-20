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
import { isRemote, validateLocalAssetRef } from "../walker.js";
import {
  buildMetadata,
  extractImages,
  parseFrontmatter,
  validateLinks,
} from "./markdown.js";
import { MAX_GALLERY_IMAGES } from "./types.js";
import type { GalleryCreateResult, GalleryFile } from "./types.js";

export interface CreateGalleryOptions {
  collectErrors?: boolean;
}

/**
 * Lee una entrada de galería: una carpeta con un solo `.md` y su `attachments/`,
 * o un `.md` suelto que solo apunte a imágenes remotas.
 *
 * A diferencia de Press o Market, aquí las imágenes no ilustran un texto: son
 * la entrada. Por eso una sin ninguna es un error y no un aviso.
 */
export async function createGallery(
  fs: FileSystem,
  inputPath: string,
  options: CreateGalleryOptions = {},
): Promise<GalleryCreateResult> {
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
    const main = await readGalleryFile(fs, {
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
): Promise<GalleryCreateResult> {
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
      code: "GALLERY_MULTIPLE_FILES",
      params: { dir: dirPath },
    });
  }

  const main = await readGalleryFile(fs, {
    filePath: join(dirPath, mdFiles[0]),
    inferredName: basename(mdFiles[0], extname(mdFiles[0])),
    rootDir: dirPath,
    collect,
    allowAttachments: true,
  });
  return { main, issues };
}

interface ReadGalleryFileInput {
  filePath: string;
  inferredName: string;
  rootDir: string;
  collect: ValidationIssue[] | undefined;
  allowAttachments: boolean;
}

async function readGalleryFile(
  fs: FileSystem,
  input: ReadGalleryFileInput,
): Promise<GalleryFile> {
  const { filePath, inferredName, rootDir, collect, allowAttachments } = input;

  const push = (issue: ValidationIssue) => {
    const withFile = { ...issue, file: issue.file ?? filePath };
    if (collect) collect.push(withFile);
    else throw new SentilisError(withFile);
  };

  const raw = await fs.readText(filePath);
  const { metadata: partial, body, issues: parseIssues } = parseFrontmatter(raw);
  for (const i of parseIssues) push(i);

  const { metadata, issues: metaIssues } = buildMetadata({
    partial,
    inferredName,
  });
  for (const i of metaIssues) push(i);

  const images = extractImages(body);

  if (images.length === 0) {
    push({ code: "GALLERY_NO_IMAGES", params: { file: filePath } });
  }
  if (images.length > MAX_GALLERY_IMAGES) {
    push({
      code: "GALLERY_TOO_MANY_IMAGES",
      params: { count: images.length, max: MAX_GALLERY_IMAGES },
    });
  }

  const dir = dirname(filePath);

  for (const image of images) {
    if (isRemote(image.src)) continue;
    const refIssues = await validateLocalAssetRef(
      fs,
      image.src,
      dir,
      rootDir,
      "image",
      allowAttachments,
    );
    for (const i of refIssues) push(i);
  }

  // Sin portada elegida preside la primera, que es la de más arriba en la
  // pared. Si se eligió una, tiene que ser una de las colgadas: una portada
  // que no está en la sala no la puede presidir.
  if (metadata.cover === null) {
    metadata.cover = images[0]?.src ?? null;
  } else if (!images.some((image) => image.src === metadata.cover)) {
    push({
      code: "GALLERY_COVER_NOT_IN_BODY",
      params: { value: metadata.cover },
    });
  }

  for (const issue of validateLinks(body)) push(issue);

  return { filePath, content: body, metadata, images };
}

function assertMarkdown(filePath: string): void {
  if (extname(filePath).toLowerCase() !== ".md") {
    throw new SentilisError({
      code: "NOT_MARKDOWN",
      params: { path: filePath },
    });
  }
}
