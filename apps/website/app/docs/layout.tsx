import { DocsLayout } from "fumadocs-ui/layouts/notebook";
import type { ReactNode } from "react";
import { DocsMobileBar, DocsSidebarBanner } from "@/components/docs-chrome";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteNav } from "@/components/site/site-nav";
import { source } from "@/lib/source";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="docs-shell">
      <SiteNav />
      <DocsLayout
        tree={source.getPageTree()}
        nav={{ enabled: true, mode: "top" }}
        tabs={false}
        searchToggle={{ enabled: false }}
        themeSwitch={{ enabled: false }}
        sidebar={{
          collapsible: false,
          banner: DocsSidebarBanner,
        }}
        slots={{ header: DocsMobileBar }}
        containerProps={{ className: "docs-frame" }}
      >
        {children}
      </DocsLayout>
      <SiteFooter />
    </div>
  );
}
