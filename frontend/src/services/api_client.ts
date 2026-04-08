type HttpMethod = "GET" | "PATCH"

type RequestOptions = {
  method?: HttpMethod
  query?: Record<string, string>
  body?: unknown
}

function buildUrl(path: string, query?: Record<string, string>) {
  const url = new URL(path, window.location.origin)
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      url.searchParams.set(k, v)
    }
  }
  return url.toString()
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", query, body } = options
  const res = await fetch(buildUrl(path, query), {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    throw new Error(`${method} ${path} failed (${res.status})`)
  }

  if (res.status === 204) {
    return undefined as T
  }

  return (await res.json()) as T
}
