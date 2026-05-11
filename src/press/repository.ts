import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import type { RestClient, PressPublishResponse } from "@sentilis/core";
import {
  buildPressFormData,
  toPressUpload,
  type PressCreateResult,
  type PressFile,
} from "@sentilis/core/press";

/** Maximum total asset payload size (matches the server limit). */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

function isRemote(ref: string): boolean {
  return ref.startsWith("http://") || ref.startsWith("https://");
}

/**
 * Resolve every local asset reference of a `PressFile` against its
 * directory and read the binary, keying it by the original ref string
 * (the same value the server will see in the manifest).
 */
async function collectAssets(
  press: PressFile,
  assets: Map<string, Uint8Array>,
): Promise<void> {
  const dir = dirname(press.filePath);

  const addRef = async (ref: string) => {
    if (isRemote(ref)) return;
    if (assets.has(ref)) return;
    const decoded = decodeURIComponent(ref);
    const absPath = isAbsolute(decoded) ? decoded : join(dir, decoded);
    const data = await readFile(absPath);
    // Buffer is a Uint8Array — store the underlying bytes only.
    assets.set(ref, new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  };

  if (press.metadata.image) await addRef(press.metadata.image);
  for (const img of press.images) await addRef(img.src);
  for (const video of press.videos) await addRef(video.src);
}

function assertSize(assets: Map<string, Uint8Array>): void {
  let total = 0;
  for (const data of assets.values()) total += data.byteLength;
  if (total > MAX_UPLOAD_BYTES) {
    const actualMb = (total / (1024 * 1024)).toFixed(2);
    const maxMb = (MAX_UPLOAD_BYTES / (1024 * 1024)).toFixed(0);
    throw new Error(
      `Press assets total ${actualMb} MB which exceeds the ${maxMb} MB upload limit.`,
    );
  }
}

/**
 * Publish a press entry: read every referenced binary, package them as
 * a structured multipart payload (manifest JSON + one part per asset),
 * and POST once.
 */
export async function publishPress(
  client: RestClient,
  result: PressCreateResult,
): Promise<PressPublishResponse> {
  const assets = new Map<string, Uint8Array>();
  await collectAssets(result.main, assets);
  for (const hidden of result.hidden) {
    await collectAssets(hidden, assets);
  }
  assertSize(assets);

  const upload = toPressUpload(result);
  const formData = buildPressFormData(upload, assets);
  return client.uploadPress(formData);
}
