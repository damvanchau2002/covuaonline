"use client";
import { io } from 'socket.io-client';

type ClientSocket = ReturnType<typeof io>;
let socket: ClientSocket | null = null;

type SocketOpts = {
  url?: string;
  authToken?: string;
};

export function getSocket(opts: SocketOpts = {}) {
  if (!socket) {
    const url = opts.url || process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000';
    socket = io(url, {
      // Prefer pure WebSocket for lowest latency
      transports: ['websocket'],
      upgrade: false,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 600,
      timeout: 5000,
      auth: opts.authToken ? { token: opts.authToken } : undefined,
    });
    // basic diagnostics
    socket.on('connect', () => {
      // eslint-disable-next-line no-console
      console.log('[socket] connected', socket?.id);
    });
    socket.on('disconnect', (reason: unknown) => {
      // eslint-disable-next-line no-console
      console.warn('[socket] disconnected:', reason);
    });
    socket.on('connect_error', (err: unknown) => {
      // eslint-disable-next-line no-console
      const msg = (err as any)?.message ?? String(err);
      console.error('[socket] connect_error:', msg);
    });
  }
  return socket as ClientSocket;
}

export function closeSocket() {
  try {
    socket?.disconnect();
  } finally {
    socket = null;
  }
}