import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";
import type { Metadata } from "next";
import { PageEnter } from "@/components/motion/PageEnter";
import { SiteFooter } from "@/components/site-footer";
import { LegalDoc } from "@/components/legal-doc";

export const metadata: Metadata = {
  title: "Privacy",
  description: "Prism privacy policy — local-first, no telemetry by default.",
};

export default function PrivacyPage() {
  return (
    <HomeLayout {...baseOptions()}>
      <PageEnter>
        <main className="mx-auto w-full max-w-3xl px-6 py-16">
          <p className="mb-6 font-mono text-xs tracking-widest text-fd-primary">
            Nº PRIVACY
          </p>
          <LegalDoc file="PRIVACY.md" />
        </main>
      </PageEnter>
      <SiteFooter />
    </HomeLayout>
  );
}
