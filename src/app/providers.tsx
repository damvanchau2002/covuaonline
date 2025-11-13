"use client";
import { SessionProvider, useSession } from "next-auth/react";
import React from "react";
import { useEffect } from "react";
import { getSocket } from "@/lib/socket";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <IdentifyUpdater />
      {children}
    </SessionProvider>
  );
}

function IdentifyUpdater() {
  const { data: session, status } = useSession();
  useEffect(() => {
    if (status !== 'authenticated') return;
    const s = getSocket();
    const username = (session as any)?.username || session?.user?.name || 'Khách';
    const emitId = () => { try { s.emit('identify', { username }); } catch {} };
    emitId();
    s.on('connect', emitId);
    return () => { s.off('connect', emitId); };
  }, [session, status]);
  return null;
}