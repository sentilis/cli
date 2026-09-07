const API_URLS: Record<string, string> = {
  dev: "http://localhost:4321",
  // The API is served by the platform app on its main host. `api.sentilis.me`
  // resolves but is not routed to it — every path there answers 404 — so it is
  // not a usable base URL today.
  prod: "https://sentilis.me",
};

function resolveApiBase(env?: string): string {
  return API_URLS[env ?? "prod"] ?? API_URLS.prod;
}

/**
 * Cross-runtime check for a `DEBUG` env flag. Avoids referencing `process`
 * directly so the module is safe to import in browsers / edge runtimes.
 */
function isDebug(): boolean {
  try {
    return Boolean(
      (globalThis as { process?: { env?: { DEBUG?: string } } }).process?.env
        ?.DEBUG,
    );
  } catch {
    return false;
  }
}

export const AUTH_ENDPOINT = "/api/v1/auth/token";
export const PRESS_ENDPOINT = "/api/v1/press";
export const MARKET_ENDPOINT = "/api/v1/market/products";
export const BIO_ENDPOINT = "/api/v1/bio";

export interface AuthTokenResponse {
  data: { username: string };
}

/**
 * Page mode reports totals; cursor mode (`after`) reports where to continue
 * and skips the count, so `total` / `totalPages` are absent there.
 */
export interface Pagination {
  page?: number;
  limit: number;
  total?: number;
  totalPages?: number;
  /** Pass back as `after` to fetch the next page. */
  nextCursor?: string | null;
  hasMore?: boolean;
}

/** Paging arguments shared by every list endpoint. */
export interface ListPageParams {
  page?: number;
  limit?: number;
  /** Cursor from a previous `pagination.nextCursor`. */
  after?: string;
}

export interface ApiError {
  error: {
    /** Stable string code, e.g. "UNAUTHORIZED", "RATE_LIMITED". */
    code: string;
    message: string;
    /** HTTP status, mirrored in the body. */
    status: number;
  };
}

/**
 * Error thrown when the API answers with the error envelope. Keeps `message`
 * for callers that only print it, and exposes the machine-readable parts so a
 * CLI or plugin can react (back off on 429, explain a 413, re-login on 401).
 */
export class SentilisApiError extends Error {
  readonly code: string;
  readonly status: number;
  /** Seconds to wait, from the `Retry-After` header on a 429. */
  readonly retryAfter?: number;

