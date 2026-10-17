import { RootProvider } from "fumadocs-ui/provider/next";
import {
  Geist,
  Inter,
  Instrument_Serif,
  JetBrains_Mono,
} from "next/font/google";
import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { PulseRoot } from "@/components/pulse-root";
import { JsonLd } from "@/components/json-ld";
import { rootMetadata, websiteJsonLd } from "@/lib/seo";
import "./global.css";

const instrument = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-instrument",
});

const geist = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains",
});

/** Wordmark only. */
const inter = Inter({
  subsets: ["latin"],
  weight: "600",
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = rootMetadata();

export const viewport: Viewport = {
  themeColor: "#f4f1ea",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="light"
      className={`${instrument.variable} ${geist.variable} ${jetbrains.variable} ${inter.variable}`}
    >
      <body className="flex min-h-screen flex-col antialiased">
        <JsonLd data={websiteJsonLd()} />
        <RootProvider theme={{ enabled: false }}>
          <PulseRoot />
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
