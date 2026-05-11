import type { PressMetadata } from "./types.js";
import type { LifecycleStatus, LifecycleVisibility } from "../types.js";
import {
  splitFrontmatter,
  unquote,
  slugify,
  validateSlug,
  validateTag,
} from "../markdown.js";

// Re-export shared helpers so press consumers can import them from here
// (keeps existing import sites working without cross-module churn).
export {
  slugify,
  validateSlug,
  validateTag,
  extractImageLinks,
  extractVideoLinks,
  extractMarkdownLinks,
  validateLinks,
} from "../markdown.js";
export type { ValidationError } from "../markdown.js";

/**
 * Parse YAML frontmatter from markdown content.
 * Returns metadata (press-typed) and body.
 */
export function parseFrontmatter(raw: string): {
  metadata: Partial<PressMetadata>;
  body: string;
} {
  const { yaml, body } = splitFrontmatter(raw);
  if (yaml === null) return { metadata: {}, body };
  return { metadata: parseSimpleYaml(yaml), body };
}

/**
 * Minimal YAML parser for press frontmatter:
 * name, slug, category, status, visibility, tags (csv), authors (csv).
 *
 * `tags` and `authors` are comma-separated strings in the markdown file
 * (e.g. `tags: a, b, c`) and surfaced to the rest of the pipeline as arrays.
 */
function parseSimpleYaml(yaml: string): Partial<PressMetadata> {
  const result: Partial<PressMetadata> = {};
  const lines = yaml.split(/\r?\n/);

  for (const line of lines) {
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
      case "category": {
        const value = unquote(rawValue);
        result.category = value === "" || value === "null" ? null : value;
        break;
      }
      case "status":
        if (isValidStatus(rawValue)) result.status = rawValue;
        break;
      case "visibility":
        if (isValidVisibility(rawValue)) result.visibility = rawValue;
        break;
      case "cover": {
        const value = unquote(rawValue);
        result.cover = value === "" || value === "null" ? null : value;
        break;
      }
      case "tags":
        result.tags = parseCsvList(rawValue);
        break;
      case "authors":
        result.authors = parseCsvList(rawValue);
        break;
    }
  }

  return result;
}

/**
 * Split a comma-separated frontmatter value into a trimmed list. Strips
 * surrounding quotes from each item and drops empty entries so trailing
 * commas don't produce ghost values.
 */
function parseCsvList(rawValue: string): string[] {
  const value = unquote(rawValue);
  if (value === "") return [];
  return value
    .split(",")
    .map((item) => unquote(item.trim()))
    .filter((item) => item !== "");
}

function isValidStatus(s: string): s is LifecycleStatus {
  return s === "draft" || s === "published" || s === "archived";
}

function isValidVisibility(s: string): s is LifecycleVisibility {
  return (
    s === "public" ||
    s === "protected" ||
    s === "private" ||
    s === "prime"
  );
}

/**
 * Build full press metadata by applying defaults and validating tags/slug.
 */
export function buildMetadata(
  partial: Partial<PressMetadata>,
  inferredName: string,
  statusFallback: LifecycleStatus = "published",
  visibilityFallback: LifecycleVisibility = "public",
  autoDetected: { cover: string | null } = { cover: null },
): PressMetadata {
  const name = partial.name ?? inferredName;
  let slug: string;
  if (partial.slug !== undefined) {
    slug = slugify(partial.slug);
    validateSlug(slug);
  } else {
    slug = slugify(name);
  }
  const tags = partial.tags ?? [];
  for (const tag of tags) {
    validateTag(tag);
  }
  return {
    name,
    slug,
    category: partial.category ?? null,
    status: partial.status ?? statusFallback,
    visibility: partial.visibility ?? visibilityFallback,
    cover: partial.cover ?? autoDetected.cover,
    tags,
    authors: partial.authors ?? [],
  };
}
