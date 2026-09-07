import type { ImageLink } from "../markdown.js";
import type { LifecycleStatus, LifecycleVisibility } from "../types.js";
import type { ValidationIssue } from "../errors.js";

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
  name: string;
  slug: string;
  language: string;
  status: LifecycleStatus;
  visibility: LifecycleVisibility;
  password: string | null;
  role: string | null;
  location: string | null;
  email: string | null;
  phone: string | null;
  social: BioSocialLinks;
  avatar: string | null;
}

export interface BioFile {
  filePath: string;
  content: string;
  metadata: BioMetadata;
  images: ImageLink[];
}

export interface BioCreateResult {
  /** The default-language entry. */
  main: BioFile;
  /** Other language variants in the directory (empty in single-file mode). */
  variants: BioFile[];
  issues: ValidationIssue[];
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
