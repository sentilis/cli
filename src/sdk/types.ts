export interface Profile {
  token: string;
  env?: string;
}

export interface Config {
  profiles: Record<string, Profile>;
}

export type LifecycleStatus = "draft" | "published" | "archived";
export type LifecycleVisibility = "public" | "private" | "protected" | "prime";
