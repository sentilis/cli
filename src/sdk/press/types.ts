import type {
  ImageLink,
  VideoLink,
  MarkdownLink,
} from "../markdown.js";
import type { LifecycleStatus, LifecycleVisibility } from "../types.js";
import type { ValidationIssue } from "../errors.js";

export type { ImageLink, VideoLink, MarkdownLink };

export interface PressMetadata {
  name: string;
  slug: string;
  category: string | null;
  status: LifecycleStatus;
  visibility: LifecycleVisibility;
  cover: string | null;
  tags: string[];
  authors: string[];
}

/**
 * A markdown link to another press entry within the same upload batch.
 * The `targetSlug` is resolved by the walker before upload so the server
 * can match links without filesystem access.
 */
export interface PressLinkRef {
  alt: string;
  href: string;
  targetSlug: string;
}

export interface PressFile {
  /** Resolved (adapter-native) file path. */
  filePath: string;
  /** Markdown content (without frontmatter). */
  content: string;
  /** Parsed metadata from frontmatter or inferred. */
  metadata: PressMetadata;
  /** Image links found in the content. */
  images: ImageLink[];
  /** Video links found in the content. */
  videos: VideoLink[];
  /** Local markdown links found in the content (with resolved target slugs). */
  links: PressLinkRef[];
}

export interface PressCreateResult {
  main: PressFile;
  /** Sibling files (hidden) when input is a directory. */
  hidden: PressFile[];
  /** Validation issues collected in collect mode (empty otherwise). */
  issues: ValidationIssue[];
}

/** Wire-shape for one entry in the upload payload (no filesystem fields). */
export interface PressEntryUpload {
  metadata: PressMetadata;
  content: string;
  images: ImageLink[];
  videos: VideoLink[];
  links: PressLinkRef[];
}

/**
 * Structured payload sent by every client to `POST /openapi/v1/press`.
 * Sent as the `manifest` JSON field of a multipart request, alongside
 * one binary part per asset.
 */
export interface PressUpload {
  main: PressEntryUpload;
  hidden: PressEntryUpload[];
}
