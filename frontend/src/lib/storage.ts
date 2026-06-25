// frontend/src/lib/storage.ts
//
// Small, safe wrappers around the Web Storage API (localStorage / sessionStorage).
//
// Why this exists:
// - Web Storage can throw (private mode, quota exceeded, disabled cookies) and
//   JSON.parse can throw on corrupted values. Every call site previously wrapped
//   these in its own try/catch, which is easy to get wrong and duplicate.
// - These helpers centralise that handling so feature code can read/write typed
//   JSON values without worrying about failures.

/** Read and JSON-parse a value, returning null on any failure. */
export function readJson<T>(storage: Storage, key: string): T | null {
  try {
    const raw = storage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

/** JSON-stringify and store a value, silently ignoring storage failures. */
export function writeJson(storage: Storage, key: string, value: unknown): void {
  try {
    storage.setItem(key, JSON.stringify(value))
  } catch {
    // Ignore quota/availability errors — persistence is best-effort.
  }
}

/** Remove a key, silently ignoring storage failures. */
export function removeKey(storage: Storage, key: string): void {
  try {
    storage.removeItem(key)
  } catch {
    // Ignore.
  }
}

/** Read a raw string value, returning null on any failure. */
export function readString(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

/** Write a raw string value, silently ignoring storage failures. */
export function writeString(storage: Storage, key: string, value: string): void {
  try {
    storage.setItem(key, value)
  } catch {
    // Ignore.
  }
}
