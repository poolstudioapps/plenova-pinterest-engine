import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

/*
 * plenova.fr is set in Inter Variable. Loading it through next/font rather
 * than a stylesheet link keeps it self-hosted and removes the render-blocking
 * request, and the CSS variable is what --font-sans points at in globals.css.
 */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Plenova Studio",
  description:
    "Rédiger, illustrer et publier les contenus Plenova sur Pinterest et TikTok.",
  robots: { index: false, follow: false },
};

/**
 * Deliberately bare: html, body, the font, nothing else.
 *
 * Every piece of the interface - the sidebar, the content column - belongs to
 * the (dashboard) group, which only signed-in pages sit inside. The login and
 * legal pages share this root and therefore show none of it.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className={inter.variable}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
