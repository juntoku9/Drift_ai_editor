import type { Metadata } from "next";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Drift - Understand Decision Drift Across Every Document Revision",
  description: "AI document manager that tracks how business plans, product PRDs, and projects evolve over time and who drives those changes."
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
