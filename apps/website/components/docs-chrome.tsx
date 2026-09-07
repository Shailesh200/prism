"use client";

import { buttonVariants } from "fumadocs-ui/components/ui/button";
import { HomeLayout } from "fumadocs-ui/layouts/home";
import {
  SidebarCollapseTrigger,
  SidebarTrigger,
} from "fumadocs-ui/layouts/notebook/slots/sidebar";
import { Sidebar } from "lucide-react";
import type { ComponentProps } from "react";
import { baseOptions } from "@/lib/layout.shared";

function HostBar({ children }: ComponentProps<"main">) {
  return (
    <div className="h-14 [grid-area:header] [--fd-layout-width:1400px]">
      <div className="fixed inset-x-0 top-0 z-40 [--fd-layout-width:1400px]">
        {children}
      </div>
    </div>
  );
}

function MobileDocsTrigger() {
  return (
    <SidebarTrigger
      className={buttonVariants({
        color: "ghost",
        size: "icon-sm",
        className: "text-fd-muted-foreground md:hidden",
      })}
    >
      <Sidebar />
      <span className="sr-only">Open docs sidebar</span>
    </SidebarTrigger>
  );
}

/**
 * Products-matching host bar. Rendered as the notebook header so it sits in
 * the same grid as the sidebar — collapse stays on the sidebar, not here.
 */
export function DocsHostHeader() {
  const base = baseOptions();
  return (
    <HomeLayout
      {...base}
      nav={{
        ...base.nav,
        children: <MobileDocsTrigger />,
      }}
      slots={{ container: HostBar }}
    />
  );
}

export function DocsSidebarBanner(props: ComponentProps<"div">) {
  return (
    <div
      {...props}
      className={`flex flex-col gap-3 p-4 pb-2 empty:hidden ${props.className ?? ""}`}
    >
      <div className="flex items-center justify-between">
        <span className="font-medium">Docs</span>
        <SidebarCollapseTrigger
          className={buttonVariants({
            color: "ghost",
            size: "icon-sm",
            className: "text-fd-muted-foreground max-md:hidden",
          })}
        >
          <Sidebar />
          <span className="sr-only">Collapse sidebar</span>
        </SidebarCollapseTrigger>
      </div>
      {props.children}
    </div>
  );
}
