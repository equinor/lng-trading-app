import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import useAuth from "@/hooks/useAuth"
import { useEquinorFont } from "@/hooks/useEquinorFont"

export const NEWS_PATHS = {
  condensed: "/news",
  newsletter: "/news/newsletter",
  summary: "/news/summary",
} as const

type NewsPath = (typeof NEWS_PATHS)[keyof typeof NEWS_PATHS]

type NewsTab = { value: NewsPath; label: string; adminOnly?: boolean }

const TABS: NewsTab[] = [
  { value: NEWS_PATHS.condensed, label: "News Summary (Condensed)" },
  { value: NEWS_PATHS.newsletter, label: "Newsletter" },
  { value: NEWS_PATHS.summary, label: "News Summary", adminOnly: true },
]

export function isNewsPath(pathname: string) {
  return pathname === NEWS_PATHS.condensed || pathname.startsWith(`${NEWS_PATHS.condensed}/`)
}

/** Shell for the News section: a tab strip that routes between the news views. */
export function NewsPage() {
  useEquinorFont()
  const navigate = useNavigate()
  const { user } = useAuth()
  const pathname = useRouterState({ select: (state) => state.location.pathname })

  const isAdmin = Boolean(user?.is_admin)
  const tabs = TABS.filter((tab) => !tab.adminOnly || isAdmin)
  const activeTab = tabs.find((tab) => tab.value === pathname)?.value ?? NEWS_PATHS.condensed
  // The newsletter is a long list that scrolls; the summary views fill the screen and scroll
  // inside their panels.
  const isNewsletter = pathname === NEWS_PATHS.newsletter

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => navigate({ to: value as NewsPath })}
      className="flex min-h-0 flex-1 flex-col gap-0"
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-2">
        <TabsList aria-label="News views">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="text-xs" style={{ fontSize: "12px" }}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </header>
      <main className={`min-h-0 flex-1 p-4 ${isNewsletter ? "overflow-y-auto md:p-6" : "overflow-hidden"}`}>
        <div className={`mx-auto h-full min-h-0 w-full ${isNewsletter ? "max-w-7xl" : "max-w-none"}`}>
          <Outlet />
        </div>
      </main>
    </Tabs>
  )
}
