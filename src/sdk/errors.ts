/**
 * Stable, machine-readable codes for every validation / structural error
 * the SDK can surface. Clients (CLI, Obsidian, web) translate these into
 * localized strings; the SDK only emits codes and parameter maps.
 */
export type ValidationCode =
  // ---- Structural ----
  | "PATH_NOT_EXIST"
  | "UNSUPPORTED_PATH_TYPE"
  | "NOT_MARKDOWN"
  | "NO_MARKDOWN_FILES"
  | "MULTIPLE_NO_INDEX"
  | "MARKET_MULTIPLE_FILES"
  // ---- Asset / path security ----
  | "REF_OUTSIDE_ROOT"
  | "REF_OUTSIDE_ROOT_SYMLINK"
  | "REF_OUTSIDE_ATTACHMENTS"
  | "REF_OUTSIDE_ATTACHMENTS_SYMLINK"
  | "REF_SINGLE_FILE_NO_ASSETS"
  | "ASSET_NOT_FOUND"
  | "LINK_NOT_TOP_LEVEL"
  | "LINK_NOT_FOUND"
  // ---- Auto-detection ----
  | "MULTIPLE_COVER_CANDIDATES"
  | "MULTIPLE_AVATAR_CANDIDATES"
  // ---- Slug / tag ----
  | "INVALID_SLUG_FORMAT"
  | "INVALID_SLUG_MIN_WORDS"
  | "INVALID_TAG_EMPTY"
  | "INVALID_TAG_FORMAT"
  // ---- Lifecycle ----
  | "INVALID_STATUS"
  | "INVALID_VISIBILITY"
  // ---- Links in body ----
  | "LINK_POINTS_TO_MEDIA"
  | "LINK_POINTS_TO_LOCAL_MD"
  // ---- Product ----
  | "INVALID_PRODUCT_KIND"
  | "INVALID_PRICE_VALUE"
  | "INVALID_PRICE_NEGATIVE"
  | "MISSING_CURRENCY"
  | "DIGITAL_NEEDS_ATTACHMENT"
  | "PRODUCT_FIELD_MUST_BE_LOCAL"
  // ---- Bio ----
  | "INVALID_LANGUAGE"
  | "INVALID_SOCIAL_URL"
  // ---- Upload ----
  | "UPLOAD_TOO_LARGE";

export type IssueParams = Record<string, string | number>;

/**
 * Structured, translation-friendly diagnostic emitted by every validator
 * and walker in the SDK.
 *
 * Callers either:
 *   - format `code + params` themselves (recommended for localized UIs), or
 *   - use {@link formatIssue} for an English fallback.
 */
export interface ValidationIssue {
  code: ValidationCode;
  params?: IssueParams;
  /** Source file path (when known). Walker passes; pure validators omit. */
  file?: string;
}

/**
 * English fallback formatter. Mirrors the prose used by the previous
 * throw-based API so existing logs stay readable when no translator is
 * wired in.
 */
