import type {
  ImageLink,
  VideoLink,
  MarkdownLink,
} from "../markdown.js";

export type { ImageLink, VideoLink, MarkdownLink };

import type { LifecycleStatus, LifecycleVisibility } from "../types.js";

export interface PressMetadata {
  name: string;
  slug: string;
  category: string | null;
  status: LifecycleStatus;
  visibility: LifecycleVisibility;
  image: string | null;
  tags: string[];
  authors: string[];
}

/**
 * A markdown link to another press entry within the same upload batch.
 * The `targetSlug` is resolved by the walker (CLI / Obsidian / web)
 * before upload so the server can match links without filesystem access.
 */
export interface PressLinkRef {
  alt: string;
  href: string;
  targetSlug: string;
}

export interface PressFile {
  /** Resolved file path */
  filePath: string;
  /** Markdown content (without frontmatter) */
  content: string;
  /** Parsed metadata from frontmatter or inferred */
  metadata: PressMetadata;
  /** Image links found in the content */
  images: ImageLink[];
  /** Video links found in the content */
  videos: VideoLink[];
  /** Local markdown links found in the content (with resolved target slugs) */
  links: PressLinkRef[];
}

export interface PressValidationError {
  /** File the error belongs to */
  file: string;
  /** Human-readable error message */
  message: string;
}

export interface PressCreateResult {
  /** Main press file */
  main: PressFile;
  /** Additional files (hidden) when input is a directory */
  hidden: PressFile[];
  /** Validation errors collected in collect mode (empty otherwise) */
  errors: PressValidationError[];
}

/**
 * A press entry in the upload payload. Same shape as `PressFile`
 * minus filesystem-specific fields (`filePath`).
 */
export interface PressEntryUpload {
  metadata: PressMetadata;
  content: string;
  images: ImageLink[];
  videos: VideoLink[];
  links: PressLinkRef[];
}

/**
 * Structured payload sent by every client (CLI, Obsidian, web)
 * to `POST /openapi/v1/press`. Sent as the `manifest` JSON field
 * of a multipart request, alongside one binary part per asset.
 */
export interface PressUpload {
  main: PressEntryUpload;
  hidden: PressEntryUpload[];
}
