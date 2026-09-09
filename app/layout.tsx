import "./globals.css";

export const metadata = {
  title: "Plenova Pinterest Engine",
  description: "Generate Pinterest-ready plant content for Plenova.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
