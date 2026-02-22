import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";

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
  const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const authEnabled = Boolean(clerkPublishableKey);

  const content = (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );

  if (!authEnabled) {
    return content;
  }

  return (
    <ClerkProvider publishableKey={clerkPublishableKey}>
      {content}
    </ClerkProvider>
  );
}
