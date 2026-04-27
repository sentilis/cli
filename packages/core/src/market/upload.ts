import type {
  ProductCreateResult,
  ProductFile,
  ProductUpload,
} from "./types.js";

/**
 * Strip filesystem-specific fields from a `ProductFile`.
 */
export function toProductUpload(input: ProductCreateResult | ProductFile): ProductUpload {
  const file: ProductFile = "main" in input ? input.main : input;
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
 * Build a multipart `FormData` payload for `POST /openapi/v1/market`.
 *
 * Layout:
 *   - `manifest`: JSON string of the `ProductUpload`
 *   - one part per asset, field name = the original markdown ref
 *     (e.g. `./attachments/foo.png`).
 *
 * `assets` must include every local (non-remote) ref from
 * `metadata.image`, `metadata.attachment`, `images`, and `videos`.
 */
export function buildProductFormData(
  upload: ProductUpload,
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
