import { expect, type Page, test } from "@playwright/test"

test.use({ storageState: { cookies: [], origins: [] } })

const article = {
  id: 1,
  source_id: "1",
  headline: "Tabs test article",
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

async function mockApi(page: Page, me: Record<string, unknown>) {
  await page.route("**/api/v1/**", (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith("/utils/me")) return route.fulfill({ json: { email: "test@example.com", ...me } })
    if (path.endsWith("/facets")) return route.fulfill({ json: { categories: ["LNG"], regions: [] } })
    if (path.endsWith("/last-run")) return route.fulfill({ json: { configured: true, state: null, start_time: null } })
    return route.fulfill({ json: { data: [article], total: 1 } })
  })
}

const tabs = (page: Page) => page.getByRole("tablist", { name: "News views" })

test("sidebar has a single News entry that opens the condensed summary", async ({ page }) => {
  await mockApi(page, { is_admin: false })
  await page.goto("/")
  const nav = page.getByRole("link", { name: "News", exact: true })
  await expect(nav).toBeVisible()
  await expect(page.getByRole("link", { name: "Newsletter" })).toHaveCount(0)
  await expect(page.getByRole("link", { name: "News Summary (Condensed)" })).toHaveCount(0)
  await nav.click()
  await expect(page).toHaveURL(/\/news$/)
  await expect(page.getByRole("heading", { name: /LNG market news \/ sentiment \(condensed\)/ })).toBeVisible()
  await expect(tabs(page).getByRole("tab", { name: "News Summary (Condensed)" })).toHaveAttribute("aria-selected", "true")
})

test("newsletter is a tab and non-admins cannot see or open the editable summary", async ({ page }) => {
  await mockApi(page, { is_admin: false })
  await page.goto("/news")
  await expect(tabs(page).getByRole("tab")).toHaveCount(2)
  await expect(tabs(page).getByRole("tab", { name: "News Summary", exact: true })).toHaveCount(0)

  await tabs(page).getByRole("tab", { name: "Newsletter" }).click()
  await expect(page).toHaveURL(/\/news\/newsletter$/)
  await expect(page.getByRole("heading", { name: "Newsletter", exact: true })).toBeVisible()

  await page.goto("/news/summary")
  await expect(page).toHaveURL(/\/news$/)
  await expect(page.getByRole("heading", { name: /\(condensed\)/ })).toBeVisible()
})

test("admins get the editable News Summary as a third tab", async ({ page }) => {
  await mockApi(page, { is_admin: true })
  await page.goto("/news")
  await expect(tabs(page).getByRole("tab")).toHaveCount(3)
  await tabs(page).getByRole("tab", { name: "News Summary", exact: true }).click()
  await expect(page).toHaveURL(/\/news\/summary$/)
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible()
})

for (const [legacy, target] of [
  ["/newsletter", "/news/newsletter"],
  ["/news_summary", "/news/summary"],
  ["/news_summary_condensed", "/news"],
]) {
  test(`${legacy} redirects to ${target}`, async ({ page }) => {
    await mockApi(page, { is_admin: true })
    await page.goto(legacy)
    await expect(page).toHaveURL(new RegExp(`${target.replaceAll("/", "\\/")}$`))
  })
}
