import { expect, type Page, test } from "@playwright/test"

import type { DbNewsRow } from "../src/services/news/news_api"
import type { DefaultLayoutMode, SentimentKey, StoredLayout } from "../src/services/news/news_layout"

test.use({ storageState: { cookies: [], origins: [] } })

const sentiments: SentimentKey[] = ["bullish", "neutral", "bearish"]
const paths = ["/news_summary", "/news_summary_condensed"]
const storageKey = "news-summary-layout-v1"
const defaultLabels = {
  auto: "Automatic: dominant sentiment",
  columns: "Three columns: Bullish / Neutral / Bearish",
}

function panels(page: Page) {
  return page.getByRole("button", { name: "Drag to reorder panel" }).locator("..")
}

async function mockNews(page: Page, dominant: SentimentKey) {
  const data: DbNewsRow[] = [...sentiments, dominant, dominant].map((sentiment, index) => ({
    id: index + 1,
    source_id: String(index + 1),
    category: ["LNG", "Shipping", "Supply", "Demand"],
    region: [],
    summary: "Test summary",
    paragraph_summary: "Test paragraph summary",
    headline: `${sentiment} article ${index + 1}`,
    body: "Test article body",
    favourited: true,
    read: false,
    official_sentiment: sentiment,
    source: "Test source",
    updatedDate: null,
    rtpTimestamp: new Date().toISOString(),
    publishedChannel: null,
    importantStory: null,
    documentUrl: null,
  }))
  await page.route("**/api/v1/utils/me", (route) => route.fulfill({
    json: { email: "layout@example.com", is_superuser: false },
  }))
  await page.route("**/api/v1/news/**", (route) => route.fulfill({ json: { data } }))
}

async function selectDefault(page: Page, mode: DefaultLayoutMode) {
  await page.getByRole("button", { name: "Layout", exact: true }).click()
  await page.getByRole("button", { name: defaultLabels[mode], exact: true }).click()
  await expect(page.getByRole("button", { name: defaultLabels[mode], exact: true })).toHaveAttribute("aria-pressed", "true")
  await page.getByRole("button", { name: "Done", exact: true }).click()
}

async function expectColumns(page: Page) {
  await expect(panels(page)).toHaveCount(3)
  for (const [index, title] of ["Bullish", "Neutral", "Bearish"].entries()) {
    await expect(panels(page).nth(index).getByText(title, { exact: true })).toBeVisible()
  }
  const [left, middle, right] = await Promise.all(
    [0, 1, 2].map((index) => panels(page).nth(index).boundingBox()),
  )
  if (!left || !middle || !right) throw new Error("Expected three visible sentiment panels")
  expect(left.x).toBeLessThan(middle.x)
  expect(middle.x).toBeLessThan(right.x)
  expect(Math.abs(left.y - middle.y)).toBeLessThan(1)
  expect(Math.abs(middle.y - right.y)).toBeLessThan(1)
  expect(Math.abs(left.width - middle.width)).toBeLessThan(2)
  expect(Math.abs(middle.width - right.width)).toBeLessThan(2)
}

async function expectAutomatic(page: Page, dominant: SentimentKey) {
  await expect(panels(page)).toHaveCount(3)
  const title = dominant[0].toUpperCase() + dominant.slice(1)
  const dominantTitle = page.getByText(title, { exact: true })
  const bigPanel = panels(page).filter({ has: dominantTitle })
  const smallPanel = panels(page).filter({ hasNot: dominantTitle }).first()
  await expect(bigPanel).toBeVisible()
  const [big, small] = await Promise.all(
    [bigPanel.boundingBox(), smallPanel.boundingBox()],
  )
  if (!big || !small) throw new Error("Expected visible automatic-layout panels")
  expect(big.width * big.height).toBeGreaterThan(small.width * small.height * 1.5)
  if (dominant === "bullish") expect(big.x).toBeLessThan(small.x)
  if (dominant === "bearish") expect(big.x).toBeGreaterThan(small.x)
  if (dominant === "neutral") expect(big.y).toBeGreaterThan(small.y)
}

async function storedLayout(page: Page): Promise<StoredLayout | null> {
  return page.evaluate((key) => JSON.parse(sessionStorage.getItem(key) ?? "null"), storageKey)
}

