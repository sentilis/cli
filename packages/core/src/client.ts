const API_URLS: Record<string, string> = {
  dev: "http://localhost:4321",
  prod: "https://api.sentilis.me",
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

export const AUTH_ENDPOINT = "/openapi/v1/auth/token";
export const PRESS_ENDPOINT = "/openapi/v1/press";
export const MARKET_ENDPOINT = "/openapi/v1/market";
export const BIO_ENDPOINT = "/openapi/v1/bio";

export interface AuthTokenResponse {
  data: { username: string };
}

export interface ApiError {
  error: {
    code: number;
    message: string;
    status: string;
  };
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
}

export interface PressListResponse {
  data: PressListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface PressListParams {
  visibility?: string[];
  page?: number;
  limit?: number;
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
    children?: {
      id: string;
      slug: string;
      name: string;
      status?: string;
      visibility?: string;
      category?: string | null;
      url?: string;
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
  url: string;
}

export interface ProductListResponse {
  data: ProductListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ProductListParams {
  page?: number;
  limit?: number;
}

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
}

export interface BioListResponse {
  data: BioListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface BioListParams {
  visibility?: string[];
  page?: number;
  limit?: number;
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
 * Build the Basic Auth header value for a password-only credential.
 * RFC 7617: encode "<username>:<password>" in base64. When there is no
 * username the colon is still required → ":password".
 *
 * Uses `btoa` for isomorphic support (Node 16+ and all browsers).
 */
function basicAuth(token: string): string {
  return `Basic ${btoa(`:${token}`)}`;
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
        Authorization: basicAuth(this.token),
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
      const err = (json as ApiError).error;
      throw new Error(
        err?.message ?? `Request failed with status ${res.status}`,
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
        Authorization: basicAuth(this.token),
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
      const err = (json as ApiError).error;
      throw new Error(
        err?.message ??
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
    const search = new URLSearchParams();
    if (params.visibility && params.visibility.length > 0) {
      for (const v of params.visibility) {
        search.append("visibility", v);
      }
    }
    if (params.page !== undefined) search.set("page", String(params.page));
    if (params.limit !== undefined) search.set("limit", String(params.limit));
    const path = `${PRESS_ENDPOINT}?${search.toString()}`;
    return this.request<PressListResponse>("GET", path);
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
    const search = new URLSearchParams();
    if (params.page !== undefined) search.set("page", String(params.page));
    if (params.limit !== undefined) search.set("limit", String(params.limit));
    const qs = search.toString();
    const path = qs ? `${MARKET_ENDPOINT}?${qs}` : MARKET_ENDPOINT;
    return this.request<ProductListResponse>("GET", path);
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
    const search = new URLSearchParams();
    if (params.visibility && params.visibility.length > 0) {
      for (const v of params.visibility) {
        search.append("visibility", v);
      }
    }
    if (params.page !== undefined) search.set("page", String(params.page));
    if (params.limit !== undefined) search.set("limit", String(params.limit));
    const qs = search.toString();
    const path = qs ? `${BIO_ENDPOINT}?${qs}` : BIO_ENDPOINT;
    return this.request<BioListResponse>("GET", path);
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
      Authorization: basicAuth(token),
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
    const err = (json as ApiError).error;
    throw new Error(
      err?.message ?? `Token validation failed with status ${res.status}`,
    );
  }

  const username = (json as AuthTokenResponse).data?.username;
  if (!username) {
    throw new Error("Token validation response missing data.username");
  }
  return username;
}
