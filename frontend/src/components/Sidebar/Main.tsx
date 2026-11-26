import { Link as RouterLink, useRouterState } from "@tanstack/react-router"
import type { LucideIcon } from "lucide-react"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar"
import { IconTile, type IconTone } from "./IconTile"

export type Item =
  | {
      icon: LucideIcon
      tone: IconTone
      title: string
      path: string
    }
  | {
      type: "separator"
      key: string
    }

interface MainProps {
  items: Item[]
  className?: string
}

export function Main({ items, className }: MainProps) {
  const { isMobile, setOpenMobile } = useSidebar()
  const router = useRouterState()
  const currentPath = router.location.pathname

  const handleMenuClick = () => {
    if (isMobile) {
      setOpenMobile(false)
    }
  }

  return (
    <SidebarGroup className={className}>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            if ("type" in item) {
              return <SidebarSeparator key={item.key} />
            }

            // Section items (e.g. /news) stay highlighted on their child routes.
            const isActive =
              currentPath === item.path ||
              (item.path !== "/" && currentPath.startsWith(`${item.path}/`))

            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  tooltip={item.title}
                  isActive={isActive}
                  className="h-auto min-h-[33.6px] py-[7px] text-[13.2px] font-medium leading-tight [&>span:last-child]:overflow-visible [&>span:last-child]:whitespace-normal group-data-[collapsible=icon]:p-1! group-data-[collapsible=icon]:[&>span:last-child]:hidden"
                  asChild
                >
                  <RouterLink to={item.path} onClick={handleMenuClick}>
                    <IconTile icon={item.icon} tone={item.tone} />
                    <span>{item.title}</span>
                  </RouterLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
