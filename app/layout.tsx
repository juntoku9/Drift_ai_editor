import type { Metadata } from "next";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Drift - See How Meaning Moves",
  description: "Semantic diff for collaborative documents."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
