import type { BioMetadata, BioSocialLinks } from "./types.js";
import type { LifecycleStatus, LifecycleVisibility } from "../types.js";
import {
  splitFrontmatter,
  unquote,
  slugify,
  validateSlug,
  validateLinks as sharedValidateLinks,
} from "../markdown.js";

export {
  slugify,
  extractImageLinks,
} from "../markdown.js";
export type { ValidationError } from "../markdown.js";

/**
 * Bio-specific wrapper around shared validateLinks. Local `.md` references
 * are not allowed (a Bio is a single resume, not a knowledge graph).
 */
export function validateLinks(content: string) {
  return sharedValidateLinks(content, { rejectLocalMarkdown: true });
}

const SOCIAL_KEYS = [
  "website",
  "linkedin",
  "github",
  "x",
  "instagram",
  "youtube",
  "facebook",
  "tiktok",
] as const;

type SocialKey = (typeof SOCIAL_KEYS)[number];

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

function emptyToNull(value: string): string | null {
  const v = value.trim();
  if (v === "" || v === "null") return null;
  return v;
}

export interface PartialBioMetadata {
  name?: string;
  slug?: string;
  language?: string;
  status?: LifecycleStatus;
  visibility?: LifecycleVisibility;
  password?: string | null;
  role?: string | null;
  location?: string | null;
  email?: string | null;
  phone?: string | null;
  avatar?: string | null;
  social?: Partial<BioSocialLinks>;
}

export function parseFrontmatter(raw: string): {
  metadata: PartialBioMetadata;
  body: string;
} {
  const { yaml, body } = splitFrontmatter(raw);
  if (yaml === null) return { metadata: {}, body };
  return { metadata: parseSimpleYaml(yaml), body };
}

function parseSimpleYaml(yaml: string): PartialBioMetadata {
  const result: PartialBioMetadata = {};
  const social: Partial<BioSocialLinks> = {};
  const lines = yaml.split(/\r?\n/);

  for (const line of lines) {
    const kvMatch = line.match(/^(\w+)\s*:\s*(.*)/);
    if (!kvMatch) continue;
    const key = kvMatch[1].trim();
    const rawValue = kvMatch[2].trim();
    const value = unquote(rawValue);

    switch (key) {
      case "name":
        result.name = value;
        break;
      case "slug":
        result.slug = value;
        break;
      case "language":
        result.language = value.toLowerCase();
        break;
      case "status":
        if (isValidStatus(value)) result.status = value;
        else
          throw new Error(
            `Invalid status "${value}": must be one of draft, published, archived.`,
          );
        break;
      case "visibility":
        if (isValidVisibility(value)) result.visibility = value;
        else
          throw new Error(
            `Invalid visibility "${value}": must be one of public, protected, private, prime.`,
          );
        break;
      case "password":
        result.password = emptyToNull(value);
        break;
      case "role":
        result.role = emptyToNull(value);
        break;
      case "location":
        result.location = emptyToNull(value);
        break;
      case "email":
        result.email = emptyToNull(value);
        break;
      case "phone":
        result.phone = emptyToNull(value);
        break;
      case "avatar":
      case "image":
        result.avatar = emptyToNull(value);
        break;
      default:
        if ((SOCIAL_KEYS as readonly string[]).includes(key)) {
          social[key as SocialKey] = emptyToNull(value);
        }
        break;
    }
  }

  if (Object.keys(social).length > 0) result.social = social;
  return result;
}

export interface BuildMetadataInput {
  partial: PartialBioMetadata;
  inferredName: string;
  inferredSlug: string;
  inferredLanguage: string;
  autoDetected?: { avatar: string | null };
  /**
   * Fallbacks applied only when the corresponding key is absent from
   * `partial` (i.e. the frontmatter didn't declare it). Used so language
   * variants can inherit lifecycle fields from the main bio when not
   * explicitly overridden.
   */
  statusFallback?: LifecycleStatus;
  visibilityFallback?: LifecycleVisibility;
  passwordFallback?: string | null;
}

export function buildMetadata(input: BuildMetadataInput): {
  metadata: BioMetadata;
  errors: string[];
} {
  const { partial, inferredName, inferredSlug, inferredLanguage } = input;
  const autoDetected = input.autoDetected ?? { avatar: null };
  const errors: string[] = [];

  const name = partial.name ?? inferredName;

  let slug: string;
  if (partial.slug !== undefined) {
    slug = slugify(partial.slug);
    try {
      validateSlug(slug);
    } catch (e) {
      errors.push((e as Error).message);
    }
  } else {
    slug = slugify(inferredSlug);
  }

  const language = (partial.language ?? inferredLanguage).toLowerCase();
  if (!/^[a-z]{2,8}(-[a-z0-9]{2,8})?$/.test(language)) {
    errors.push(
      `Invalid language "${language}": must be a short ISO code (e.g. "en", "es", "pt-br").`,
    );
  }

  const status: LifecycleStatus =
    partial.status ?? input.statusFallback ?? "published";
  const visibility: LifecycleVisibility =
    partial.visibility ?? input.visibilityFallback ?? "public";
  // `password` may be explicitly null, so use hasOwn-style check to detect presence.
  const passwordExplicit = Object.prototype.hasOwnProperty.call(
    partial,
    "password",
  );
  const password = passwordExplicit
    ? (partial.password ?? null)
    : (input.passwordFallback ?? null);

  if (visibility === "protected" && !password) {
    errors.push(
      `Bio with visibility=protected requires a "password" field in the frontmatter.`,
    );
  }

  const social: BioSocialLinks = {
    website: partial.social?.website ?? null,
    linkedin: partial.social?.linkedin ?? null,
    github: partial.social?.github ?? null,
    x: partial.social?.x ?? null,
    instagram: partial.social?.instagram ?? null,
    youtube: partial.social?.youtube ?? null,
    facebook: partial.social?.facebook ?? null,
    tiktok: partial.social?.tiktok ?? null,
  };

  for (const [key, value] of Object.entries(social)) {
    if (value && !/^https?:\/\//.test(value)) {
      errors.push(
        `Invalid ${key} URL "${value}": must start with http:// or https://.`,
      );
    }
  }

  const metadata: BioMetadata = {
    name,
    slug,
    language,
    status,
    visibility,
    password,
    role: partial.role ?? null,
    location: partial.location ?? null,
    email: partial.email ?? null,
    phone: partial.phone ?? null,
    social,
    avatar: partial.avatar ?? autoDetected.avatar,
  };

  return { metadata, errors };
}
