import {
  createFileRoute,
  Outlet,
  redirect,
  useRouterState,
} from "@tanstack/react-router"

import { Footer } from "@/components/Common/Footer"
import AppSidebar from "@/components/Sidebar/AppSidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { isNewsPath } from "@/features/news/pages/NewsPage"
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
  // The mid-term curves and news pages fill the screen and lay out their own header and scrolling.
  const isFullScreenRoute =
    pathname === "/mid_term_curves" || isNewsPath(pathname)
  const isWideRoute =
    pathname === "/pipeline_nominations" || pathname === "/lng_balance"

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
          <main className="min-h-0 flex-1 p-6 md:p-8">
            <div
              className={`mx-auto h-full min-h-0 w-full ${isWideRoute ? "max-w-none" : "max-w-7xl"}`}
            >
              <Outlet />
            </div>
          </main>
        )}
        {!isFullScreenRoute && <Footer />}
      </SidebarInset>
    </SidebarProvider>
  )
}

export default Layout
