import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Sidebar } from "@/components/layout/Sidebar";
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className={inter.variable}>
      <body className="min-h-dvh">
        <div className="md:flex">
          <Sidebar />
          <main className="min-w-0 flex-1 px-5 py-8 md:px-10 md:py-12">
            {/*
              Narrower than it was. A form field stretched across a wide screen
              is harder to read, not more generous: the eye has to travel the
              width of the window to get from a label to its value.
            */}
            <div className="mx-auto max-w-5xl">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
