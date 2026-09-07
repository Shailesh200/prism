import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";
import type { Metadata } from "next";
import { PageEnter } from "@/components/motion/PageEnter";
import { SiteFooter } from "@/components/site-footer";
import { LegalDoc } from "@/components/legal-doc";

export const metadata: Metadata = {
  title: "Security",
  description: "How to report security issues in Prism.",
};

export default function SecurityPage() {
  return (
    <HomeLayout {...baseOptions()}>
      <PageEnter>
        <main className="mx-auto w-full max-w-3xl px-6 py-16">
          <p className="font-mono text-xs tracking-widest text-fd-primary">
            Nº SECURITY
          </p>
          <p className="mt-3 mb-10 max-w-2xl text-fd-muted-foreground">
            How to report a vulnerability. Prism does not run a public bug
            bounty.
          </p>
          <LegalDoc file="SECURITY.md" />
        </main>
      </PageEnter>
      <SiteFooter />
    </HomeLayout>
  );
}
