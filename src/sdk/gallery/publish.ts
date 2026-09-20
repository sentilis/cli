import type { RestClient, GalleryPublishResponse } from "../client.js";
import { SentilisError } from "../errors.js";
import { type FileSystem, dirname } from "../fs.js";
import { isRemote, resolveRef } from "../walker.js";
import { readImageSize } from "../imageSize.js";
import { toGalleryUpload, buildGalleryFormData } from "./upload.js";
import type { GalleryCreateResult, GalleryUpload } from "./types.js";

/**
 * Una serie son varias obras a tamaño completo, no una portada: los 5 MB que
 * le bastan a Press o a Prime aquí se agotan con dos fotos. Sigue por debajo
 * del tope del servidor (`MAX_UPLOAD_BYTES`, 32 MB).
 */
export const MAX_GALLERY_UPLOAD_BYTES = 25 * 1024 * 1024;

async function collectAssets(
  fs: FileSystem,
  result: GalleryCreateResult,
  assets: Map<string, Uint8Array>,
): Promise<void> {
  const entry = result.main;
  const dir = dirname(entry.filePath);

  for (const image of entry.images) {
    if (isRemote(image.src)) continue;
    if (assets.has(image.src)) continue;
    assets.set(image.src, await fs.readBinary(resolveRef(dir, image.src)));
  }
}

/**
 * Las medidas se leen aquí y no al recorrer el disco: es el único momento en
 * que los bytes están en la mano. Una imagen remota, o un formato que la
 * cabecera no sepa contar, se queda sin medidas y la página cae a su repliegue.
 */
function fillSizes(
  upload: GalleryUpload,
  assets: Map<string, Uint8Array>,
): void {
  for (const image of upload.images) {
    const data = assets.get(image.src);
    if (!data) continue;
    const size = readImageSize(data);
    if (!size) continue;
    image.width = size.width;
    image.height = size.height;
  }
}

function assertSize(assets: Map<string, Uint8Array>): void {
  let total = 0;
  for (const data of assets.values()) total += data.byteLength;
  if (total > MAX_GALLERY_UPLOAD_BYTES) {
    const actualMb = (total / (1024 * 1024)).toFixed(2);
    const maxMb = (MAX_GALLERY_UPLOAD_BYTES / (1024 * 1024)).toFixed(0);
    throw new SentilisError({
      code: "UPLOAD_TOO_LARGE",
      params: { kind: "Gallery", actualMb, maxMb },
    });
  }
}

export async function publishGallery(
  client: RestClient,
  fs: FileSystem,
  result: GalleryCreateResult,
  extraAssets?: Map<string, Uint8Array>,
): Promise<GalleryPublishResponse> {
  const assets = new Map<string, Uint8Array>(extraAssets ?? []);
  await collectAssets(fs, result, assets);
  assertSize(assets);

  const upload = toGalleryUpload(result);
  fillSizes(upload, assets);
  return client.uploadGallery(buildGalleryFormData(upload, assets));
}
