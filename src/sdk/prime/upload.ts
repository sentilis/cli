import type { PrimeCreateResult, PrimeFile, PrimeUpload } from "./types.js";

/** Quita del `PrimeFile` lo que solo tiene sentido en un sistema de archivos. */
export function toPrimeUpload(
  input: PrimeCreateResult | PrimeFile,
): PrimeUpload {
  const file: PrimeFile = "main" in input ? input.main : input;
  return {
    metadata: file.metadata,
    content: file.content,
    images: file.images,
    videos: file.videos,
  };
}

function basenameOf(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i >= 0 ? p.slice(i + 1) : p;
}

/**
 * Multipart para `POST /api/v1/prime/products`:
 *   - `manifest`: el JSON del `PrimeUpload`
 *   - una parte por asset, con el nombre de campo = la ref original del
 *     markdown (p. ej. `./attachments/cover.png`).
 */
export function buildPrimeFormData(
  upload: PrimeUpload,
  assets: Map<string, Uint8Array>,
): FormData {
  const fd = new FormData();
  fd.append("manifest", JSON.stringify(upload));
  for (const [src, data] of assets) {
    const ab = new ArrayBuffer(data.byteLength);
    new Uint8Array(ab).set(data);
    fd.append(src, new Blob([ab]), basenameOf(src));
  }
  return fd;
}
