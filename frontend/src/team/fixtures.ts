// Static data for building and screenshotting the team screens without a server.
// Dev only: open /waiting-room?fixture=team or /team-game?fixture=<name>.
import type { Player, RoomData } from '../session';
import type { Card, PlayedCard, RoundRecord, Suit, View } from '../../../shared/teamCallBreak.types.ts';


const lobbyPlayers: Player[] = [
  { id: 'a', name: 'Test', avatar: 'mage', isHost: true, connected: true, seat: 1, team: 'A' },
  { id: 'b', name: 'Riya', avatar: 'warrior', isHost: false, connected: true, seat: 2, team: 'B' },
  { id: 'c', name: 'Kabir', avatar: 'rogue', isHost: false, connected: true, seat: 3, team: 'A' },
  { id: 'd', name: 'Meera', avatar: 'mage', isHost: false, connected: false, seat: 4, team: 'B' },
  { id: 'e', name: 'Arjun', avatar: 'warrior', isHost: false, connected: true, seat: 6, team: 'B' },
];

export const FIXTURE_LOBBY: { room: RoomData; me: { name: string; avatar: string } } = {
  room: { roomId: 'TEAM6', gameType: 'teamcallbreak', type: 'private', phase: 'waiting', maxPlayers: 6, players: lobbyPlayers },
  me: { name: 'Test', avatar: 'mage' },
};

// ---------- Game Views (tcb:state) ----------

const c = (s: string): Card => ({ rank: s.slice(0, -1) as Card['rank'], suit: s.slice(-1) as Suit });
const cards = (list: string) => list.split(' ').map(c);
const played = (list: [number, string][]): PlayedCard[] => list.map(([seat, card]) => ({ seat, card: c(card) }));

const NAMES = ['Test', 'Riya', 'Kabir', 'Meera', 'Arjun', 'Zoya'];
const AVATARS = ['mage', 'warrior', 'rogue', 'mage', 'warrior', 'rogue'];

function base(mySeat: number, over: Partial<View> = {}): View {
  const choosing = over.phase === 'choosingPath' || over.phase === 'choosingTrump';
  return {
    roomId: 'TEAM6',
    phase: 'playing',
    round: 2,
    mySeat,
    myHand: [],
    myHiddenCount: 0,
    seats: NAMES.map((name, i) => ({
      seat: i + 1,
      team: i % 2 === 0 ? 'A' : 'B',
      name,
      avatar: AVATARS[i],
      connected: true,
      bot: false,
      cardCount: 8,
      tricks: 0,
    })),
    chooser: 2,
    choosingTeam: 'B',
    path: null,
    openedCards: null,
    trump: null,
    targets: { choosing: { draw: 5, win: 6 }, defending: { draw: 3, win: 4 } },
    trick: { leader: 2, cards: [] },
    lastTrick: null,
    legalCards: [],
    trumpOptions: [],
    roundTricks: { A: 0, B: 0 },
    match: {
      points: { A: 1, B: 0 },
      tricks: { A: 6, B: 2 },
      rounds: [{ round: 1, choosingTeam: 'A', chooser: 1, path: 'A', trump: '♠', tricks: { A: 6, B: 2 }, result: 'A' }],
      winner: null,
      decidedBy: null,
    },
    paused: null,
    nextRoundAt: null,
    trickHoldUntil: null,
    ...over,
    // The chooser is the active seat while trump is being chosen.
    activeSeat: over.activeSeat !== undefined ? over.activeSeat : choosing ? (over.chooser ?? 2) : null,
  };
}
const withSeats = (v: View, f: (s: View['seats'][number]) => Partial<View['seats'][number]>) => ({
  ...v,
  seats: v.seats.map(s => ({ ...s, ...f(s) })),
});
const five = (v: View) => withSeats(v, () => ({ cardCount: 5 }));

const ROUNDS: RoundRecord[] = [
  { round: 1, choosingTeam: 'A', chooser: 1, path: 'A', trump: '♠', tricks: { A: 6, B: 2 }, result: 'A' },
  { round: 2, choosingTeam: 'B', chooser: 2, path: 'B', trump: '♥', tricks: { A: 4, B: 4 }, result: 'A' },
  { round: 3, choosingTeam: 'A', chooser: 3, path: 'A', trump: '♦', tricks: { A: 5, B: 3 }, result: 'draw' },
  { round: 4, choosingTeam: 'B', chooser: 4, path: 'A', trump: '♣', tricks: { A: 1, B: 7 }, result: 'B' },
  { round: 5, choosingTeam: 'A', chooser: 5, path: 'B', trump: '♠', tricks: { A: 4, B: 4 }, result: 'B' },
];

