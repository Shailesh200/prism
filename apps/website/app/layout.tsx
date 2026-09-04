import { RootProvider } from "fumadocs-ui/provider/next";
import { Inter, JetBrains_Mono, Syne } from "next/font/google";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { ThemeSync } from "@/components/theme-sync";
import { MotionChrome } from "@/components/motion/MotionChrome";
import "./global.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-display",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: {
    default: "Prism",
    template: "%s · Prism",
  },
  description:
    "Local-first software intelligence — no AI required. Maps, graphs, impact and health on your machine.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.prismhq.in",
  ),
};

/**
 * Structured data for crawlers and answer engines. Keep every field literally
 * true: the claims here (free, local-first, surfaces) match the docs, and an
 * inaccurate schema is worse than none.
 */
function jsonLd() {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.prismhq.in";
  return JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        name: "Prism",
        url: site,
        description:
          "Local-first software intelligence — maps, graphs, impact and health on your machine.",
      },
      {
        "@type": "SoftwareApplication",
        name: "Prism",
        url: site,
        applicationCategory: "DeveloperApplication",
        operatingSystem: ["macOS", "Windows", "Linux"],
        offers: { "@type": "Offer", price: 0, priceCurrency: "USD" },
        description:
          "Local-first software intelligence engine. Repository maps, dependency graphs, blast radius, and health — exposed as a CLI, IDE extensions, and an MCP server for AI agents. Analysis makes no network calls.",
        featureList: [
          "Repository map and DNA",
          "Blast radius and impact analysis",
          "Engineering health tracking",
          "MCP server with 41 tools for AI agents",
          "Dispatch background teammates",
          "CLI for terminals and CI",
          "VS Code and Cursor extensions",
        ],
      },
    ],
  });
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`dark ${inter.variable} ${syne.variable} ${jetbrains.variable}`}
      suppressHydrationWarning
    >
      <body className="flex min-h-screen flex-col font-sans antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd() }}
        />
        <RootProvider
          theme={{
            attribute: "class",
            defaultTheme: "dark",
            enableSystem: true,
            disableTransitionOnChange: true,
          }}
        >
          <ThemeSync />
          <MotionChrome />
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
