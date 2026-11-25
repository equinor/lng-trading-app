import {
  ChartSpline,
  Flame,
  Home,
  ListCollapse,
  Newspaper,
  Scale,
  ScrollText,
  ShieldCheck,
  Waypoints,
} from "lucide-react"

import { SidebarAppearance } from "@/components/Common/Appearance"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import useAuth from "@/hooks/useAuth"
import { useEquinorFont } from "@/hooks/useEquinorFont"
import { type Item, Main } from "./Main"
import { User } from "./User"

const baseItems: Item[] = [
  { icon: Home, tone: "neutral", title: "Dashboard", path: "/" },
  { type: "separator", key: "dashboard-news-divider" },
  { icon: Newspaper, tone: "neutral", title: "Newsletter", path: "/newsletter" },
  { icon: ScrollText, tone: "neutral", title: "News Summary", path: "/news_summary" },
  {
    icon: ListCollapse,
    tone: "neutral",
    title: "News Summary (Condensed)",
    path: "/news_summary_condensed",
  },
  { type: "separator", key: "news-pipeline-divider" },
  { icon: Waypoints, tone: "emerald", title: "Pipeline Nominations", path: "/pipeline_nominations" },
  { type: "separator", key: "pipeline-lng-balance-divider" },
  { icon: Scale, tone: "sky", title: "LNG Balance", path: "/lng_balance" },
  { type: "separator", key: "lng-balance-flare-divider" },
  { icon: Flame, tone: "amber", title: "Flare Monitor", path: "/flare_monitor" },
  { type: "separator", key: "pipeline-curve-builder-divider" },
  { icon: ChartSpline, tone: "rose", title: "Mid-term Curve Builder", path: "/mid_term_curves" },
]

export function AppSidebar() {
  const { user: currentUser } = useAuth()
  useEquinorFont()

  const adminItems: Item[] = currentUser?.is_superuser
    ? [{ icon: ShieldCheck, tone: "violet", title: "Admin", path: "/admin" }]
    : []

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-2 pb-1 pt-3 group-data-[collapsible=icon]:items-center">
        <div className="relative flex w-full flex-col items-center py-2 group-data-[collapsible=icon]:py-0">
          <div
            className="flex flex-col items-center group-data-[collapsible=icon]:hidden"
            style={{ fontFamily: "Equinor, sans-serif" }}
          >
            <span
              className="text-[26.4px] font-extrabold leading-none text-[#243746] dark:text-white"
              style={{ letterSpacing: "0.16em", paddingLeft: "0.16em" }}
            >
              LNG
            </span>
            <span
              className="mt-1.5 whitespace-nowrap text-[13.2px] font-bold uppercase leading-none"
              style={{ color: "#ff1243", letterSpacing: "0.14em", paddingLeft: "0.14em" }}
            >
              Fundamentals
            </span>
          </div>
          <SidebarTrigger className="absolute right-0 top-0 size-6 group-data-[collapsible=icon]:static group-data-[collapsible=icon]:size-8" />
        </div>
        <SidebarMenu style={{ marginBottom: 0 }}>
          <SidebarAppearance />
          <SidebarSeparator className="mx-0" />
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <Main items={baseItems} />
      </SidebarContent>
      <SidebarFooter>
        {adminItems.length > 0 && <Main items={adminItems} className="p-0" />}
        <User user={currentUser} />
      </SidebarFooter>
    </Sidebar>
  )
}

export default AppSidebar
