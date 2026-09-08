import type { PressMetadata } from "./types.js";
import type { LifecycleStatus, LifecycleVisibility } from "../types.js";
import { isValidVisibility } from "../types.js";
import type { ValidationIssue } from "../errors.js";
import {
  splitFrontmatter,
  unquote,
  slugify,
  validateSlug,
  validateTag,
} from "../markdown.js";

export {
  slugify,
  validateSlug,
  validateTag,
  extractImageLinks,
  extractVideoLinks,
  extractMarkdownLinks,
  validateLinks,
} from "../markdown.js";
export type { ValidationIssue } from "../errors.js";

export function parseFrontmatter(raw: string): {
  metadata: Partial<PressMetadata>;
  body: string;
  issues: ValidationIssue[];
} {
  const { yaml, body } = splitFrontmatter(raw);
  if (yaml === null) return { metadata: {}, body, issues: [] };
  const parsed = parseSimpleYaml(yaml);
  return { metadata: parsed.metadata, body, issues: parsed.issues };
}

interface ParsedYaml {
  metadata: Partial<PressMetadata>;
  issues: ValidationIssue[];
}

function parseSimpleYaml(yaml: string): ParsedYaml {
  const result: Partial<PressMetadata> = {};
  const issues: ValidationIssue[] = [];
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
        else issues.push({ code: "INVALID_STATUS", params: { value: rawValue } });
        break;
      case "visibility":
        if (isValidVisibility(rawValue)) result.visibility = rawValue;
        else
          issues.push({
            code: "INVALID_VISIBILITY",
            params: { value: rawValue },
          });
        break;
      // `image` is accepted as an alias: the frontmatter reference documented
      // it before the key settled on `cover`.
      case "cover":
      case "image": {
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

  return { metadata: result, issues };
}

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

export interface BuildMetadataInput {
  partial: Partial<PressMetadata>;
  inferredName: string;
  statusFallback?: LifecycleStatus;
  visibilityFallback?: LifecycleVisibility;
  autoDetected?: { cover: string | null };
}

/**
 * Build full press metadata, applying defaults and emitting structured
 * issues for any rule violation. Never throws — the caller chooses how
 * to handle the issue list.
 */
export function buildMetadata(input: BuildMetadataInput): {
  metadata: PressMetadata;
  issues: ValidationIssue[];
} {
  const {
    partial,
    inferredName,
    statusFallback = "published",
    visibilityFallback = "public",
    autoDetected = { cover: null },
  } = input;
  const issues: ValidationIssue[] = [];

  const name = partial.name ?? inferredName;

  let slug: string;
  if (partial.slug !== undefined) {
    slug = slugify(partial.slug);
    issues.push(...validateSlug(slug));
  } else {
    slug = slugify(name);
  }

  const tags = partial.tags ?? [];
  for (const tag of tags) {
    issues.push(...validateTag(tag));
  }

  const metadata: PressMetadata = {
    name,
    slug,
    category: partial.category ?? null,
    status: partial.status ?? statusFallback,
    visibility: partial.visibility ?? visibilityFallback,
    cover: partial.cover ?? autoDetected.cover,
    tags,
    authors: partial.authors ?? [],
  };
  return { metadata, issues };
}
