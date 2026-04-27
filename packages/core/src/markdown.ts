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

export interface ValidationError {
  message: string;
}

// ---------- Frontmatter split ----------

export const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;

/**
 * Low-level frontmatter split. Returns the raw YAML block and the body.
 * Callers parse the YAML into module-specific metadata themselves.
 */
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

/**
 * Strip surrounding single or double quotes from a YAML scalar.
 */
export function unquote(s: string): string {
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    return s.slice(1, -1);
  }
  return s;
}

/**
 * Parse an inline YAML list: `[a, b]`, `["a", "b"]`, or `[]`.
 * Returns null if the value is not in inline list form.
 */
export function parseInlineList(value: string): string[] | null {
  const match = value.match(/^\[([^\]]*)\]$/);
  if (!match) return null;
  if (match[1].trim() === "") return [];
  return match[1].split(",").map((t) => unquote(t.trim()));
}

// ---------- Slug & tag validation ----------

const SLUG_FORMAT_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SLUG_MIN_WORDS = 3;
const TAG_FORMAT_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Normalize a string into a URL-safe slug: lowercase, ASCII,
 * non-alphanumeric runs replaced with "-", trimmed.
 */
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
 * Validate a user-provided slug. Rules:
 *   1. Format `[a-z0-9]+(-[a-z0-9]+)*` after normalization.
 *   2. At least SLUG_MIN_WORDS hyphen-separated segments.
 * Inferred slugs (derived from the filename) skip this check.
 */
export function validateSlug(slug: string): void {
  if (!SLUG_FORMAT_RE.test(slug)) {
    throw new Error(
      `Invalid slug "${slug}": must contain only lowercase letters, digits and single hyphens.`,
    );
  }
  const words = slug.split("-");
  if (words.length < SLUG_MIN_WORDS) {
    throw new Error(
      `Invalid slug "${slug}": must contain at least ${SLUG_MIN_WORDS} words separated by hyphens (got ${words.length}).`,
    );
  }
}

/**
 * Validate a tag. Lowercase ASCII letters/digits with single hyphens.
 * No spaces, diacritics, uppercase, or symbols.
 */
export function validateTag(tag: string): void {
  if (tag === "") {
    throw new Error(`Invalid tag: tag cannot be empty.`);
  }
  if (!TAG_FORMAT_RE.test(tag)) {
    throw new Error(
      `Invalid tag "${tag}": must contain only lowercase letters, digits and single hyphens (no spaces, accents, or uppercase).`,
    );
  }
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
  // common audio
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

/**
 * Extract all markdown image references from content (excludes videos).
 */
export function extractImageLinks(content: string): ImageLink[] {
  const images: ImageLink[] = [];
  let match: RegExpExecArray | null;
  while ((match = MD_IMAGE_RE.exec(content)) !== null) {
    const src = match[2];
    if (isImageSrc(src)) {
      images.push({ alt: match[1], src });
    }
  }
  return images;
}


/**
 * Extract all markdown video references (![alt](file.mp4|.webm)) from content.
 */
export function extractVideoLinks(content: string): VideoLink[] {
  const videos: VideoLink[] = [];
  const re = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    if (isVideoSrc(match[2])) {
      videos.push({ alt: match[1], src: match[2] });
    }
  }
  return videos;
}

/**
 * Extract non-image links that point to local markdown files.
 */
export function extractMarkdownLinks(content: string): MarkdownLink[] {
  const links: MarkdownLink[] = [];
  const re = /(?<!!)\[([^\]]*)\]\(([^)]+)\)/g;
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
  /**
   * When true, local `.md` links are reported as errors (used by product
   * content, which doesn't support sibling markdown entries).
   */
  rejectLocalMarkdown?: boolean;
}

/**
 * Validate plain (non-image) links. Rejects links that point to media
 * files, whether remote or local. Anchors are skipped. Local `.md` links
 * are optionally rejected based on `options.rejectLocalMarkdown`.
 */
export function validateLinks(
  content: string,
  options: ValidateLinksOptions = {},
): ValidationError[] {
  const errors: ValidationError[] = [];
  let match: RegExpExecArray | null;
  while ((match = MD_LINK_RE.exec(content)) !== null) {
    const alt = match[1];
    const href = match[2];

    if (href.startsWith("#")) continue;

    if (href.startsWith("http://") || href.startsWith("https://")) {
      const ext = getExtension(href.split("?")[0]);
      if (ext && MEDIA_EXTENSIONS.has(ext)) {
        errors.push({
          message: `Link "${alt}" points to a media file (${href}). Only web page links are allowed.`,
        });
      }
      continue;
    }

    const ext = getExtension(href);
    if (ext === ".md") {
      if (options.rejectLocalMarkdown) {
        errors.push({
          message: `Link "${alt}" points to a local markdown file (${href}). Sibling markdown entries are not supported here.`,
        });
      }
      continue;
    }
    if (ext && MEDIA_EXTENSIONS.has(ext)) {
      errors.push({
        message: `Link "${alt}" points to a media file (${href}). Only web page links are allowed.`,
      });
    }
  }
  return errors;
}
