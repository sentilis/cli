import type { LifecycleStatus, LifecycleVisibility } from "../types.js";
import type { ValidationIssue } from "../errors.js";

/**
 * Una imagen de la entrada. `alt` es lo que se lee en voz alta y `caption` el
 * pie que se pinta bajo la obra: dos textos con dos trabajos distintos.
 *
 * Las medidas se rellenan al publicar, leyendo la cabecera del fichero. El
 * recorrido del disco no abre los binarios, así que aquí salen en `null`.
 */
export interface GalleryImage {
  src: string;
  alt: string;
  caption: string | null;
  width: number | null;
  height: number | null;
}

/**
 * La cartela. Salvo el nombre, todo es opcional: una foto suelta se cuelga con
 * un renglón de frontmatter, y quien quiera catalogar rellena el resto.
 */
export interface GalleryMetadata {
  name: string;
  slug: string;
  /** Texto libre: "2024", "2019–2021", "c. 1998". */
  year: string | null;
  /** La técnica: "Óleo sobre lienzo", "Fotografía digital". */
  medium: string | null;
  dimensions: string | null;
  /** La tirada, para fotografía y obra gráfica: "2/25". */
  edition: string | null;
  /** La serie que agrupa la sala. */
  series: string | null;
  tags: string[];
  status: LifecycleStatus;
  visibility: LifecycleVisibility;
  /** Cuál preside la sala. Sin ella, la primera del cuerpo. */
  cover: string | null;
}

export interface GalleryFile {
  filePath: string;
  content: string;
  metadata: GalleryMetadata;
  images: GalleryImage[];
}

export interface GalleryCreateResult {
  main: GalleryFile;
  issues: ValidationIssue[];
}

/** Wire-shape sent to `POST /api/v1/gallery`. */
export interface GalleryUpload {
  metadata: GalleryMetadata;
  content: string;
  images: GalleryImage[];
}

/** Lo que acepta el servidor de una vez. */
export const MAX_GALLERY_IMAGES = 24;
