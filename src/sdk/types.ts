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
