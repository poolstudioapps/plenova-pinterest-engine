import type { Metadata } from "next";
import { Sidebar } from "@/components/layout/Sidebar";
import "./globals.css";

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
    <html lang="fr">
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