export const FIXTURE_VIEWS: Record<string, () => View> = {
  // Round 2: P2 (Team B) chooses.
  pathChooser: () => five(base(2, { phase: 'choosingPath', myHand: cards('A♥ 10♥ K♣ 7♦ 4♠') })),
  pathTeammate: () => five(base(4, { phase: 'choosingPath', myHand: [], myHiddenCount: 5 })),
  pathDefender: () => five(base(1, { phase: 'choosingPath', myHand: cards('Q♠ 9♠ J♦ 8♣ 3♥') })),
  trumpA: () => five(base(2, { phase: 'choosingTrump', path: 'A', myHand: cards('A♥ 10♥ K♣ 7♦ 4♦'), trumpOptions: ['♥', '♣', '♦'] })),
  trumpB: () => base(2, { phase: 'choosingTrump', path: 'B', myHand: cards('A♥ 10♥ K♣ 7♦ 4♠'), openedCards: cards('Q♦ 6♥ 9♦'), trumpOptions: ['♦', '♥'] }),
  trumpBTeammate: () =>
    base(4, { phase: 'choosingTrump', path: 'B', myHand: cards('K♠ J♠ 5♥ 10♣ 3♦'), myHiddenCount: 3, openedCards: cards('Q♦ 6♥ 9♦') }),
  trumpBDefender: () => base(1, { phase: 'choosingTrump', path: 'B', myHand: cards('Q♠ 9♠ J♦ 8♣ 3♥ A♣ 7♠ 5♦'), openedCards: cards('Q♦ 6♥ 9♦') }),
  playMyTurn: () =>
    withSeats(
      base(1, {
        phase: 'playing',
        path: 'B',
        trump: '♥',
        myHand: cards('Q♠ 9♠ J♦ 8♣ 3♥ A♣'),
        trick: { leader: 4, cards: played([[4, 'K♣'], [5, '10♣'], [6, '4♣']]) },
        activeSeat: 1,
        legalCards: cards('8♣ A♣'),
        roundTricks: { A: 1, B: 1 },
      }),
      s => ({ cardCount: s.seat >= 4 ? 5 : 6, tricks: s.seat === 2 ? 1 : s.seat === 3 ? 1 : 0 }),
    ),
  playOtherPaused: () =>
    withSeats(
      base(1, {
        phase: 'playing',
        path: 'A',
        trump: '♦',
        myHand: cards('Q♠ 9♠ J♦ 8♣ 3♥'),
        trick: { leader: 2, cards: played([[2, '7♠'], [3, 'A♠']]) },
        activeSeat: 4,
        roundTricks: { A: 2, B: 1 },
        paused: { seats: [4], deadline: Date.now() + 47_000 },
      }),
      s => ({
        cardCount: s.seat === 2 || s.seat === 3 ? 4 : 5,
        tricks: [0, 1, 0, 1, 1, 0][s.seat - 1],
        connected: s.seat !== 4,
        bot: s.seat === 6,
      }),
    ),
  // Trick hold: all 6 cards stay on the felt, P5's trump won it, hand disabled.
  trickEnd: () =>
    withSeats(
      base(3, {
        phase: 'trickEnd',
        path: 'A',
        trump: '♠',
        myHand: cards('K♥ 9♦ 6♣ 3♠'),
        lastTrick: { winner: 5, cards: played([[2, '10♦'], [3, '9♦'], [4, 'A♦'], [5, '4♠'], [6, 'J♦'], [1, '5♦']]) },
        trick: { leader: 2, cards: played([[2, '10♦'], [3, '9♦'], [4, 'A♦'], [5, '4♠'], [6, 'J♦'], [1, '5♦']]) },
        activeSeat: null,
        trickHoldUntil: Date.now() + 3_000,
        roundTricks: { A: 3, B: 1 },
      }),
      s => ({ cardCount: 4, tricks: [1, 1, 1, 0, 1, 0][s.seat - 1] }),
    ),
  roundEnd: () =>
    withSeats(
      base(1, {
        phase: 'roundEnd',
        path: 'B',
        trump: '♥',
        roundTricks: { A: 4, B: 4 },
        nextRoundAt: Date.now() + 6_000,
        match: { points: { A: 2, B: 0 }, tricks: { A: 10, B: 6 }, rounds: ROUNDS.slice(0, 2), winner: null, decidedBy: null },
      }),
      s => ({ cardCount: 0, tricks: [2, 1, 1, 2, 1, 1][s.seat - 1] }),
    ),
  matchEnd: () =>
    withSeats(
      base(1, {
        phase: 'matchEnd',
        round: 5,
        chooser: 5,
        choosingTeam: 'A',
        path: 'B',
        trump: '♠',
        roundTricks: { A: 4, B: 4 },
        match: { points: { A: 2, B: 2 }, tricks: { A: 20, B: 20 }, rounds: ROUNDS, winner: 'draw', decidedBy: 'draw' },
      }),
      s => ({ cardCount: 0, tricks: [2, 1, 1, 2, 1, 1][s.seat - 1] }),
    ),
  matchEndTricks: () =>
    withSeats(
      base(2, {
        phase: 'matchEnd',
        round: 5,
        chooser: 5,
        choosingTeam: 'A',
        path: 'B',
        trump: '♠',
        roundTricks: { A: 3, B: 5 },
        match: {
          points: { A: 2, B: 2 },
          tricks: { A: 19, B: 21 },
          rounds: ROUNDS.map((r, i) => (i === 4 ? { ...r, tricks: { A: 3, B: 5 } } : r)),
          winner: 'B',
          decidedBy: 'tricks',
        },
      }),
      s => ({ cardCount: 0, tricks: [1, 2, 1, 2, 1, 1][s.seat - 1] }),
    ),
};
