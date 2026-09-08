import type {
  ProductMetadata,
  ProductType,
} from "./types.js";
import type { LifecycleStatus, LifecycleVisibility } from "../types.js";
import { isValidVisibility } from "../types.js";
import type { ValidationIssue } from "../errors.js";
import {
  splitFrontmatter,
  unquote,
  slugify,
  validateSlug,
  validateLinks as sharedValidateLinks,
} from "../markdown.js";

export {
  extractImageLinks,
  extractVideoLinks,
} from "../markdown.js";
export type { ValidationIssue } from "../errors.js";

/**
 * Market-specific link validation. Products have no sibling markdown so
 * local `.md` references are rejected.
 */
export function validateLinks(content: string): ValidationIssue[] {
  return sharedValidateLinks(content, { rejectLocalMarkdown: true });
}

export function parseFrontmatter(raw: string): {
  metadata: Partial<ProductMetadata>;
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

function isValidType(s: string): s is ProductType {
  return s === "service" || s === "product" || s === "digital";
}

interface ParsedYaml {
  metadata: Partial<ProductMetadata>;
  issues: ValidationIssue[];
}

function parseSimpleYaml(yaml: string): ParsedYaml {
  const result: Partial<ProductMetadata> = {};
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
      case "kind": {
        const value = unquote(rawValue);
        if (isValidType(value)) result.kind = value;
        else issues.push({ code: "INVALID_PRODUCT_KIND", params: { value } });
        break;
      }
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
      case "price": {
        const raw = unquote(rawValue);
        const num = Number(raw);
        if (Number.isNaN(num)) {
          issues.push({ code: "INVALID_PRICE_VALUE", params: { value: raw } });
        } else {
          result.price = num;
        }
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

  return { metadata: result, issues };
}

export interface BuildMetadataInput {
  partial: Partial<ProductMetadata>;
  inferredName: string;
  autoDetected?: { image: string | null; attachment: string | null };
}

export function buildMetadata(input: BuildMetadataInput): {
  metadata: ProductMetadata;
  issues: ValidationIssue[];
} {
  const {
    partial,
    inferredName,
    autoDetected = { image: null, attachment: null },
  } = input;
  const issues: ValidationIssue[] = [];

  const name = partial.name ?? inferredName;

  let slug = "";
  if (partial.slug !== undefined) {
    slug = slugify(partial.slug);
    issues.push(...validateSlug(slug));
  } else {
    slug = slugify(name);
  }

  const kind: ProductType = partial.kind ?? "service";
  const price = partial.price ?? 0;
  if (price < 0) {
    issues.push({ code: "INVALID_PRICE_NEGATIVE", params: { value: price } });
  }
  const currency = partial.currency === undefined ? null : partial.currency;
  if (price > 0 && !currency) {
    issues.push({ code: "MISSING_CURRENCY", params: { price } });
  }

  const image = partial.image ?? autoDetected.image;
  const attachment = partial.attachment ?? autoDetected.attachment;

  if (kind === "digital" && !attachment) {
    issues.push({
      code: "DIGITAL_NEEDS_ATTACHMENT",
      params: { attachmentsDir: "attachments" },
    });
  }

  const pressUrl = partial.pressUrl ?? null;
  if (pressUrl && !/^https?:\/\//.test(pressUrl)) {
    issues.push({ code: "INVALID_PRESS_URL", params: { value: pressUrl } });
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
  return { metadata, issues };
}
