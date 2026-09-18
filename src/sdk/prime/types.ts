import type { LifecycleStatus, LifecycleVisibility } from "../types.js";
import type { ImageLink, VideoLink } from "../markdown.js";
import type { ValidationIssue } from "../errors.js";

export type { ImageLink, VideoLink };

/**
 * Cada cuánto se cobra. `year` se acepta desde el primer día aunque la
 * plataforma solo procese `month`: abrirlo después costaría repetir la
 * coreografía de publicar SDK, desplegar y actualizar el plugin por un enum de
 * dos valores.
 */
export const PRIME_INTERVAL_VALUES = ["month", "year"] as const;
export type PrimeInterval = (typeof PRIME_INTERVAL_VALUES)[number];

/**
 * Lo que **no** hay aquí, y que quien venga de Market buscará: `kind` (el
 * cumplimiento de un plan es siempre el mismo) y `attachment` (un plan no
 * entrega un archivo, entrega acceso).
 */
export interface PrimeMetadata {
  name: string;
  slug: string;
  category: string | null;
  status: LifecycleStatus;
  visibility: LifecycleVisibility;
  price: number;
  currency: string | null;
  interval: PrimeInterval;
  cover: string | null;
  description: string | null;
}

export interface PrimeFile {
  filePath: string;
  content: string;
  metadata: PrimeMetadata;
  images: ImageLink[];
  videos: VideoLink[];
}

export interface PrimeCreateResult {
  main: PrimeFile;
  issues: ValidationIssue[];
}

/** Wire-shape sent to `POST /api/v1/prime/products`. */
export interface PrimeUpload {
  metadata: PrimeMetadata;
  content: string;
  images: ImageLink[];
  videos: VideoLink[];
}
