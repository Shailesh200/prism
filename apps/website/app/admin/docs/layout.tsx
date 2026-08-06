import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { ReactNode } from "react";
import { adminSource } from "@/lib/source";
import { GITHUB } from "@/lib/layout.shared";

export default function AdminDocsLayout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={adminSource.getPageTree()}
      nav={{
        title: "Prism Admin Docs",
        url: "/admin",
      }}
      githubUrl={GITHUB}
      links={[{ text: "Dashboard", url: "/admin" }]}
    >
      {children}
    </DocsLayout>
  );
}
