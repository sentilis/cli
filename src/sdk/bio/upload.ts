import type {
  BioCreateResult,
  BioEntryUpload,
  BioFile,
  BioUpload,
} from "./types.js";

export function toBioEntryUpload(file: BioFile): BioEntryUpload {
  return {
    metadata: file.metadata,
    content: file.content,
    images: file.images,
  };
}

export function toBioUpload(result: BioCreateResult): BioUpload {
  return {
    main: toBioEntryUpload(result.main),
    variants: result.variants.map(toBioEntryUpload),
  };
}

function basenameOf(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i >= 0 ? p.slice(i + 1) : p;
}

/**
 * Build a multipart `FormData` payload for `POST /api/v1/bio`.
 *
 * Layout:
 *   - `manifest`: JSON string of the `BioUpload`
 *   - one part per asset, field name = the original markdown ref
 *     (e.g. `./attachments/avatar.jpg`).
 *
 * `assets` should contain every local (non-remote) ref appearing in any
 * variant's `images` and the shared `metadata.avatar`.
 */
export function buildBioFormData(
  upload: BioUpload,
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
