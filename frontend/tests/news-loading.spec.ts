import { expect, type Page, test } from "@playwright/test"

test.use({ storageState: { cookies: [], origins: [] } })

function deferred() {
  let release = () => {}
  const promise = new Promise<void>((resolve) => { release = resolve })
  return { promise, release }
}

const article = {
  id: 1,
  source_id: "1",
  headline: "Loading test article",
  summary: "Article summary",
  paragraph_summary: null,
  body: "Article body",
  source: "Test source",
  favourited: true,
  read: false,
  official_sentiment: "bullish",
  category: ["LNG"],
  region: [],
  rtpTimestamp: new Date().toISOString(),
}

async function mockApi(page: Page) {
  await page.route("**/api/v1/**", (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith("/utils/me")) return route.fulfill({ json: { email: "test@example.com" } })
    if (path.endsWith("/facets")) return route.fulfill({ json: { categories: ["LNG"], regions: [] } })
    if (path.endsWith("/last-run")) return route.fulfill({ json: { configured: true, state: null, start_time: null } })
    return route.fulfill({ json: { data: [article], total: 1 } })
  })
}

for (const path of ["/newsletter", "/news_summary", "/news_summary_condensed"]) {
  test(`${path} shows a spinner during GET and hides it when articles arrive`, async ({ page }) => {
    await mockApi(page)
    const pending = deferred()
    await page.route("**/api/v1/news/?*", async (route) => {
      await pending.promise
      await route.fulfill({ json: { data: [article], total: 1 } })
    })
    await page.goto(path)
    await expect(page.getByRole("status").filter({ hasText: "Loading articles..." })).toBeVisible()
    await expect(page.getByRole("status").filter({ hasText: "Loading articles..." }).locator("svg")).toHaveClass(/animate-spin/)
    await expect(page.getByText("No matching stories.")).toHaveCount(0)
    pending.release()
    await expect(page.getByText(article.headline, { exact: path !== "/news_summary_condensed" })).toBeVisible()
    await expect(page.getByRole("status").filter({ hasText: "Loading articles..." })).toHaveCount(0)
  })
}

for (const path of ["/newsletter", "/news_summary"]) {
  test(`${path} shows saving during PATCH and loading throughout the following GET`, async ({ page }) => {
    await mockApi(page)
    await page.goto(path)
    await expect(page.getByText(article.headline, { exact: true })).toBeVisible()
    if (path === "/news_summary") await page.getByRole("button", { name: "Edit", exact: true }).click()
    const patch = deferred()
    const refresh = deferred()
    await page.route("**/api/v1/news/1/favourite", async (route) => {
      await patch.promise
      await route.fulfill({ json: { ok: true, data: { ...article, favourited: false } } })
    })
    await page.route("**/api/v1/news/?*", async (route) => {
      await refresh.promise
      await route.fulfill({ json: { data: [article], total: 1 } })
    })
    await page.getByRole("button", { name: "Favourited", exact: true }).click()
    await expect(page.getByRole("status").filter({ hasText: "Saving changes..." })).toBeVisible()
    patch.release()
    await expect(page.getByRole("status").filter({ hasText: "Loading articles..." })).toBeVisible()
    await expect(page.getByText(article.headline, { exact: true })).toBeVisible()
    refresh.release()
    await expect(page.getByRole("status").filter({ hasText: /Saving changes|Loading articles/ })).toHaveCount(0)
  })
}

test("email POST displays progress and prevents duplicate sends", async ({ page }) => {
  await mockApi(page)
  const pending = deferred()
  await page.route("**/api/v1/news/email-summary", async (route) => {
    await pending.promise
    await route.fulfill({ json: { ok: true, message: "Sent" } })
  })
  await page.goto("/news_summary")
  await page.getByRole("button", { name: "Email", exact: true }).click()
  await page.getByRole("button", { name: "Send to 1 recipient", exact: true }).click()
  await expect(page.getByRole("status").filter({ hasText: "Sending summary..." })).toBeVisible()
  await expect(page.getByRole("button", { name: "Sending...", exact: true })).toBeDisabled()
  pending.release()
  await expect(page.getByRole("dialog")).toHaveCount(0)
})

test("pipeline POST and running job display progress", async ({ page }) => {
  await mockApi(page)
  const pending = deferred()
  await page.route("**/api/v1/news/pipeline/trigger", async (route) => {
    await pending.promise
    await route.fulfill({ json: { ok: true, run_id: 1 } })
  })
  await page.goto("/newsletter")
  await page.getByRole("button", { name: "Run pipeline", exact: true }).click()
  await page.getByRole("button", { name: "Confirm run", exact: true }).click()
  await expect(page.getByRole("status").filter({ hasText: "Starting pipeline..." })).toBeVisible()
  await page.route("**/api/v1/news/pipeline/last-run", (route) =>
    route.fulfill({ json: { configured: true, state: "RUNNING", start_time: new Date().toISOString() } }))
  pending.release()
  await expect(page.getByRole("status").filter({ hasText: "Pipeline running..." })).toBeVisible()
})