export function formatIssue(issue: ValidationIssue): string {
  const p = issue.params ?? {};
  switch (issue.code) {
    case "PATH_NOT_EXIST":
      return `Path does not exist: ${p.path}`;
    case "UNSUPPORTED_PATH_TYPE":
      return `Unsupported path type: ${p.path}`;
    case "NOT_MARKDOWN":
      return `File "${p.path}" is not a markdown file. Only .md files are supported.`;
    case "NO_MARKDOWN_FILES":
      return `No markdown files found in ${p.dir}. Create a markdown file (.md) to continue.`;
    case "MULTIPLE_NO_INDEX":
      return `Multiple markdown files found in ${p.dir} without an index.md. Create an index.md file to use as the main file.`;
    case "MARKET_MULTIPLE_FILES":
      return `Multiple markdown files found in ${p.dir}. A Product supports a single .md file (no child entries).`;
    case "REF_OUTSIDE_ROOT":
      return `Reference "${p.ref}" in ${issue.file ?? p.file} points outside the root directory.`;
    case "REF_OUTSIDE_ROOT_SYMLINK":
      return `Reference "${p.ref}" in ${issue.file ?? p.file} resolves to a path outside the root directory (symlink detected).`;
    case "REF_OUTSIDE_ATTACHMENTS":
      return `Local asset "${p.ref}" in ${issue.file ?? p.file} must live inside ./${p.attachmentsDir}/.`;
    case "REF_OUTSIDE_ATTACHMENTS_SYMLINK":
      return `Local asset "${p.ref}" in ${issue.file ?? p.file} resolves to a path outside the attachments directory.`;
    case "REF_SINGLE_FILE_NO_ASSETS":
      return `Local asset "${p.ref}" in ${issue.file ?? p.file} is not allowed in single-file mode. Wrap the markdown file in a directory with an ./${p.attachmentsDir}/ folder.`;
    case "ASSET_NOT_FOUND":
      return `${p.kind ?? "Asset"} file not found: "${p.ref}" referenced in ${issue.file ?? p.file}`;
    case "LINK_NOT_TOP_LEVEL":
      return `Linked file must live at the top level of the directory: "${p.ref}" referenced in ${issue.file ?? p.file}`;
    case "LINK_NOT_FOUND":
      return `Linked file not found: "${p.ref}" referenced in ${issue.file ?? p.file}`;
    case "MULTIPLE_COVER_CANDIDATES":
      return `Multiple cover candidates found in ./${p.attachmentsDir}/: ${p.matches}. Set the "cover" field explicitly to pick one.`;
    case "MULTIPLE_AVATAR_CANDIDATES":
      return `Multiple avatar candidates found in ./${p.attachmentsDir}/: ${p.matches}. Set the "avatar" field explicitly to pick one.`;
    case "INVALID_SLUG_FORMAT":
      return `Invalid slug "${p.slug}": must contain only lowercase letters, digits and single hyphens.`;
    case "INVALID_SLUG_MIN_WORDS":
      return `Invalid slug "${p.slug}": must contain at least ${p.min} words separated by hyphens (got ${p.got}).`;
    case "INVALID_TAG_EMPTY":
      return `Invalid tag: tag cannot be empty.`;
    case "INVALID_TAG_FORMAT":
      return `Invalid tag "${p.tag}": must contain only lowercase letters, digits and single hyphens (no spaces, accents, or uppercase).`;
    case "INVALID_STATUS":
      return `Invalid status "${p.value}": must be one of draft, published, archived.`;
    case "INVALID_VISIBILITY":
      return `Invalid visibility "${p.value}": must be one of ${p.allowed ?? "public, private, prime"}.`;
    case "LINK_POINTS_TO_MEDIA":
      return `Link "${p.alt}" points to a media file (${p.href}). Only web page links are allowed.`;
    case "LINK_POINTS_TO_LOCAL_MD":
      return `Link "${p.alt}" points to a local markdown file (${p.href}). Sibling markdown entries are not supported here.`;
    case "INVALID_PRODUCT_KIND":
      return `Invalid product kind "${p.value}": must be one of service, product, digital.`;
    case "INVALID_PRICE_VALUE":
      return `Invalid price "${p.value}": must be a number.`;
    case "INVALID_PRICE_NEGATIVE":
      return `Invalid price ${p.value}: must be ≥ 0.`;
    case "MISSING_CURRENCY":
      return `Product has price ${p.price} but no currency. Set "currency" in the frontmatter (e.g. USD).`;
    case "DIGITAL_NEEDS_ATTACHMENT":
      return `Product of kind "digital" requires an attachment. Add an "attachment" field in the frontmatter or drop a file at ./${p.attachmentsDir}/attachment.zip.`;
    case "PRODUCT_FIELD_MUST_BE_LOCAL":
      return `Field "${p.field}" must be a local path inside ./${p.attachmentsDir}/ (got "${p.value}").`;
    case "INVALID_LANGUAGE":
      return `Invalid language "${p.value}": must be a short ISO code (e.g. "en", "es", "pt-br").`;
    case "INVALID_SOCIAL_URL":
      return `Invalid ${p.key} URL "${p.value}": must start with http:// or https://.`;
    case "UPLOAD_TOO_LARGE":
      return `${p.kind ?? "Upload"} assets total ${p.actualMb} MB which exceeds the ${p.maxMb} MB upload limit.`;
  }
}

/**
 * Error thrown by walker / publish functions for fatal, structural issues
 * (missing path, unsupported file type, upload too large). Validation
 * issues collected via `collectErrors` are surfaced as `ValidationIssue`
 * objects instead.
 */
export class SentilisError extends Error {
  readonly issue: ValidationIssue;
  constructor(issue: ValidationIssue) {
    super(formatIssue(issue));
    this.name = "SentilisError";
    this.issue = issue;
  }
}
