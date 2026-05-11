import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import type { RestClient, BioPublishResponse } from "@sentilis/core";
import {
  buildBioFormData,
  toBioUpload,
  type BioCreateResult,
  type BioFile,
} from "@sentilis/core/bio";

/** Maximum total asset payload size (matches the server limit). */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

function isRemote(ref: string): boolean {
  return ref.startsWith("http://") || ref.startsWith("https://");
}

async function collectAssets(
  bio: BioFile,
  assets: Map<string, Uint8Array>,
): Promise<void> {
  const dir = dirname(bio.filePath);

  const addRef = async (ref: string) => {
    if (isRemote(ref)) return;
    if (assets.has(ref)) return;
    const decoded = decodeURIComponent(ref);
    const absPath = isAbsolute(decoded) ? decoded : join(dir, decoded);
    const data = await readFile(absPath);
    assets.set(
      ref,
      new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    );
  };

  if (bio.metadata.avatar) await addRef(bio.metadata.avatar);
  for (const img of bio.images) await addRef(img.src);
}

function assertSize(assets: Map<string, Uint8Array>): void {
  let total = 0;
  for (const data of assets.values()) total += data.byteLength;
  if (total > MAX_UPLOAD_BYTES) {
    const actualMb = (total / (1024 * 1024)).toFixed(2);
    const maxMb = (MAX_UPLOAD_BYTES / (1024 * 1024)).toFixed(0);
    throw new Error(
      `Bio assets total ${actualMb} MB which exceeds the ${maxMb} MB upload limit.`,
    );
  }
}

/**
 * Publish a bio: read every referenced binary, package as a structured
 * multipart payload (manifest JSON + one part per asset), and POST once.
 */
export async function publishBio(
  client: RestClient,
  result: BioCreateResult,
): Promise<BioPublishResponse> {
  const assets = new Map<string, Uint8Array>();
  await collectAssets(result.main, assets);
  for (const variant of result.variants) {
    await collectAssets(variant, assets);
  }
  assertSize(assets);

  const upload = toBioUpload(result);
  const formData = buildBioFormData(upload, assets);
  return client.uploadBio(formData);
}
