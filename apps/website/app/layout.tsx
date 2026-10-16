import { RootProvider } from "fumadocs-ui/provider/next";
import { Geist, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { ThemeSync } from "@/components/theme-sync";
import { PulseRoot } from "@/components/pulse-root";
import { JsonLd } from "@/components/json-ld";
import { rootMetadata, websiteJsonLd } from "@/lib/seo";
import "./global.css";
import "./paper.css";

const sans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
});

const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-serif",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = rootMetadata();

export const viewport: Viewport = {
  themeColor: "#F4F1EA",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${serif.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <body className="paper flex min-h-screen flex-col antialiased">
        <JsonLd data={websiteJsonLd()} />
        <RootProvider
          theme={{
            attribute: "class",
            defaultTheme: "light",
            enableSystem: false,
            forcedTheme: "light",
            disableTransitionOnChange: true,
          }}
        >
          <ThemeSync />
          <PulseRoot />
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
