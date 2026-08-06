import { RootProvider } from "fumadocs-ui/provider/next";
import { Inter, JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { ThemeSync } from "@/components/theme-sync";
import "./global.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
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
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`dark ${inter.variable} ${jetbrains.variable}`}
      suppressHydrationWarning
    >
      <body className="flex min-h-screen flex-col font-sans antialiased">
        <RootProvider
          theme={{
            attribute: "class",
            defaultTheme: "dark",
            enableSystem: true,
            disableTransitionOnChange: true,
          }}
        >
          <ThemeSync />
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
