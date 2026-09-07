import type { RestClient, PressPublishResponse } from "../client.js";
import { SentilisError } from "../errors.js";
import { type FileSystem, dirname } from "../fs.js";
import { isRemote, resolveRef } from "../walker.js";
import { toPressUpload, buildPressFormData } from "./upload.js";
import type { PressCreateResult, PressFile } from "./types.js";

/** Maximum total asset payload size (matches the server limit). */
export const MAX_PRESS_UPLOAD_BYTES = 5 * 1024 * 1024;

async function collectAssets(
  fs: FileSystem,
  file: PressFile,
  assets: Map<string, Uint8Array>,
): Promise<void> {
  const dir = dirname(file.filePath);

  const addRef = async (ref: string) => {
    if (isRemote(ref)) return;
    if (assets.has(ref)) return;
    const absPath = resolveRef(dir, ref);
    const data = await fs.readBinary(absPath);
    assets.set(ref, data);
  };

  if (file.metadata.cover) await addRef(file.metadata.cover);
  for (const img of file.images) await addRef(img.src);
  for (const video of file.videos) await addRef(video.src);
}

function assertSize(assets: Map<string, Uint8Array>): void {
  let total = 0;
  for (const data of assets.values()) total += data.byteLength;
  if (total > MAX_PRESS_UPLOAD_BYTES) {
    const actualMb = (total / (1024 * 1024)).toFixed(2);
    const maxMb = (MAX_PRESS_UPLOAD_BYTES / (1024 * 1024)).toFixed(0);
    throw new SentilisError({
      code: "UPLOAD_TOO_LARGE",
      params: { kind: "Press", actualMb, maxMb },
    });
  }
}

/**
 * Publish a press entry: read every referenced binary via the adapter,
 * package as a structured multipart payload, and POST once.
 *
 * Pre-supplied `extraAssets` are merged in (used when the caller has
 * already loaded some binaries — e.g. Obsidian's metadata-cache flow).
 */
export async function publishPress(
  client: RestClient,
  fs: FileSystem,
  result: PressCreateResult,
  extraAssets?: Map<string, Uint8Array>,
): Promise<PressPublishResponse> {
  const assets = new Map<string, Uint8Array>(extraAssets ?? []);
  await collectAssets(fs, result.main, assets);
  for (const hidden of result.hidden) {
    await collectAssets(fs, hidden, assets);
  }
  assertSize(assets);

  const upload = toPressUpload(result);
  const formData = buildPressFormData(upload, assets);
  return client.uploadPress(formData);
}
