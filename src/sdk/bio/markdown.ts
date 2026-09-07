import type { BioMetadata, BioSocialLinks } from "./types.js";
import type { LifecycleStatus, LifecycleVisibility } from "../types.js";
import type { ValidationIssue } from "../errors.js";
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
export type { ValidationIssue } from "../errors.js";

export function validateLinks(content: string): ValidationIssue[] {
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
  issues: ValidationIssue[];
} {
  const { yaml, body } = splitFrontmatter(raw);
  if (yaml === null) return { metadata: {}, body, issues: [] };
  const parsed = parseSimpleYaml(yaml);
  return { metadata: parsed.metadata, body, issues: parsed.issues };
}

interface ParsedYaml {
  metadata: PartialBioMetadata;
  issues: ValidationIssue[];
}

function parseSimpleYaml(yaml: string): ParsedYaml {
  const result: PartialBioMetadata = {};
  const social: Partial<BioSocialLinks> = {};
  const issues: ValidationIssue[] = [];
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
        else issues.push({ code: "INVALID_STATUS", params: { value } });
        break;
      case "visibility":
        if (isValidVisibility(value)) result.visibility = value;
        else issues.push({ code: "INVALID_VISIBILITY", params: { value } });
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
  return { metadata: result, issues };
}

export interface BuildMetadataInput {
  partial: PartialBioMetadata;
  inferredName: string;
  inferredSlug: string;
  inferredLanguage: string;
  autoDetected?: { avatar: string | null };
  statusFallback?: LifecycleStatus;
  visibilityFallback?: LifecycleVisibility;
  passwordFallback?: string | null;
}

export function buildMetadata(input: BuildMetadataInput): {
  metadata: BioMetadata;
  issues: ValidationIssue[];
} {
  const { partial, inferredName, inferredSlug, inferredLanguage } = input;
  const autoDetected = input.autoDetected ?? { avatar: null };
  const issues: ValidationIssue[] = [];

  const name = partial.name ?? inferredName;

  let slug: string;
  if (partial.slug !== undefined) {
    slug = slugify(partial.slug);
    issues.push(...validateSlug(slug));
  } else {
    slug = slugify(inferredSlug);
  }

  const language = (partial.language ?? inferredLanguage).toLowerCase();
  if (!/^[a-z]{2,8}(-[a-z0-9]{2,8})?$/.test(language)) {
    issues.push({ code: "INVALID_LANGUAGE", params: { value: language } });
  }

  const status: LifecycleStatus =
    partial.status ?? input.statusFallback ?? "published";
  const visibility: LifecycleVisibility =
    partial.visibility ?? input.visibilityFallback ?? "public";
  const passwordExplicit = Object.prototype.hasOwnProperty.call(
    partial,
    "password",
  );
  const password = passwordExplicit
    ? (partial.password ?? null)
    : (input.passwordFallback ?? null);

  if (visibility === "protected" && !password) {
    issues.push({ code: "PROTECTED_NEEDS_PASSWORD" });
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
      issues.push({
        code: "INVALID_SOCIAL_URL",
        params: { key, value },
      });
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

  return { metadata, issues };
}
