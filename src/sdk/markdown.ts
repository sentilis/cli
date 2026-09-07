import type { ValidationIssue } from "./errors.js";

// ---------- Shared types ----------

export interface ImageLink {
  alt: string;
  src: string;
}

export interface VideoLink {
  alt: string;
  src: string;
}

export interface MarkdownLink {
  alt: string;
  href: string;
}

// ---------- Frontmatter split ----------

export const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;

export function splitFrontmatter(raw: string): {
  yaml: string | null;
  body: string;
} {
  const match = raw.match(FRONTMATTER_RE);
  if (!match) return { yaml: null, body: raw };
  return {
    yaml: match[1],
    body: raw.slice(match[0].length).replace(/^\r?\n/, ""),
  };
}

export function unquote(s: string): string {
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    return s.slice(1, -1);
  }
  return s;
}

// ---------- Slug & tag validation ----------

const SLUG_FORMAT_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SLUG_MIN_WORDS = 2;
const TAG_FORMAT_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Validate a user-provided slug. Returns an empty array on success or
 * a list of `ValidationIssue`s describing every rule that failed.
 *
 * Rules:
 *  1. Format `[a-z0-9]+(-[a-z0-9]+)*` after normalization.
 *  2. At least three hyphen-separated segments.
 *
 * Inferred slugs (derived from a filename) skip this check.
 */
export function validateSlug(slug: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!SLUG_FORMAT_RE.test(slug)) {
    issues.push({ code: "INVALID_SLUG_FORMAT", params: { slug } });
  }
  const words = slug.split("-");
  if (words.length < SLUG_MIN_WORDS) {
    issues.push({
      code: "INVALID_SLUG_MIN_WORDS",
      params: { slug, min: SLUG_MIN_WORDS, got: words.length },
    });
  }
  return issues;
}

/** Validate a tag. Returns issues; empty array means OK. */
export function validateTag(tag: string): ValidationIssue[] {
  if (tag === "") return [{ code: "INVALID_TAG_EMPTY" }];
  if (!TAG_FORMAT_RE.test(tag)) {
    return [{ code: "INVALID_TAG_FORMAT", params: { tag } }];
  }
  return [];
}

// ---------- Link extraction & validation ----------

const MD_IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/g;
const MD_LINK_RE = /(?<!!)\[([^\]]*)\]\(([^)]+)\)/g;

const VIDEO_EXTENSIONS = new Set([".mp4", ".webm"]);
const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".webp",
]);

const MEDIA_EXTENSIONS = new Set([
  ...IMAGE_EXTENSIONS,
  ...VIDEO_EXTENSIONS,
  ".mp3",
  ".wav",
  ".ogg",
  ".aac",
]);

export function getExtension(filePath: string): string | null {
  const dot = filePath.lastIndexOf(".");
  if (dot === -1) return null;
  return filePath.slice(dot).toLowerCase();
}

function isVideoSrc(src: string): boolean {
  const clean = src.split("?")[0];
  const ext = getExtension(clean);
  return ext !== null && VIDEO_EXTENSIONS.has(ext);
}

function isImageSrc(src: string): boolean {
  const clean = src.split("?")[0];
  const ext = getExtension(clean);
  return ext !== null && IMAGE_EXTENSIONS.has(ext);
}

export function extractImageLinks(content: string): ImageLink[] {
  const images: ImageLink[] = [];
  const re = new RegExp(MD_IMAGE_RE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    const src = match[2];
    if (isImageSrc(src)) {
      images.push({ alt: match[1], src });
    }
  }
  return images;
}

export function extractVideoLinks(content: string): VideoLink[] {
  const videos: VideoLink[] = [];
  const re = new RegExp(MD_IMAGE_RE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    if (isVideoSrc(match[2])) {
      videos.push({ alt: match[1], src: match[2] });
    }
  }
  return videos;
}

export function extractMarkdownLinks(content: string): MarkdownLink[] {
  const links: MarkdownLink[] = [];
  const re = new RegExp(MD_LINK_RE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    const href = match[2];
    if (
      href.startsWith("http://") ||
      href.startsWith("https://") ||
      href.startsWith("#")
    ) {
      continue;
    }
    if (getExtension(href) === ".md") {
      links.push({ alt: match[1], href });
    }
  }
  return links;
}

export interface ValidateLinksOptions {
  /** Reject local `.md` links (product/bio behaviour). */
  rejectLocalMarkdown?: boolean;
}

/**
 * Validate plain (non-image) links in the body.
 * Rejects links to media files (local or remote).
 * Anchors (`#…`) are ignored.
 * Local `.md` links are optionally rejected.
 */
export function validateLinks(
  content: string,
  options: ValidateLinksOptions = {},
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const re = new RegExp(MD_LINK_RE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    const alt = match[1];
    const href = match[2];

    if (href.startsWith("#")) continue;

    if (href.startsWith("http://") || href.startsWith("https://")) {
      const ext = getExtension(href.split("?")[0]);
      if (ext && MEDIA_EXTENSIONS.has(ext)) {
        issues.push({
          code: "LINK_POINTS_TO_MEDIA",
          params: { alt, href },
        });
      }
      continue;
    }

    const ext = getExtension(href);
    if (ext === ".md") {
      if (options.rejectLocalMarkdown) {
        issues.push({
          code: "LINK_POINTS_TO_LOCAL_MD",
          params: { alt, href },
        });
      }
      continue;
    }
    if (ext && MEDIA_EXTENSIONS.has(ext)) {
      issues.push({
        code: "LINK_POINTS_TO_MEDIA",
        params: { alt, href },
      });
    }
  }
  return issues;
}
