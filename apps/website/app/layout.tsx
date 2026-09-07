import { RootProvider } from "fumadocs-ui/provider/next";
import { Inter, JetBrains_Mono, Syne } from "next/font/google";
import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { ThemeSync } from "@/components/theme-sync";
import { MotionChrome } from "@/components/motion/MotionChrome";
import { PulseRoot } from "@/components/pulse-root";
import { JsonLd } from "@/components/json-ld";
import { rootMetadata, websiteJsonLd } from "@/lib/seo";
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

export const metadata: Metadata = rootMetadata();

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0e1a" },
    { media: "(prefers-color-scheme: light)", color: "#f4f7f8" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`dark ${inter.variable} ${syne.variable} ${jetbrains.variable}`}
      suppressHydrationWarning
    >
      <body className="flex min-h-screen flex-col font-sans antialiased">
        <JsonLd data={websiteJsonLd()} />
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
          <PulseRoot />
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
