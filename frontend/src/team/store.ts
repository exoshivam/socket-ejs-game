// Team Call Break client state. The server is authoritative: we keep the last
// tcb:state View it sent and render it. No rules code lives on the client.
import { useSyncExternalStore } from 'react';
import type { SessionPayload, View } from '../../../shared/teamCallBreak.types.ts';
import { onConnected, socket } from '../socket';
import { session } from '../session';
import { navigate } from '../router';

export type { View } from '../../../shared/teamCallBreak.types.ts';

let view: View | null = null;
let fixture = false; // static fixture views (dev) ignore the socket
const subs = new Set<() => void>();
const notify = () => subs.forEach(fn => fn());

// Socket id that received the current seat token; a different id means we must rejoin.
let tokenSocketId: string | undefined;

socket.on('tcb:state', (v: View) => {
  if (fixture) return;
  view = v;
  notify();
});
socket.on('tcb:session', (p: SessionPayload) => {
  session.setTcbSession(p);
  tokenSocketId = socket.id;
});
// A stale or wrong token: our seat is gone, so drop the team session and go home.
socket.on('errorMsg', (msg: string) => {
  if (msg !== 'Seat not found' || !session.tcbSession()) return;
  session.setTcbSession(null);
  session.setRoomData(null);
  view = null;
  notify();
  navigate('/');
});

/** Free the seat (waiting/matchEnd) or hand it to the bot timer (mid-match), then go home. */
export function leaveTeamRoom(roomId: string) {
  if (!fixture) socket.emit('tcb:leave', { roomId });
  session.setTcbSession(null);
  session.setRoomData(null);
  view = null;
  fixture = false;
  notify();
  navigate('/');
}

export function setView(v: View | null, isFixture = false) {
  fixture = isFixture;
  view = v;
  notify();
}

export function useTcbView(): View | null {
  return useSyncExternalStore(
    fn => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    () => view,
  );
}

/**
 * Reclaim our seat with the token after a reload or reconnect (server matches
 * by token, not by name). Use as useEffect(() => rejoinTeamRoom(roomId), [roomId]).
 */
export function rejoinTeamRoom(roomId: string): () => void {
  return onConnected(() => {
    const t = session.tcbSession();
    if (fixture || !t || t.roomId !== roomId || socket.id === tokenSocketId) return;
    socket.emit('tcb:rejoin', { roomId, token: t.token });
  });
}

export const SUIT_NAME: Record<string, string> = { '♠': 'Spades', '♥': 'Hearts', '♦': 'Diamonds', '♣': 'Clubs' };
export const teamOfSeat = (seat: number): 'A' | 'B' => (seat % 2 === 1 ? 'A' : 'B');
