import type {
  ProductMetadata,
  ProductType,
} from "./types.js";
import type { LifecycleStatus, LifecycleVisibility } from "../types.js";
import {
  splitFrontmatter,
  unquote,
  slugify,
  validateSlug,
  validateLinks as sharedValidateLinks,
} from "../markdown.js";

// Re-export shared helpers so market consumers import from here.
export {
  extractImageLinks,
  extractVideoLinks,
} from "../markdown.js";
export type { ValidationError } from "../markdown.js";

/**
 * Product-specific wrapper around shared validateLinks. Rejects local
 * `.md` references since products have no parent/child relationship.
 */
export function validateLinks(content: string) {
  return sharedValidateLinks(content, { rejectLocalMarkdown: true });
}

/**
 * Parse YAML frontmatter from markdown content.
 * Returns metadata (product-typed) and body.
 */
export function parseFrontmatter(raw: string): {
  metadata: Partial<ProductMetadata>;
  body: string;
} {
  const { yaml, body } = splitFrontmatter(raw);
  if (yaml === null) return { metadata: {}, body };
  return { metadata: parseSimpleYaml(yaml), body };
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

function isValidType(s: string): s is ProductType {
  return (
    s === "service" ||
    s === "product" ||
    s === "subscription" ||
    s === "digital"
  );
}

/**
 * Minimal YAML parser for product frontmatter. Supported keys:
 * name, slug, kind, category, status, visibility, price, currency, image,
 * attachment, pressUrl, description.
 */
function parseSimpleYaml(yaml: string): Partial<ProductMetadata> {
  const result: Partial<ProductMetadata> = {};
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
      case "kind": {
        const value = unquote(rawValue);
        if (isValidType(value)) result.kind = value;
        else
          throw new Error(
            `Invalid product kind "${value}": must be one of service, product, subscription, digital.`,
          );
        break;
      }
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
      case "price": {
        const num = Number(unquote(rawValue));
        if (Number.isNaN(num)) {
          throw new Error(`Invalid price "${rawValue}": must be a number.`);
        }
        result.price = num;
        break;
      }
      case "currency": {
        const value = unquote(rawValue);
        result.currency = value === "" || value === "null" ? null : value;
        break;
      }
      case "image": {
        const value = unquote(rawValue);
        result.image = value === "" || value === "null" ? null : value;
        break;
      }
      case "attachment": {
        const value = unquote(rawValue);
        result.attachment = value === "" || value === "null" ? null : value;
        break;
      }
      case "pressUrl": {
        const value = unquote(rawValue);
        result.pressUrl = value === "" || value === "null" ? null : value;
        break;
      }
      case "description": {
        const value = unquote(rawValue);
        result.description = value === "" ? null : value;
        break;
      }
    }
  }

  return result;
}

/**
 * Build full metadata by applying defaults and validating business rules.
 * Returns the metadata (best-effort) plus a list of validation errors so
 * callers in dry-run mode can report every issue at once.
 */
export function buildMetadata(
  partial: Partial<ProductMetadata>,
  inferredName: string,
  autoDetected: { image: string | null; attachment: string | null } = {
    image: null,
    attachment: null,
  },
): { metadata: ProductMetadata; errors: string[] } {
  const errors: string[] = [];
  const name = partial.name ?? inferredName;

  let slug = "";
  if (partial.slug !== undefined) {
    slug = slugify(partial.slug);
    try {
      validateSlug(slug);
    } catch (e) {
      errors.push((e as Error).message);
    }
  } else {
    slug = slugify(name);
  }

  const kind: ProductType = partial.kind ?? "service";
  const price = partial.price ?? 0;
  if (price < 0) {
    errors.push(`Invalid price ${price}: must be ≥ 0.`);
  }
  const currency =
    partial.currency === undefined ? null : partial.currency;
  if (price > 0 && !currency) {
    errors.push(
      `Product has price ${price} but no currency. Set "currency" in the frontmatter (e.g. USD).`,
    );
  }

  const image = partial.image ?? autoDetected.image;
  const attachment = partial.attachment ?? autoDetected.attachment;

  if (kind === "digital" && !attachment) {
    errors.push(
      `Product of kind "digital" requires an attachment. Add an "attachment" field in the frontmatter or drop a file at ./attachments/attachment.zip.`,
    );
  }

  const pressUrl = partial.pressUrl ?? null;
  if (pressUrl && !/^https?:\/\//.test(pressUrl)) {
    errors.push(
      `Invalid pressUrl "${pressUrl}": must be an absolute http(s):// URL.`,
    );
  }

  const metadata: ProductMetadata = {
    name,
    slug,
    kind,
    category: partial.category ?? null,
    status: partial.status ?? "published",
    visibility: partial.visibility ?? "public",
    price,
    currency,
    image,
    attachment,
    pressUrl,
    description: partial.description ?? null,
  };
  return { metadata, errors };
}
