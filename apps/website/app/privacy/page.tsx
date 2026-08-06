import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";

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
      <main className="mx-auto w-full max-w-3xl px-6 py-16">
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-fd-muted-foreground">
          {text}
        </pre>
      </main>
    </HomeLayout>
  );
}
