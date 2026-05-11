import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import type { RestClient, ProductPublishResponse } from "@sentilis/core";
import {
  buildProductFormData,
  toProductUpload,
  type ProductCreateResult,
} from "@sentilis/core/market";

/** Maximum total asset payload size (matches the server limit). */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

function isRemote(ref: string): boolean {
  return ref.startsWith("http://") || ref.startsWith("https://");
}

async function collectAssets(
  result: ProductCreateResult,
  assets: Map<string, Uint8Array>,
): Promise<void> {
  const product = result.main;
  const dir = dirname(product.filePath);

  const addRef = async (ref: string) => {
    if (isRemote(ref)) return;
    if (assets.has(ref)) return;
    const decoded = decodeURIComponent(ref);
    const absPath = isAbsolute(decoded) ? decoded : join(dir, decoded);
    const data = await readFile(absPath);
    assets.set(ref, new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  };

  if (product.metadata.image) await addRef(product.metadata.image);
  if (product.metadata.attachment) await addRef(product.metadata.attachment);
  for (const img of product.images) await addRef(img.src);
  for (const video of product.videos) await addRef(video.src);
}

function assertSize(assets: Map<string, Uint8Array>): void {
  let total = 0;
  for (const data of assets.values()) total += data.byteLength;
  if (total > MAX_UPLOAD_BYTES) {
    const actualMb = (total / (1024 * 1024)).toFixed(2);
    const maxMb = (MAX_UPLOAD_BYTES / (1024 * 1024)).toFixed(0);
    throw new Error(
      `Product assets total ${actualMb} MB which exceeds the ${maxMb} MB upload limit.`,
    );
  }
}

/**
 * Publish a product: read every referenced binary, package as a
 * structured multipart payload (manifest JSON + one part per asset),
 * and POST once.
 */
export async function publishProduct(
  client: RestClient,
  result: ProductCreateResult,
): Promise<ProductPublishResponse> {
  const assets = new Map<string, Uint8Array>();
  await collectAssets(result, assets);
  assertSize(assets);

  const upload = toProductUpload(result);
  const formData = buildProductFormData(upload, assets);
  return client.uploadProduct(formData);
}
