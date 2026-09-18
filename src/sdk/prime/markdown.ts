import type { PrimeInterval, PrimeMetadata } from "./types.js";
import { PRIME_INTERVAL_VALUES } from "./types.js";
import type { LifecycleStatus } from "../types.js";
import { CATALOG_VISIBILITY_VALUES, isCatalogVisibility } from "../types.js";
import type { ValidationIssue } from "../errors.js";
import {
  splitFrontmatter,
  unquote,
  slugify,
  validateSlug,
  validateLinks as sharedValidateLinks,
} from "../markdown.js";

export { extractImageLinks, extractVideoLinks } from "../markdown.js";
export type { ValidationIssue } from "../errors.js";
export { PRIME_INTERVAL_VALUES };

/** Un plan no tiene hermanos, así que un enlace `.md` local no resuelve a nada. */
export function validateLinks(content: string): ValidationIssue[] {
  return sharedValidateLinks(content, { rejectLocalMarkdown: true });
}

export function parseFrontmatter(raw: string): {
  metadata: Partial<PrimeMetadata>;
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

function isValidInterval(s: string): s is PrimeInterval {
  return (PRIME_INTERVAL_VALUES as readonly string[]).includes(s);
}

function parseSimpleYaml(yaml: string): {
  metadata: Partial<PrimeMetadata>;
  issues: ValidationIssue[];
} {
  const result: Partial<PrimeMetadata> = {};
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
        if (isCatalogVisibility(rawValue)) result.visibility = rawValue;
        else
          issues.push({
            code: "INVALID_VISIBILITY",
            params: {
              value: rawValue,
              allowed: CATALOG_VISIBILITY_VALUES.join(", "),
            },
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
      case "interval": {
        const value = unquote(rawValue);
        if (isValidInterval(value)) result.interval = value;
        else
          issues.push({
            code: "INVALID_PRIME_INTERVAL",
            params: { value, allowed: PRIME_INTERVAL_VALUES.join(", ") },
          });
        break;
      }
      case "cover": {
        const value = unquote(rawValue);
        result.cover = value === "" || value === "null" ? null : value;
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
  partial: Partial<PrimeMetadata>;
  inferredName: string;
  autoDetected?: { cover: string | null };
}

export function buildMetadata(input: BuildMetadataInput): {
  metadata: PrimeMetadata;
  issues: ValidationIssue[];
} {
  const { partial, inferredName, autoDetected = { cover: null } } = input;
  const issues: ValidationIssue[] = [];

  const name = partial.name ?? inferredName;

  let slug = "";
  if (partial.slug !== undefined) {
    slug = slugify(partial.slug);
    issues.push(...validateSlug(slug));
  } else {
    slug = slugify(name);
  }

  const price = partial.price ?? 0;
  if (price < 0) {
    issues.push({ code: "INVALID_PRICE_NEGATIVE", params: { value: price } });
  } else if (price === 0) {
    // Una suscripción de cero no es una suscripción: es un "seguir". El
    // proveedor la aceptaría y crearía facturas de 0 sin contrapartida.
    issues.push({ code: "PRIME_PRICE_REQUIRED", params: { value: price } });
  }

  // La divisa se exige en cuanto hay un importe válido. Con precio 0 ya habla
  // `PRIME_PRICE_REQUIRED`, y dos errores para lo mismo solo hacen ruido.
  const currency = partial.currency === undefined ? null : partial.currency;
  if (price > 0 && !currency) {
    issues.push({ code: "MISSING_CURRENCY", params: { price } });
  }

  const metadata: PrimeMetadata = {
    name,
    slug,
    category: partial.category ?? null,
    status: partial.status ?? "published",
    visibility: partial.visibility ?? "public",
    price,
    currency,
    interval: partial.interval ?? "month",
    cover: partial.cover ?? autoDetected.cover,
    description: partial.description ?? null,
  };
  return { metadata, issues };
}
