import type { LifecycleStatus, LifecycleVisibility } from "../types.js";

export type ProductType = "service" | "product" | "subscription" | "digital";

export interface ProductMetadata {
  name: string;
  slug: string;
  kind: ProductType;
  category: string | null;
  status: LifecycleStatus;
  visibility: LifecycleVisibility;
  price: number;
  currency: string | null;
  image: string | null;
  attachment: string | null;
  pressUrl: string | null;
  description: string | null;
}

import type { ImageLink, VideoLink } from "../markdown.js";
export type { ImageLink, VideoLink };

export interface ProductFile {
  /** Resolved file path */
  filePath: string;
  /** Markdown content (without frontmatter) */
  content: string;
  /** Parsed metadata (merged with auto-detected defaults) */
  metadata: ProductMetadata;
  /** Image links found in the content */
  images: ImageLink[];
  /** Video links found in the content */
  videos: VideoLink[];
}

export interface ProductValidationError {
  /** File the error belongs to */
  file: string;
  /** Human-readable error message */
  message: string;
}

export interface ProductCreateResult {
  /** Main product file */
  main: ProductFile;
  /** Validation errors collected in collect mode (empty otherwise) */
  errors: ProductValidationError[];
}

/**
 * Structured payload sent by every client (CLI, Obsidian, web)
 * to `POST /openapi/v1/market`. Same shape as `ProductFile` minus
 * filesystem-specific fields (`filePath`).
 */
export interface ProductUpload {
  metadata: ProductMetadata;
  content: string;
  images: ImageLink[];
  videos: VideoLink[];
}
