import { DocsLayout } from "fumadocs-ui/layouts/notebook";
import type { ReactNode } from "react";
import { DocsHostHeader, DocsSidebarBanner } from "@/components/docs-chrome";
import { baseOptions } from "@/lib/layout.shared";
import { source } from "@/lib/source";

export default function Layout({ children }: { children: ReactNode }) {
  const base = baseOptions();
  return (
    <DocsLayout
      tree={source.getPageTree()}
      {...base}
      tabMode="sidebar"
      nav={{
        ...base.nav,
        mode: "top",
      }}
      sidebar={{
        collapsible: true,
        banner: DocsSidebarBanner,
      }}
      slots={{
        header: DocsHostHeader,
      }}
      containerProps={{
        className: "[--fd-header-height:3.5rem]",
      }}
    >
      {children}
    </DocsLayout>
  );
}
