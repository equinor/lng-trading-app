import { type Dispatch, type SetStateAction, useEffect, useState } from "react"

import { readJson, writeJson } from "@/lib/storage"

/**
 * State kept in localStorage as JSON. `parse` turns whatever was saved (or null when nothing
 * was) into a valid value; `serialize` turns the value into something JSON can store.
 * Pass module-level functions so they stay stable between renders.
 */
export function usePersistentState<T>(
  key: string,
  parse: (saved: unknown) => T,
  serialize: (value: T) => unknown,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() =>
    parse(readJson<unknown>(window.localStorage, key)),
  )

  useEffect(() => {
    writeJson(window.localStorage, key, serialize(value))
  }, [key, value, serialize])

  return [value, setValue]
}
