import type { RestClient, BioPublishResponse } from "../client.js";
import { SentilisError } from "../errors.js";
import { type FileSystem, dirname } from "../fs.js";
import { isRemote, resolveRef } from "../walker.js";
import { toBioUpload, buildBioFormData } from "./upload.js";
import type { BioCreateResult, BioFile } from "./types.js";

export const MAX_BIO_UPLOAD_BYTES = 5 * 1024 * 1024;

async function collectAssets(
  fs: FileSystem,
  bio: BioFile,
  assets: Map<string, Uint8Array>,
): Promise<void> {
  const dir = dirname(bio.filePath);

  const addRef = async (ref: string) => {
    if (isRemote(ref)) return;
    if (assets.has(ref)) return;
    const absPath = resolveRef(dir, ref);
    const data = await fs.readBinary(absPath);
    assets.set(ref, data);
  };

  if (bio.metadata.avatar) await addRef(bio.metadata.avatar);
  for (const img of bio.images) await addRef(img.src);
}

function assertSize(assets: Map<string, Uint8Array>): void {
  let total = 0;
  for (const data of assets.values()) total += data.byteLength;
  if (total > MAX_BIO_UPLOAD_BYTES) {
    const actualMb = (total / (1024 * 1024)).toFixed(2);
    const maxMb = (MAX_BIO_UPLOAD_BYTES / (1024 * 1024)).toFixed(0);
    throw new SentilisError({
      code: "UPLOAD_TOO_LARGE",
      params: { kind: "Bio", actualMb, maxMb },
    });
  }
}

export async function publishBio(
  client: RestClient,
  fs: FileSystem,
  result: BioCreateResult,
  extraAssets?: Map<string, Uint8Array>,
): Promise<BioPublishResponse> {
  const assets = new Map<string, Uint8Array>(extraAssets ?? []);
  await collectAssets(fs, result.main, assets);
  for (const variant of result.variants) {
    await collectAssets(fs, variant, assets);
  }
  assertSize(assets);

  const upload = toBioUpload(result);
  const formData = buildBioFormData(upload, assets);
  return client.uploadBio(formData);
}
