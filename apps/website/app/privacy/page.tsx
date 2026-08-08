import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import { PageEnter } from "@/components/motion/PageEnter";

export const metadata: Metadata = {
  title: "Privacy",
  description: "Prism privacy policy — local-first, no telemetry by default.",
};

export default async function PrivacyPage() {
  const text = await readFile(
    path.join(process.cwd(), "../../PRIVACY.md"),
    "utf8",
  );
  return (
    <HomeLayout {...baseOptions()}>
      <PageEnter>
        <main className="mx-auto w-full max-w-3xl px-6 py-16">
          <p className="mb-6 font-mono text-xs tracking-widest text-fd-primary">
            Nº PRIVACY
          </p>
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-fd-muted-foreground">
            {text}
          </pre>
        </main>
      </PageEnter>
    </HomeLayout>
  );
}
