import type { RestClient, ProductPublishResponse } from "../client.js";
import { SentilisError } from "../errors.js";
import { type FileSystem, dirname } from "../fs.js";
import { isRemote, resolveRef } from "../walker.js";
import { toProductUpload, buildProductFormData } from "./upload.js";
import type { ProductCreateResult } from "./types.js";

export const MAX_PRODUCT_UPLOAD_BYTES = 5 * 1024 * 1024;

async function collectAssets(
  fs: FileSystem,
  result: ProductCreateResult,
  assets: Map<string, Uint8Array>,
): Promise<void> {
  const product = result.main;
  const dir = dirname(product.filePath);

  const addRef = async (ref: string) => {
    if (isRemote(ref)) return;
    if (assets.has(ref)) return;
    const absPath = resolveRef(dir, ref);
    const data = await fs.readBinary(absPath);
    assets.set(ref, data);
  };

  if (product.metadata.cover) await addRef(product.metadata.cover);
  if (product.metadata.attachment) await addRef(product.metadata.attachment);
  for (const img of product.images) await addRef(img.src);
  for (const video of product.videos) await addRef(video.src);
}

function assertSize(assets: Map<string, Uint8Array>): void {
  let total = 0;
  for (const data of assets.values()) total += data.byteLength;
  if (total > MAX_PRODUCT_UPLOAD_BYTES) {
    const actualMb = (total / (1024 * 1024)).toFixed(2);
    const maxMb = (MAX_PRODUCT_UPLOAD_BYTES / (1024 * 1024)).toFixed(0);
    throw new SentilisError({
      code: "UPLOAD_TOO_LARGE",
      params: { kind: "Product", actualMb, maxMb },
    });
  }
}

export async function publishProduct(
  client: RestClient,
  fs: FileSystem,
  result: ProductCreateResult,
  extraAssets?: Map<string, Uint8Array>,
): Promise<ProductPublishResponse> {
  const assets = new Map<string, Uint8Array>(extraAssets ?? []);
  await collectAssets(fs, result, assets);
  assertSize(assets);

  const upload = toProductUpload(result);
  const formData = buildProductFormData(upload, assets);
  return client.uploadProduct(formData);
}
