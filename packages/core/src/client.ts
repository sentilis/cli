import { createRequire } from "node:module";
import os from "node:os";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pkg = require("../package.json") as { name: string; version: string };

const API_URLS: Record<string, string> = {
  dev: "http://localhost:4321",
  prod: "https://api.sentilis.me",
};

function resolveApiBase(env?: string): string {
  return API_URLS[env ?? "prod"] ?? API_URLS.prod;
}

export const AUTH_ENDPOINT = "/openapi/v1/auth/token";
export const PRESS_ENDPOINT = "/openapi/v1/press";
export const MARKET_ENDPOINT = "/openapi/v1/market";

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

/**
 * Build the Basic Auth header value for a password-only credential.
 * RFC 7617: encode "<username>:<password>" in base64. When there is no
 * username the colon is still required → ":password".
 */
function basicAuth(token: string): string {
  const encoded = Buffer.from(`:${token}`).toString("base64");
  return `Basic ${encoded}`;
}

/**
 * Common request headers that identify the client origin.
 */
function clientMetaHeaders(): Record<string, string> {
  return {
    Origin: "https://sentilis.me",
    "x-ss-tenant-id": "cli",
    "X-Client-Name": pkg.name,
    "X-Client-Version": pkg.version,
    "X-OS-Platform": os.platform(),
    "X-OS-Release": os.release(),
    "X-OS-Arch": os.arch(),
    "X-Node-Version": process.version,
  };
}

export class RestClient {
  private token: string;
  private apiBase: string;

  constructor(token: string, env?: string) {
    this.token = token;
    this.apiBase = resolveApiBase(env);
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
        ...clientMetaHeaders(),
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

    if (process.env.DEBUG) {
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
        ...clientMetaHeaders(),
        Authorization: basicAuth(this.token),
        // Content-Type is intentionally omitted: fetch sets
        // "multipart/form-data; boundary=..." automatically with the correct boundary.
      },
      body: formData,
    });

    const text = await res.text();

    if (process.env.DEBUG) {
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
}

/**
 * Validate a token against the backend and return the owning username.
 * Used by `login` to derive the profile key from the token itself.
 */
export async function validateToken(
  token: string,
  env?: string,
): Promise<string> {
  const url = `${resolveApiBase(env)}${AUTH_ENDPOINT}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      ...clientMetaHeaders(),
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