  constructor(
    code: string,
    message: string,
    status: number,
    retryAfter?: number,
  ) {
    super(message);
    this.name = "SentilisApiError";
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export interface PressPublishResponse {
  data: {
    id: string;
    slug: string;
    url: string;
  };
}

export interface PressListItem {
  id: string;
  slug: string;
  name: string;
  category: string | null;
  status: string;
  visibility: string;
  tags: string[];
  url: string;
  createdAt: string;
}

export interface PressListResponse {
  data: PressListItem[];
  pagination: Pagination;
}

export interface PressListParams extends ListPageParams {
  visibility?: string[];
}

export interface PressInfoResponse {
  data: {
    id: string;
    slug: string;
    name: string;
    category: string | null;
    status: string;
    visibility: string;
    tags: string[];
    authors: string[];
    url: string;
    createdAt: string;
    children?: {
      id: string;
      slug: string;
      name: string;
      status?: string;
      visibility?: string;
      category?: string | null;
      url?: string;
      createdAt?: string;
    }[];
  };
}

export interface PressRemoveResponse {
  data: { id: string };
}

export interface ProductPublishResponse {
  data: {
    id: string;
    slug: string;
    url: string;
  };
}

export interface ProductListItem {
  id: string;
  slug: string;
  name: string;
  kind: string;
  category: string | null;
  price: number;
  currency: string | null;
  status: string;
  visibility: string;
  url: string;
  createdAt: string;
}

export interface ProductListResponse {
  data: ProductListItem[];
  pagination: Pagination;
}

export type ProductListParams = ListPageParams;

export interface ProductRemoveResponse {
  data: { id: string };
}

export interface ProductAttachmentResponse {
  data: {
    id: string;
    attachment: string;
  };
}

export interface BioPublishResponse {
  data: {
    id: string;
    slug: string;
    created: boolean;
  };
}

export interface BioListItem {
  id: string;
  slug: string;
  language: string;
  name: string;
  role: string | null;
  status: string;
  visibility: string;
  url: string;
  createdAt: string;
}

export interface BioListResponse {
  data: BioListItem[];
  pagination: Pagination;
}

export interface BioListParams extends ListPageParams {
  visibility?: string[];
}

export interface BioInfoChild {
  id: string;
  slug: string;
  language: string;
  name: string;
  role: string | null;
  status: string;
  visibility: string;
  url: string;
}

export interface BioInfoResponse {
  data: {
    id: string;
    parent: string | null;
    slug: string;
    language: string;
    status: string;
    visibility: string;
    hasPassword: boolean;
    avatarUrl: string | null;
    name: string;
    role: string | null;
    location: string | null;
    email: string | null;
    phone: string | null;
    url: string;
    children: BioInfoChild[];
  };
}

export interface BioRemoveResponse {
  data: { id: string };
}

/**
 * The profile access token (`sen_…`) travels as a bearer credential.
 * It replaced the password-only Basic scheme when the API was unified under
 * `/api/v1`; the old scheme is rejected by the server.
 */
function bearerAuth(token: string): string {
  return `Bearer ${token}`;
}

/**
 * Builds the query string for a list call.
 *
 * `visibility` goes as one comma-separated value (`?visibility=public,private`):
 * the API reads a single occurrence of the key, so repeating it silently
 * dropped every value but the first.
 */
function buildListQuery(
  params: ListPageParams & { visibility?: string[] },
): string {
  const search = new URLSearchParams();
  if (params.visibility && params.visibility.length > 0) {
    search.set("visibility", params.visibility.join(","));
  }
  if (params.page !== undefined) search.set("page", String(params.page));
  if (params.limit !== undefined) search.set("limit", String(params.limit));
  if (params.after) search.set("after", params.after);
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

/** Parses the error envelope (or synthesises one) into a throwable error. */
function toApiError(
  payload: unknown,
  res: Response,
  fallbackMessage: string,
): SentilisApiError {
  const envelope = (payload as ApiError | undefined)?.error;
  const retryAfterHeader = res.headers.get("Retry-After");
  const retryAfter = retryAfterHeader ? Number(retryAfterHeader) : undefined;
  return new SentilisApiError(
    envelope?.code ?? "UNKNOWN",
    envelope?.message || fallbackMessage,
    envelope?.status ?? res.status,
    Number.isFinite(retryAfter) ? retryAfter : undefined,
  );
}

export interface RestClientOptions {
  /**
   * Extra headers to send on every request. Used by callers to inject
   * client-identifying metadata (e.g. `X-Client-Name`, `X-OS-Platform`).
   * The core stays runtime-agnostic; environment-specific values are the
   * caller's responsibility.
   */
  headers?: Record<string, string>;
}

export class RestClient {
  private token: string;
  private apiBase: string;
  private extraHeaders: Record<string, string>;

  constructor(token: string, env?: string, options: RestClientOptions = {}) {
    this.token = token;
    this.apiBase = resolveApiBase(env);
    this.extraHeaders = options.headers ?? {};
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.apiBase}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        ...this.extraHeaders,
        Authorization: bearerAuth(this.token),
        "Content-Type": "application/json",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    let json: T | ApiError;
    try {
      json = JSON.parse(text) as T | ApiError;
    } catch {
      throw new Error(
        `Request failed with status ${res.status}: ${text.trim()}`,
      );
    }

    if (!res.ok || "error" in (json as object)) {
      throw toApiError(
        json,
        res,
        `Request failed with status ${res.status}`,
      );
    }

    return json as T;
  }

  private async uploadMultipart<T>(
    path: string,
    formData: FormData,
  ): Promise<T> {
    const url = `${this.apiBase}${path}`;

    if (isDebug()) {
      const keys: string[] = [];
      formData.forEach((_v, k) => keys.push(k));
      console.error(`[DEBUG] POST ${url}`);
      console.error(`[DEBUG] FormData keys: ${keys.join(", ")}`);
      for (const [k, v] of formData.entries()) {
        if (v instanceof Blob) {
          console.error(
            `[DEBUG]   ${k}: Blob(${v.size} bytes, type=${v.type})`,
          );
        } else {
          console.error(`[DEBUG]   ${k}: ${v}`);
        }
      }
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        ...this.extraHeaders,
        Authorization: bearerAuth(this.token),
        // Content-Type is intentionally omitted: fetch sets
        // "multipart/form-data; boundary=..." automatically with the correct boundary.
      },
      body: formData,
    });

    const text = await res.text();

    if (isDebug()) {
      console.error(`[DEBUG] Response status: ${res.status}`);
      console.error(`[DEBUG] Response body: ${text}`);
    }

    let json: T | ApiError;
    try {
      json = JSON.parse(text) as T | ApiError;
    } catch {
      throw new Error(
        `Upload failed with status ${res.status}: ${text.trim()}`,
      );
    }

    if (!res.ok || "error" in (json as object)) {
      throw toApiError(
        json,
        res,
        `Upload failed with status ${res.status}: ${text.trim()}`,
      );
    }

    return json as T;
  }

