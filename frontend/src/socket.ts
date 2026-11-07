import { io } from 'socket.io-client';

// One socket for the whole app; it survives page changes.
export const socket = io(import.meta.env.VITE_SERVER_URL || 'http://localhost:3000');

/** Run fn now if connected, and again after every reconnect (the server gets a new socket id). */
export function onConnected(fn: () => void): () => void {
  if (socket.connected) fn();
  socket.on('connect', fn);
  return () => {
    socket.off('connect', fn);
  };
}
