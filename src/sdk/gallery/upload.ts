import type { GalleryCreateResult, GalleryFile, GalleryUpload } from "./types.js";

/** Quita del `GalleryFile` lo que solo tiene sentido en un sistema de archivos. */
export function toGalleryUpload(
  input: GalleryCreateResult | GalleryFile,
): GalleryUpload {
  const file: GalleryFile = "main" in input ? input.main : input;
  return {
    metadata: file.metadata,
    content: file.content,
    images: file.images,
  };
}

function basenameOf(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i >= 0 ? p.slice(i + 1) : p;
}

/**
 * Multipart para `POST /api/v1/gallery`:
 *   - `manifest`: el JSON del `GalleryUpload`
 *   - una parte por imagen, con el nombre de campo = la ref original del
 *     markdown (p. ej. `./attachments/01.jpg`).
 */
export function buildGalleryFormData(
  upload: GalleryUpload,
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