for (const path of paths) {
  for (const dominant of sentiments) {
    test(`${path} retains the ${dominant}-dominant automatic default and offers fixed columns`, async ({ page }) => {
      await mockNews(page, dominant)
      await page.goto(path)
      await expectAutomatic(page, dominant)
      await selectDefault(page, "columns")
      await expectColumns(page)
      await page.reload()
      await expectColumns(page)
      await selectDefault(page, "auto")
      await expectAutomatic(page, dominant)
    })
  }

  test(`${path} remembers the selected default across customisation, reset, and both pages`, async ({ page }) => {
    await mockNews(page, "bearish")
    await page.goto(path)
    await selectDefault(page, "columns")
    await page.getByRole("button", { name: "Layout", exact: true }).click()
    await page.getByRole("button", { name: "Wide top + two bottom", exact: true }).click()
    await page.getByRole("button", { name: "Done", exact: true }).click()
    await expect.poll(async () => (await storedLayout(page))?.mode).toBe("custom")

    await page.reload()
    await expect.poll(async () => (await storedLayout(page))?.layoutType).toBe("top-big")
    await page.getByRole("button", { name: "Layout", exact: true }).click()
    await page.getByRole("button", { name: "Reset to default", exact: true }).click()
    await page.getByRole("button", { name: "Done", exact: true }).click()
    await expectColumns(page)

    await mockNews(page, "neutral")
    await page.goto(path === paths[0] ? paths[1] : paths[0])
    await expectColumns(page)
    await selectDefault(page, "auto")
    await expectAutomatic(page, "neutral")
    await page.reload()
    await expectAutomatic(page, "neutral")
  })

  for (const mode of ["auto", "columns"] as const) {
    test(`${path} keeps category controls, grid arrangements, and persistence with the ${mode} default`, async ({ page }) => {
      await mockNews(page, "bearish")
      await page.goto(path)
      await selectDefault(page, mode)
      await page.getByRole("button", { name: "Layout", exact: true }).click()
      for (const category of ["LNG", "Shipping", "Supply"]) {
        await page.getByRole("button", { name: category, exact: true }).click()
      }
      await expect(page.getByRole("button", { name: "Demand", exact: true })).toBeDisabled()
      await page.getByRole("button", { name: "Grid 2+2+2", exact: true }).click()
      await page.getByRole("button", { name: "Done", exact: true }).click()
      await expect(panels(page)).toHaveCount(6)
      const before = await storedLayout(page)
      expect(before?.categories).toEqual(["LNG", "Shipping", "Supply"])
      expect(before?.gridRows).toEqual([2, 2, 2])
      expect(before?.slots).toEqual(mode === "columns"
        ? ["bullish", "neutral", "bearish"]
        : ["bearish", "bullish", "neutral"])

      const otherMode = mode === "columns" ? "auto" : "columns"
      await selectDefault(page, otherMode)
      await expect(panels(page)).toHaveCount(6)
      await page.reload()
      await expect(panels(page)).toHaveCount(6)
      const after = await storedLayout(page)
      expect(after?.defaultMode).toBe(otherMode)
      expect(after?.gridRows).toEqual(before?.gridRows)
      expect(after?.gridOrder).toEqual(before?.gridOrder)
      expect(after?.rowSplits).toEqual(before?.rowSplits)
      expect(after?.colSplits).toEqual(before?.colSplits)

      await page.goto(path === paths[0] ? paths[1] : paths[0])
      await expect(panels(page)).toHaveCount(6)
      await page.getByRole("button", { name: "Layout", exact: true }).click()
      for (const category of ["Shipping", "Supply", "LNG"]) {
        await page.getByRole("button", { name: `Remove ${category}`, exact: true }).click()
      }
      await page.getByRole("button", { name: "Done", exact: true }).click()
      if (otherMode === "columns") await expectColumns(page)
      else await expectAutomatic(page, "bearish")

      await page.getByRole("button", { name: "Layout", exact: true }).click()
      await page.getByRole("button", { name: "LNG", exact: true }).click()
      await page.getByRole("button", { name: "Reset to default", exact: true }).click()
      await page.getByRole("button", { name: "Done", exact: true }).click()
      if (otherMode === "columns") await expectColumns(page)
      else await expectAutomatic(page, "bearish")
    })
  }

  test(`${path} restores legacy custom layouts with category sections`, async ({ page }) => {
    await mockNews(page, "bullish")
    const legacy: StoredLayout = {
      mode: "custom",
      layoutType: "right-big",
      slots: ["bearish", "bullish", "neutral"],
      primarySplit: 65,
      secondarySplit: 40,
      categories: ["LNG"],
      gridRows: [2, 2],
      gridOrder: ["cat:LNG", "neutral", "bullish", "bearish"],
    }
    await page.addInitScript(({ key, value }) => {
      sessionStorage.setItem(key, JSON.stringify(value))
    }, { key: storageKey, value: legacy })
    await page.goto(path)
    await expect(panels(page)).toHaveCount(4)
    await expect(panels(page).nth(0).getByText("LNG", { exact: true }).first()).toBeVisible()
    await expect(panels(page).nth(1).getByText("Neutral", { exact: true })).toBeVisible()
    const stored = await storedLayout(page)
    expect(stored?.layoutType).toBe("right-big")
    expect(stored?.slots).toEqual(legacy.slots)
    expect(stored?.primarySplit).toBe(65)
    expect(stored?.secondarySplit).toBe(40)
    expect(stored?.gridOrder).toEqual(legacy.gridOrder)
  })
}
