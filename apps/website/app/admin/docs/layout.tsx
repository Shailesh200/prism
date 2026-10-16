import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { ReactNode } from "react";
import { adminSource } from "@/lib/source";
import { BrandLockup, GITHUB } from "@/lib/layout.shared";

export default function AdminDocsLayout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={adminSource.getPageTree()}
      nav={{
        title: (
          <span className="inline-flex items-center gap-2">
            <BrandLockup variant="mark" height={22} alt="" />
            Prism Admin Docs
          </span>
        ),
        url: "/admin",
      }}
      githubUrl={GITHUB}
      links={[{ text: "Dashboard", url: "/admin" }]}
    >
      {children}
    </DocsLayout>
  );
}
