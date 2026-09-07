import type {
  PressCreateResult,
  PressEntryUpload,
  PressFile,
  PressUpload,
} from "./types.js";

/** Strip filesystem-specific fields to produce the wire-shape. */
export function toPressEntryUpload(file: PressFile): PressEntryUpload {
  return {
    metadata: file.metadata,
    content: file.content,
    images: file.images,
    videos: file.videos,
    links: file.links,
  };
}

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
 * Build the multipart `FormData` for `POST /openapi/v1/press`.
 *
 * Layout:
 *  - `manifest`: JSON string of the `PressUpload`
 *  - one part per asset, field name = the original markdown ref
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
