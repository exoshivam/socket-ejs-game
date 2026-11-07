// sessionStorage state that the old EJS pages passed between page loads.

export interface Player {
  id?: string | null;
  name: string;
  avatar?: string;
  isHost?: boolean;
  connected?: boolean;
  totalScore?: number;
  seat?: number; // team rooms only
  team?: 'A' | 'B';
  bot?: boolean;
}
export interface RoomData {
  roomId: string;
  gameType?: 'callbreak' | 'teamcallbreak';
  type?: 'public' | 'private';
  phase?: string;
  maxPlayers?: number;
  players?: Player[];
  [key: string]: unknown;
}
export interface LocalPlayer {
  name: string;
  avatar: string;
}
export interface RankedPlayer {
  name: string;
  avatar?: string;
  totalScore: number;
}

function read<T>(key: string): T | null {
  try {
    return JSON.parse(sessionStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked: the app still works until reload */
  }
}

export const session = {
  roomData: () => read<RoomData>('roomData'),
  setRoomData: (v: RoomData | null) => write('roomData', v),
  localPlayer: () => read<LocalPlayer>('localPlayer'),
  setLocalPlayer: (v: LocalPlayer) => write('localPlayer', v),
  finalResults: () => read<{ roomId: string; rankedPlayers: RankedPlayer[] }>('finalResults'),
  /** Team rooms: seat token from tcb:session, used for tcb:rejoin. */
  tcbSession: () => read<{ roomId: string; seat: number; token: string }>('tcbSession'),
  setTcbSession: (v: { roomId: string; seat: number; token: string } | null) => write('tcbSession', v),
  setFinalResults: (v: { roomId: string; rankedPlayers: RankedPlayer[] }) => write('finalResults', v),
};

export const AVATAR_EMOJI: Record<string, string> = { warrior: '⚔️', mage: '🔮', rogue: '🗡️' };
