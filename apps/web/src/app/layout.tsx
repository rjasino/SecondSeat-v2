import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Syne, JetBrains_Mono, Chakra_Petch } from "next/font/google";
import "./globals.css";

const syne = Syne({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-syne",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-jetbrains",
  display: "swap",
});

const chakraPetch = Chakra_Petch({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-chakra",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SecondSeat",
  description: "Second-screen AI companion for gamers.",
  icons: { icon: "/ss-512x512.png" },
};

export const viewport: Viewport = {
  themeColor: "#050508",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${syne.variable} ${jetbrainsMono.variable} ${chakraPetch.variable}`}>
      <body>{children}</body>
    </html>
  );
}
