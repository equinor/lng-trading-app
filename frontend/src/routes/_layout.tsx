import {
  createFileRoute,
  Outlet,
  redirect,
  useRouterState,
} from "@tanstack/react-router"

import { Footer } from "@/components/Common/Footer"
import AppSidebar from "@/components/Sidebar/AppSidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { isLoggedIn } from "@/hooks/useAuth"

export const Route = createFileRoute("/_layout")({
  component: Layout,
  beforeLoad: async () => {
    if (!isLoggedIn()) {
      throw redirect({
        to: "/",
      })
    }
  },
})

function Layout() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const isNewsSummaryRoute =
    pathname === "/news_summary" || pathname === "/news_summary_condensed"
  // The mid-term curves page fills the screen and lays out its own header and scrolling.
  const isFullScreenRoute = pathname === "/mid_term_curves"
  const isWideRoute = isNewsSummaryRoute || pathname === "/pipeline_nominations"

  return (
    <SidebarProvider
      className={
        isFullScreenRoute ? "h-svh min-h-0 overflow-hidden" : undefined
      }
    >
      <AppSidebar />
      <SidebarInset className="min-h-0 min-w-0">
        {isFullScreenRoute ? (
          <Outlet />
        ) : (
          <main
            className={`min-h-0 flex-1 ${isNewsSummaryRoute ? "overflow-hidden p-4" : "p-6 md:p-8"}`}
          >
            <div
              className={`mx-auto h-full min-h-0 w-full ${isWideRoute ? "max-w-none" : "max-w-7xl"}`}
            >
              <Outlet />
            </div>
          </main>
        )}
        {!isNewsSummaryRoute && !isFullScreenRoute && <Footer />}
      </SidebarInset>
    </SidebarProvider>
  )
}

export default Layout
