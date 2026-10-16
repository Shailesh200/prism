import type { ReactNode } from "react";
import { DocsChrome } from "@/components/paper/docs-chrome";
import { Shell } from "@/components/paper/shell";

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <Shell>
      <DocsChrome>{children}</DocsChrome>
    </Shell>
  );
}
