import type { RestClient, PrimePublishResponse } from "../client.js";
import { SentilisError } from "../errors.js";
import { type FileSystem, dirname } from "../fs.js";
import { isRemote, resolveRef } from "../walker.js";
import { toPrimeUpload, buildPrimeFormData } from "./upload.js";
import type { PrimeCreateResult } from "./types.js";

export const MAX_PRIME_UPLOAD_BYTES = 5 * 1024 * 1024;

async function collectAssets(
  fs: FileSystem,
  result: PrimeCreateResult,
  assets: Map<string, Uint8Array>,
): Promise<void> {
  const plan = result.main;
  const dir = dirname(plan.filePath);

  const addRef = async (ref: string) => {
    if (isRemote(ref)) return;
    if (assets.has(ref)) return;
    assets.set(ref, await fs.readBinary(resolveRef(dir, ref)));
  };

  if (plan.metadata.cover) await addRef(plan.metadata.cover);
  for (const img of plan.images) await addRef(img.src);
  for (const video of plan.videos) await addRef(video.src);
}

function assertSize(assets: Map<string, Uint8Array>): void {
  let total = 0;
  for (const data of assets.values()) total += data.byteLength;
  if (total > MAX_PRIME_UPLOAD_BYTES) {
    throw new SentilisError({
      code: "UPLOAD_TOO_LARGE",
      params: {
        kind: "Prime plan",
        actualMb: (total / (1024 * 1024)).toFixed(2),
        maxMb: (MAX_PRIME_UPLOAD_BYTES / (1024 * 1024)).toFixed(0),
      },
    });
  }
}

export async function publishPrime(
  client: RestClient,
  fs: FileSystem,
  result: PrimeCreateResult,
  extraAssets?: Map<string, Uint8Array>,
): Promise<PrimePublishResponse> {
  const assets = new Map<string, Uint8Array>(extraAssets ?? []);
  await collectAssets(fs, result, assets);
  assertSize(assets);

  return client.uploadPrime(buildPrimeFormData(toPrimeUpload(result), assets));
}
