import type { GalleryMetadata } from "./types.js";
import type { LifecycleStatus } from "../types.js";
import { VISIBILITY_VALUES, isValidVisibility } from "../types.js";
import type { ValidationIssue } from "../errors.js";
import {
  extractImageLinks,
  slugify,
  splitFrontmatter,
  unquote,
  validateLinks as sharedValidateLinks,
  validateSlug,
  validateTag,
} from "../markdown.js";
import type { GalleryImage } from "./types.js";

export { extractImageLinks };
export type { ValidationIssue } from "../errors.js";

/** Una entrada de galería no tiene hermanas: un `.md` local no resuelve a nada. */
export function validateLinks(content: string): ValidationIssue[] {
  return sharedValidateLinks(content, { rejectLocalMarkdown: true });
}

/**
 * Las obras del cuerpo, en el orden en que están escritas — que es el orden en
 * que se cuelgan. El título entre comillas del markdown es el pie.
 */
export function extractImages(body: string): GalleryImage[] {
  return extractImageLinks(body).map((image) => ({
    src: image.src,
    alt: image.alt,
    caption: image.title && image.title !== "" ? image.title : null,
    width: null,
    height: null,
  }));
}

export function parseFrontmatter(raw: string): {
  metadata: Partial<GalleryMetadata>;
  body: string;
  issues: ValidationIssue[];
} {
  const { yaml, body } = splitFrontmatter(raw);
  if (yaml === null) return { metadata: {}, body, issues: [] };
  const parsed = parseSimpleYaml(yaml);
  return { metadata: parsed.metadata, body, issues: parsed.issues };
}

function isValidStatus(s: string): s is LifecycleStatus {
  return s === "draft" || s === "published" || s === "archived";
}

/** Acepta `tags: uno, dos` y `tags: [uno, dos]`: las dos se escriben solas. */
function parseList(rawValue: string): string[] {
  let value = unquote(rawValue);
  if (value.startsWith("[") && value.endsWith("]")) {
    value = value.slice(1, -1);
  }
  if (value.trim() === "") return [];
  return value
    .split(",")
    .map((item) => unquote(item.trim()))
    .filter((item) => item !== "");
}

/** Un campo de texto de la cartela: vacío o `null` significan "no consta". */
function optional(rawValue: string): string | null {
  const value = unquote(rawValue);
  return value === "" || value === "null" ? null : value;
}

function parseSimpleYaml(yaml: string): {
  metadata: Partial<GalleryMetadata>;
  issues: ValidationIssue[];
} {
  const result: Partial<GalleryMetadata> = {};
  const issues: ValidationIssue[] = [];

  for (const line of yaml.split(/\r?\n/)) {
    const kvMatch = line.match(/^(\w+)\s*:\s*(.*)/);
    if (!kvMatch) continue;
    const key = kvMatch[1].trim();
    const rawValue = kvMatch[2].trim();

    switch (key) {
      case "name":
        result.name = unquote(rawValue);
        break;
      case "slug":
        result.slug = unquote(rawValue);
        break;
      case "year":
        result.year = optional(rawValue);
        break;
      case "medium":
        result.medium = optional(rawValue);
        break;
      case "dimensions":
        result.dimensions = optional(rawValue);
        break;
      case "edition":
        result.edition = optional(rawValue);
        break;
      case "series":
        result.series = optional(rawValue);
        break;
      case "tags":
        result.tags = parseList(rawValue);
        break;
      case "status":
        if (isValidStatus(rawValue)) result.status = rawValue;
        else issues.push({ code: "INVALID_STATUS", params: { value: rawValue } });
        break;
      case "visibility":
        if (isValidVisibility(rawValue)) result.visibility = rawValue;
        else
          issues.push({
            code: "INVALID_VISIBILITY",
            params: {
              value: rawValue,
              allowed: VISIBILITY_VALUES.join(", "),
            },
          });
        break;
      case "cover":
        result.cover = optional(rawValue);
        break;
    }
  }

  return { metadata: result, issues };
}

export interface BuildMetadataInput {
  partial: Partial<GalleryMetadata>;
  inferredName: string;
}

export function buildMetadata(input: BuildMetadataInput): {
  metadata: GalleryMetadata;
  issues: ValidationIssue[];
} {
  const { partial, inferredName } = input;
  const issues: ValidationIssue[] = [];

  const name = partial.name ?? inferredName;

  let slug = "";
  if (partial.slug !== undefined) {
    slug = slugify(partial.slug);
    issues.push(...validateSlug(slug));
  } else {
    slug = slugify(name);
  }

  const tags = partial.tags ?? [];
  for (const tag of tags) issues.push(...validateTag(tag));

  const metadata: GalleryMetadata = {
    name,
    slug,
    year: partial.year ?? null,
    medium: partial.medium ?? null,
    dimensions: partial.dimensions ?? null,
    edition: partial.edition ?? null,
    series: partial.series ?? null,
    tags,
    status: partial.status ?? "published",
    visibility: partial.visibility ?? "public",
    // Sin portada elegida preside la primera del cuerpo, y eso lo resuelve el
    // recorrido, que es quien ha leído las imágenes.
    cover: partial.cover ?? null,
  };
  return { metadata, issues };
}
