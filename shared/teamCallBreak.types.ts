// Team Call Break wire contract (docs/PRD-team-call-break.md §5). Types only: import with `import type`.

export type Suit = '♠' | '♥' | '♦' | '♣';
export type Rank = 'A' | 'K' | 'Q' | 'J' | '10' | '9' | '8' | '7' | '6' | '5' | '4' | '3';
export interface Card { suit: Suit; rank: Rank }
export type Team = 'A' | 'B';
export type Path = 'A' | 'B';
export type GameType = 'callbreak' | 'teamcallbreak';
export type RoomType = 'public' | 'private';
export type Phase = 'choosingPath' | 'choosingTrump' | 'playing' | 'trickEnd' | 'roundEnd' | 'matchEnd';
// trickEnd: the completed trick stays in trick.cards (6 cards), winner in lastTrick, until trickHoldUntil.
export type RoomPhase = 'waiting' | Phase;

export interface SeatView {
  seat: number; // 1..6
  team: Team;
  name: string;
  avatar: string;
  connected: boolean;
  bot: boolean;
  cardCount: number;
  tricks: number; // this round
}

export interface PlayedCard { seat: number; card: Card }

export interface RoundRecord {
  round: number;
  choosingTeam: Team;
  chooser: number;
  path: Path;
  trump: Suit;
  tricks: { A: number; B: number };
  result: Team | 'draw';
}

export interface View {
  roomId: string;
  phase: Phase;
  round: number; // 1..5
  mySeat: number;
  myHand: Card[]; // only cards this seat may see
  myHiddenCount: number; // cards held face-down (never sent)
  seats: SeatView[]; // ordered P1..P6
  chooser: number;
  choosingTeam: Team;
  path: Path | null;
  openedCards: Card[] | null; // Path B, until trump is announced
  trump: Suit | null;
  targets: { choosing: { draw: 5; win: 6 }; defending: { draw: 3; win: 4 } };
  trick: { leader: number; cards: PlayedCard[] };
  lastTrick: { winner: number; cards: PlayedCard[] } | null;
  activeSeat: number | null;
  legalCards: Card[]; // non-empty only when it's my turn to play
  trumpOptions: Suit[]; // non-empty only when I'm the chooser naming trump
  roundTricks: { A: number; B: number };
  match: {
    points: { A: number; B: number };
    tricks: { A: number; B: number };
    rounds: RoundRecord[];
    winner: Team | 'draw' | null;
    decidedBy: 'points' | 'tricks' | 'draw' | null;
  };
  paused: { seats: number[]; deadline: number } | null; // deadline = epoch ms of the earliest bot takeover
  nextRoundAt: number | null; // epoch ms, roundEnd only
  trickHoldUntil: number | null; // epoch ms, trickEnd only: when the trick is collected and play goes on
}

/** Lobby player as sent in updatePlayers / roomJoined. seat/team/bot only in team rooms. Never carries the token. */
export interface LobbyPlayer {
  id: string | null;
  name: string;
  avatar: string;
  isHost: boolean;
  connected: boolean;
  seat?: number;
  team?: Team;
  bot?: boolean;
}

export interface LobbyRoom {
  roomId: string;
  gameType: GameType;
  type: RoomType;
  maxPlayers: 4 | 6;
  phase: RoomPhase | 'playing'; // 4p rooms report 'waiting' | 'playing'
  players: LobbyPlayer[];
}

// Client -> server payloads
export interface CreateRoomPayload { name: string; avatar: string; gameType: GameType; type: RoomType }
export interface QuickPlayPayload { name: string; avatar: string; gameType: GameType }
export interface JoinRoomPayload { roomId: string; name: string; avatar: string }
export interface RejoinPayload { roomId: string; token: string }
export interface MoveSeatPayload { roomId: string; seat: number }
export interface SwapSeatsPayload { roomId: string; a: number; b: number }
export interface RoomOnlyPayload { roomId: string } // tcb:start, tcb:rematch, tcb:leave
export interface ChoosePathPayload { roomId: string; path: Path }
export interface ChooseTrumpPayload { roomId: string; suit: Suit }
export interface PlayCardPayload { roomId: string; card: Card }

// Server -> client payloads
export interface SessionPayload { roomId: string; seat: number; token: string } // tcb:session

export interface ClientToServer {
  createRoom: CreateRoomPayload;
  quickPlay: QuickPlayPayload;
  joinRoom: JoinRoomPayload;
  'tcb:rejoin': RejoinPayload;
  'tcb:leave': RoomOnlyPayload;
  'tcb:moveSeat': MoveSeatPayload;
  'tcb:swapSeats': SwapSeatsPayload;
  'tcb:start': RoomOnlyPayload;
  'tcb:choosePath': ChoosePathPayload;
  'tcb:chooseTrump': ChooseTrumpPayload;
  'tcb:playCard': PlayCardPayload;
  'tcb:rematch': RoomOnlyPayload;
}

export interface ServerToClient {
  roomJoined: LobbyRoom;
  updatePlayers: LobbyPlayer[];
  errorMsg: string;
  systemMessage: string;
  'tcb:session': SessionPayload;
  'tcb:state': View;
}