  async uploadPress(formData: FormData): Promise<PressPublishResponse> {
    return this.uploadMultipart<PressPublishResponse>(
      PRESS_ENDPOINT,
      formData,
    );
  }

  async listPress(params: PressListParams = {}): Promise<PressListResponse> {
    return this.request<PressListResponse>(
      "GET",
      `${PRESS_ENDPOINT}${buildListQuery(params)}`,
    );
  }

  async getPress(id: string): Promise<PressInfoResponse> {
    return this.request<PressInfoResponse>(
      "GET",
      `${PRESS_ENDPOINT}/${encodeURIComponent(id)}`,
    );
  }

  async removePress(id: string): Promise<PressRemoveResponse> {
    return this.request<PressRemoveResponse>(
      "DELETE",
      `${PRESS_ENDPOINT}/${encodeURIComponent(id)}`,
    );
  }

  async uploadProduct(formData: FormData): Promise<ProductPublishResponse> {
    return this.uploadMultipart<ProductPublishResponse>(
      MARKET_ENDPOINT,
      formData,
    );
  }

  async listProduct(
    params: ProductListParams = {},
  ): Promise<ProductListResponse> {
    return this.request<ProductListResponse>(
      "GET",
      `${MARKET_ENDPOINT}${buildListQuery(params)}`,
    );
  }

  async removeProduct(id: string): Promise<ProductRemoveResponse> {
    return this.request<ProductRemoveResponse>(
      "DELETE",
      `${MARKET_ENDPOINT}/${encodeURIComponent(id)}`,
    );
  }

  async attachProduct(
    id: string,
    formData: FormData,
  ): Promise<ProductAttachmentResponse> {
    return this.uploadMultipart<ProductAttachmentResponse>(
      `${MARKET_ENDPOINT}/${encodeURIComponent(id)}/attachment`,
      formData,
    );
  }

  async uploadBio(formData: FormData): Promise<BioPublishResponse> {
    return this.uploadMultipart<BioPublishResponse>(BIO_ENDPOINT, formData);
  }

  async listBio(params: BioListParams = {}): Promise<BioListResponse> {
    return this.request<BioListResponse>(
      "GET",
      `${BIO_ENDPOINT}${buildListQuery(params)}`,
    );
  }

  async getBio(id: string): Promise<BioInfoResponse> {
    return this.request<BioInfoResponse>(
      "GET",
      `${BIO_ENDPOINT}/${encodeURIComponent(id)}`,
    );
  }

  async removeBio(id: string): Promise<BioRemoveResponse> {
    return this.request<BioRemoveResponse>(
      "DELETE",
      `${BIO_ENDPOINT}/${encodeURIComponent(id)}`,
    );
  }
}

/**
 * Validate a token against the backend and return the owning username.
 * Used by `login` to derive the profile key from the token itself.
 */
export async function validateToken(
  token: string,
  env?: string,
  options: RestClientOptions = {},
): Promise<string> {
  const url = `${resolveApiBase(env)}${AUTH_ENDPOINT}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      ...(options.headers ?? {}),
      Authorization: bearerAuth(token),
    },
  });

  const text = await res.text();
  let json: AuthTokenResponse | ApiError;
  try {
    json = JSON.parse(text) as AuthTokenResponse | ApiError;
  } catch {
    throw new Error(
      `Token validation failed with status ${res.status}: ${text.trim()}`,
    );
  }

  if (!res.ok || "error" in (json as object)) {
    throw toApiError(
      json,
      res,
      `Token validation failed with status ${res.status}`,
    );
  }

  const username = (json as AuthTokenResponse).data?.username;
  if (!username) {
    throw new Error("Token validation response missing data.username");
  }
  return username;
}
