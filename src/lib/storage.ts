// Small, failure-tolerant wrappers around localStorage / sessionStorage.
// Every access is guarded: storage can be disabled or full.

function read<T>(store: "local" | "session", key: string, fallback: T): T {
  try {
    const s = store === "local" ? window.localStorage : window.sessionStorage;
    const raw = s.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(store: "local" | "session", key: string, value: unknown) {
  try {
    const s = store === "local" ? window.localStorage : window.sessionStorage;
    s.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export type Profile = { pseudo: string; gameId: string; alliance: string };

export const storage = {
  getTz: () => read<"utc" | "local">("local", "wsb_tz", "utc"),
  setTz: (v: "utc" | "local") => write("local", "wsb_tz", v),
  getTokens: () => read<Record<string, string>>("local", "wsb_tokens", {}),
  setTokens: (v: Record<string, string>) => write("local", "wsb_tokens", v),
  getProfile: () =>
    read<Profile>("local", "wsb_profile", { pseudo: "", gameId: "", alliance: "" }),
  setProfile: (v: Profile) => write("local", "wsb_profile", v),
  getPosition: () => read<string | null>("local", "wsb_position", null),
  setPosition: (v: string) => write("local", "wsb_position", v),
  hasExported: () => read<boolean>("session", "wsb_exported", false),
  markExported: () => write("session", "wsb_exported", true),
  clearExported: () => write("session", "wsb_exported", false),
};
