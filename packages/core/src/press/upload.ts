import type {
  PressCreateResult,
  PressEntryUpload,
  PressFile,
  PressUpload,
} from "./types.js";

/**
 * Strip filesystem-specific fields from a `PressFile` to produce
 * the wire-shape sent to the server.
 */
export function toPressEntryUpload(file: PressFile): PressEntryUpload {
  return {
    metadata: file.metadata,
    content: file.content,
    images: file.images,
    videos: file.videos,
    links: file.links,
  };
}

/**
 * Convert a walker result into the upload payload.
 */
export function toPressUpload(result: PressCreateResult): PressUpload {
  return {
    main: toPressEntryUpload(result.main),
    hidden: result.hidden.map(toPressEntryUpload),
  };
}

function basenameOf(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i >= 0 ? p.slice(i + 1) : p;
}

/**
 * Build a multipart `FormData` payload for `POST /openapi/v1/press`.
 *
 * Layout:
 *   - `manifest`: JSON string of the `PressUpload`
 *   - one part per asset, with the field name = the original markdown ref
 *     (e.g. `./attachments/foo.png`). The server keys assets by that name.
 *
 * `assets` should contain every local (non-remote) ref appearing in any
 * entry's `images`, `videos`, or `metadata.image`.
 */
export function buildPressFormData(
  upload: PressUpload,
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
