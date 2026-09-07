import type { LifecycleStatus, LifecycleVisibility } from "../types.js";
import type { ImageLink, VideoLink } from "../markdown.js";
import type { ValidationIssue } from "../errors.js";

export type { ImageLink, VideoLink };

export type ProductType = "service" | "product" | "digital";

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

export interface ProductFile {
  filePath: string;
  content: string;
  metadata: ProductMetadata;
  images: ImageLink[];
  videos: VideoLink[];
}

export interface ProductCreateResult {
  main: ProductFile;
  issues: ValidationIssue[];
}

/** Wire-shape sent to `POST /openapi/v1/market`. */
export interface ProductUpload {
  metadata: ProductMetadata;
  content: string;
  images: ImageLink[];
  videos: VideoLink[];
}
