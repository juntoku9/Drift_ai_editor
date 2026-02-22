"use client";

import { useEffect } from "react";
import { useUser } from "@clerk/nextjs";

interface UserInfo {
  id?: string;
  name?: string;
  avatarUrl?: string;
  handle?: string;
}

interface Props {
  onUser: (info: UserInfo | null) => void;
}

/** Calls useUser() and forwards the result via callback.
 *  Loaded via next/dynamic with ssr:false so it only runs client-side,
 *  safely inside ClerkProvider, even when auth is optional. */
export function ClerkUserSync({ onUser }: Props) {
  const { user } = useUser();
  useEffect(() => {
    if (!user) { onUser(null); return; }
    onUser({
      id: user.id,
      name: user.fullName ?? user.username ?? user.primaryEmailAddress?.emailAddress ?? undefined,
      avatarUrl: user.imageUrl,
      handle: user.username ? `@${user.username}` : undefined,
    });
  }, [user, onUser]);
  return null;
}
