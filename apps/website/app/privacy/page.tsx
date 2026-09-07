import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";
import type { Metadata } from "next";
import { PageEnter } from "@/components/motion/PageEnter";
import { SiteFooter } from "@/components/site-footer";
import { LegalDoc } from "@/components/legal-doc";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "Analysis makes zero network calls. Optional features are consent-gated. None send source.",
};

export default function PrivacyPage() {
  return (
    <HomeLayout {...baseOptions()}>
      <PageEnter>
        <main className="mx-auto w-full max-w-3xl px-6 py-16">
          <p className="font-mono text-xs tracking-widest text-fd-primary">
            Nº PRIVACY
          </p>
          <p className="mt-3 mb-10 max-w-2xl text-fd-muted-foreground">
            Analysis stays on your machine. Optional features are consent-gated;
            none send source.
          </p>
          <LegalDoc file="PRIVACY.md" />
        </main>
      </PageEnter>
      <SiteFooter />
    </HomeLayout>
  );
}
