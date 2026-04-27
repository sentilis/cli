import type { PressMetadata } from "./types.js";
import type { LifecycleStatus, LifecycleVisibility } from "../types.js";
import {
  splitFrontmatter,
  unquote,
  parseInlineList,
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
 * name, slug, category, status, visibility, tags (list), authors (list).
 */
function parseSimpleYaml(yaml: string): Partial<PressMetadata> {
  const result: Partial<PressMetadata> = {};
  const lines = yaml.split(/\r?\n/);

  let tags: string[] = [];
  let collectingTags = false;
  let authors: string[] = [];
  let collectingAuthors = false;

  for (const line of lines) {
    const listMatch = line.match(/^\s+-\s+"?([^"]*)"?\s*$/);
    if (listMatch && collectingTags) {
      tags.push(listMatch[1].trim());
      continue;
    }
    if (listMatch && collectingAuthors) {
      authors.push(listMatch[1].trim());
      continue;
    }

    const kvMatch = line.match(/^(\w+)\s*:\s*(.*)/);
    if (!kvMatch) continue;

    if (collectingTags) {
      result.tags = tags;
      tags = [];
      collectingTags = false;
    }
    if (collectingAuthors) {
      result.authors = authors;
      authors = [];
      collectingAuthors = false;
    }

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
      case "image": {
        const value = unquote(rawValue);
        result.image = value === "" || value === "null" ? null : value;
        break;
      }
      case "tags":
        collectingTags = true;
        if (rawValue && rawValue !== "") {
          const inline = parseInlineList(rawValue);
          if (inline) {
            result.tags = inline;
            collectingTags = false;
          }
        }
        break;
      case "authors":
        collectingAuthors = true;
        if (rawValue && rawValue !== "") {
          const inline = parseInlineList(rawValue);
          if (inline) {
            result.authors = inline;
            collectingAuthors = false;
          }
        }
        break;
    }
  }

  if (collectingTags && tags.length > 0) result.tags = tags;
  if (collectingAuthors && authors.length > 0) result.authors = authors;

  return result;
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
  autoDetected: { image: string | null } = { image: null },
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
    image: partial.image ?? autoDetected.image,
    tags,
    authors: partial.authors ?? [],
  };
}
