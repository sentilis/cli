export interface Profile {
  token: string;
  env?: string;
}

export interface Config {
  profiles: Record<string, Profile>;
}

export type LifecycleStatus = "draft" | "published" | "archived";

/**
 * `private` is the single "not public" value: the entry stays out of public
 * listings and is not reachable by direct URL. A bio additionally accepts a
 * `password`, which turns `private` into a shareable, unlockable page.
 */
export const VISIBILITY_VALUES = ["public", "private", "prime"] as const;
export type LifecycleVisibility = (typeof VISIBILITY_VALUES)[number];

export function isValidVisibility(s: string): s is LifecycleVisibility {
  return (VISIBILITY_VALUES as readonly string[]).includes(s);
}

/**
 * Lo que puede tener una entrada del catálogo —un producto de Market o un plan
 * de Prime—: está a la venta o está escondida. `prime` es una visibilidad de
 * press y bio; un plan que solo vieran sus propios suscriptores sería
 * incomprable.
 */
export const CATALOG_VISIBILITY_VALUES = VISIBILITY_VALUES.filter(
  (v) => v !== "prime",
);

export function isCatalogVisibility(s: string): s is LifecycleVisibility {
  return (CATALOG_VISIBILITY_VALUES as readonly string[]).includes(s);
}
