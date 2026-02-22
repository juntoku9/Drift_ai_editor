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

  const body = (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );

  // Always wrap with ClerkProvider when a key is present so that useUser()
  // is never called outside a provider. When no key is configured the app
  // runs without auth and useUser() returns { user: null }.
  if (clerkPublishableKey) {
    return <ClerkProvider publishableKey={clerkPublishableKey}>{body}</ClerkProvider>;
  }

  return body;
}
