import { Activity, Home, Users, Newspaper, Layout } from "lucide-react"

import { SidebarAppearance } from "@/components/Common/Appearance"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import useAuth from "@/hooks/useAuth"
import { useEquinorFont } from "@/hooks/useEquinorFont"
import { type Item, Main } from "./Main"
import { User } from "./User"

const baseItems: Item[] = [
  { icon: Newspaper, title: "Newsletter", path: "/newsletter" },
  { icon: Layout, title: "News Summary", path: "/news_summary" },
  { icon: Layout, title: "News Summary (Condensed)", path: "/news_summary_condensed" },
  { type: "separator", key: "news-pipeline-divider" },
  { icon: Activity, title: "Pipeline Nominations", path: "/pipeline_nominations" },
  { type: "separator", key: "pipeline-curve-builder-divider" },
  { icon: Home, title: "Mid-term Curve Builder", path: "/" },
]

export function AppSidebar() {
  const { user: currentUser } = useAuth()
  useEquinorFont()

  const items = currentUser?.is_superuser
    ? [{ icon: Users, title: "Admin", path: "/admin" }, ...baseItems]
    : baseItems

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-4 py-6 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:items-center">
        <div className="flex w-full items-center justify-between gap-2 group-data-[collapsible=icon]:justify-center">
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <span
              className="whitespace-nowrap text-lg font-semibold"
              style={{ color: "#ff1243", fontFamily: "Equinor, sans-serif" }}
            >
              LNG Analytics
            </span>
          </div>
          <SidebarTrigger className="size-8 shrink-0" />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <Main items={items} />
      </SidebarContent>
      <SidebarFooter>
        <SidebarAppearance />
        <User user={currentUser} />
      </SidebarFooter>
    </Sidebar>
  )
}

export default AppSidebar
