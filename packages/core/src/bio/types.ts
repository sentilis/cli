import type { ImageLink } from "../markdown.js";
import type { LifecycleStatus, LifecycleVisibility } from "../types.js";

export type { ImageLink };

export interface BioSocialLinks {
  website: string | null;
  linkedin: string | null;
  github: string | null;
  x: string | null;
  instagram: string | null;
  youtube: string | null;
  facebook: string | null;
  tiktok: string | null;
}

export interface BioMetadata {
  /** Display name (person or business). */
  name: string;
  /** Slug derived from directory or filename basename, may be overridden via frontmatter. */
  slug: string;
  /** ISO language code for this variant. */
  language: string;
  status: LifecycleStatus;
  visibility: LifecycleVisibility;
  /** Required when visibility=protected. */
  password: string | null;
  role: string | null;
  location: string | null;
  email: string | null;
  phone: string | null;
  social: BioSocialLinks;
  /** Avatar — local asset path (./attachments/...) or remote URL. */
  avatar: string | null;
}

export interface BioFile {
  filePath: string;
  content: string;
  metadata: BioMetadata;
  images: ImageLink[];
}

export interface BioValidationError {
  file: string;
  message: string;
}

export interface BioCreateResult {
  /** The default-language entry. */
  main: BioFile;
  /** Other language variants in the directory (empty in single-file mode). */
  variants: BioFile[];
  errors: BioValidationError[];
}

export interface BioEntryUpload {
  metadata: BioMetadata;
  content: string;
  images: ImageLink[];
}

export interface BioUpload {
  main: BioEntryUpload;
  variants: BioEntryUpload[];
}
