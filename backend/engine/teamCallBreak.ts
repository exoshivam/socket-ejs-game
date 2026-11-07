// Team Call Break rules engine (docs/RULES.md). Pure: no sockets, timers or Math.random; rng is injected.
// Actions never mutate their input: they return { state } (a new object) or { error }.

import type { Card, Suit, Team, Path, Phase, PlayedCard, RoundRecord, View } from '../../shared/teamCallBreak.types.ts';

export const SEATS = 6;
export const ROUNDS = 5;
export const FIRST_DEAL = 5;
export const HAND_SIZE = 8;
export const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];
export const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const; // low -> high, no 2s (§3)
const TARGETS = { choosing: { draw: 5, win: 6 }, defending: { draw: 3, win: 4 } } as const;

export type Rng = () => number; // uniform in [0, 1)

export interface SeatPlayer { name: string; avatar: string; connected: boolean; bot: boolean }

export interface State {
  roomId: string;
  players: SeatPlayer[]; // index = seat - 1; connected/bot are owned by the server
  phase: Phase;
  round: number;
  chooser: number;
  path: Path | null;
  trump: Suit | null;
  hands: Card[][]; // index = seat - 1. Before trump: [0..4] first deal, [5..7] second deal
  trick: { leader: number; cards: PlayedCard[] };
  lastTrick: { winner: number; cards: PlayedCard[] } | null;
  tricksWon: number[]; // this round, index = seat - 1
  match: View['match'];
}

export type Action =
  | { type: 'path'; path: Path }
  | { type: 'trump'; suit: Suit }
  | { type: 'play'; card: Card };

export type Result = { state: State; error?: undefined } | { error: string; state?: undefined };

// ---- basics

export const teamOf = (seat: number): Team => (seat % 2 === 1 ? 'A' : 'B'); // §4
export const nextSeat = (seat: number) => (seat % SEATS) + 1;
export const rankValue = (c: Card) => RANKS.indexOf(c.rank as (typeof RANKS)[number]);
export const sameCard = (a: Card, b: Card) => a.suit === b.suit && a.rank === b.rank;
const has = (cards: Card[], c: Card) => cards.some(x => sameCard(x, c));
const choosingTeamOf = (round: number): Team => (round % 2 === 1 ? 'A' : 'B'); // §5
const err = (error: string): Result => ({ error });

export function createDeck(): Card[] {
  return SUITS.flatMap(suit => RANKS.map(rank => ({ suit, rank })));
}

export function shuffle<T>(list: T[], rng: Rng): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 8 cards per seat: the first 5 are the first deal, the last 3 the reserve (§6). */
export function deal(rng: Rng): Card[][] {
  const deck = shuffle(createDeck(), rng);
  return Array.from({ length: SEATS }, (_, i) => deck.slice(i * HAND_SIZE, (i + 1) * HAND_SIZE));
}

// ---- match / round lifecycle

export function newMatch(roomId: string, players: { name: string; avatar: string }[], rng: Rng): State {
  if (players.length !== SEATS) throw new Error(`Team Call Break needs exactly ${SEATS} players`);
  const state: State = {
    roomId,
    players: players.map(p => ({ name: p.name, avatar: p.avatar, connected: true, bot: false })),
    phase: 'choosingPath',
    round: 0,
    chooser: 1,
    path: null,
    trump: null,
    hands: [],
    trick: { leader: 1, cards: [] },
    lastTrick: null,
    tricksWon: [],
    match: { points: { A: 0, B: 0 }, tricks: { A: 0, B: 0 }, rounds: [], winner: null, decidedBy: null },
  };
  return startRound(state, 1, rng);
}

function startRound(s: State, round: number, rng: Rng): State {
  s.round = round;
  s.chooser = round; // §5: round n -> Player n
  s.phase = 'choosingPath';
  s.path = null;
  s.trump = null;
  s.hands = deal(rng);
  s.trick = { leader: s.chooser, cards: [] };
  s.lastTrick = null;
  s.tricksWon = Array(SEATS).fill(0);
  return s;
}

/** roundEnd -> next round. Called by the server after the round-result pause. */
export function nextRound(state: State, rng: Rng): Result {
  if (state.phase !== 'roundEnd') return err('Round is not over');
  return { state: startRound(structuredClone(state), state.round + 1, rng) };
}

// ---- trump selection (§7)

export function trumpOptions(s: State, seat: number): Suit[] {
  if (s.phase !== 'choosingTrump' || seat !== s.chooser) return [];
  const from = s.path === 'A' ? s.hands[seat - 1].slice(0, FIRST_DEAL) : s.hands[seat - 1].slice(FIRST_DEAL);
  return SUITS.filter(suit => from.some(c => c.suit === suit));
}

export function choosePath(state: State, seat: number, path: Path): Result {
  if (seat !== state.chooser) return err('Only the chooser can choose (§14)');
  if (state.phase === 'choosingTrump' && state.path === 'B') return err('Path B is final (§7.2)');
  if (state.phase !== 'choosingPath') return err('Not choosing a path now');
  if (path !== 'A' && path !== 'B') return err('Path must be A or B');
  const s = structuredClone(state);
  s.path = path;
  s.phase = 'choosingTrump';
  if (path === 'B') {
    const opened = trumpOptions(s, seat);
    if (opened.length === 1) return { state: announce(s, opened[0]) }; // §7.4.4: one suit -> automatic
  }
  return { state: s };
}

export function chooseTrump(state: State, seat: number, suit: Suit): Result {
  if (state.trump) return err('Trump is already announced (§7.5)');
  if (seat !== state.chooser) return err('Only the chooser can name trump (§14)');
  if (state.phase !== 'choosingTrump') return err('Choose Path A or B first (§7.2)');
  if (!trumpOptions(state, seat).includes(suit)) {
    return err(state.path === 'A' ? `${suit} is not in your 5 cards (§7.3)` : `${suit} is not among the opened cards (§7.4)`);
  }
  return { state: announce(structuredClone(state), suit) };
}

function announce(s: State, suit: Suit): State {
  s.trump = suit;
  s.phase = 'playing';
  s.trick = { leader: s.chooser, cards: [] }; // §8.1: chooser leads trick 1
  return s;
}

// ---- play (§8, §9)

export function activeSeat(s: State): number | null {
  if (s.phase === 'choosingPath' || s.phase === 'choosingTrump') return s.chooser;
  if (s.phase !== 'playing') return null;
  let seat = s.trick.leader;
  for (let i = 0; i < s.trick.cards.length; i++) seat = nextSeat(seat);
  return seat;
}

export function legalCards(s: State, seat: number): Card[] {
  if (s.phase !== 'playing' || activeSeat(s) !== seat) return [];
  const hand = s.hands[seat - 1];
  if (s.trick.cards.length === 0) return [...hand];
  const lead = s.trick.cards[0].card.suit;
  const follow = hand.filter(c => c.suit === lead);
  return follow.length ? follow : [...hand]; // §8.3: no must-beat, no must-trump
}

/** Seat that wins these cards (§9). Works on a partial trick too (current winner). */
export function trickWinner(cards: PlayedCard[], trump: Suit): number {
  let best = cards[0]; // the led card; best is always lead-suit or trump
  for (const pc of cards.slice(1)) {
    const c = pc.card;
    if (c.suit === trump && best.card.suit !== trump) best = pc; // first trump beats any non-trump
    else if (c.suit === best.card.suit && rankValue(c) > rankValue(best.card)) best = pc;
    // anything else (off-suit, or lead suit after a trump) never wins (§9.3)
  }
  return best.seat;
}

export function playCard(state: State, seat: number, card: Card): Result {
  if (state.phase === 'trickEnd') return err('Wait: the last trick is still on the table');
  if (state.phase !== 'playing') return err('Not in play');
  if (activeSeat(state) !== seat) return err('Not your turn (§8.2)');
  if (!card || !has(state.hands[seat - 1], card)) return err('That card is not in your hand (§14)');
  if (!has(legalCards(state, seat), card)) return err(`You must follow ${state.trick.cards[0].card.suit} (§8.3)`);

  const s = structuredClone(state);
  s.hands[seat - 1] = s.hands[seat - 1].filter(c => !sameCard(c, card));
  s.trick.cards.push({ seat, card: { suit: card.suit, rank: card.rank } });
  if (s.trick.cards.length < SEATS) return { state: s };

  // Trick complete: it stays on the table (phase trickEnd) until the server calls collectTrick.
  const winner = trickWinner(s.trick.cards, s.trump as Suit);
  s.tricksWon[winner - 1]++;
  s.lastTrick = { winner, cards: s.trick.cards };
  s.phase = 'trickEnd';
  return { state: s };
}

/** trickEnd -> the winner leads the next trick, or the round ends after the 8th. */
export function collectTrick(state: State): Result {
  if (state.phase !== 'trickEnd') return err('No trick to collect');
  const s = structuredClone(state);
  s.trick = { leader: s.lastTrick!.winner, cards: [] };
  s.phase = 'playing';
  if (s.hands.every(h => h.length === 0)) endRound(s);
  return { state: s };
}

// ---- results (§10, §11)

export function teamTricks(s: State): { A: number; B: number } {
  const t = { A: 0, B: 0 };
  s.tricksWon.forEach((n, i) => (t[teamOf(i + 1)] += n));
  return t;
}

/** §10.3, from the choosing team's trick count. */
export function roundResult(choosingTricks: number): 'choosing' | 'draw' | 'defending' {
  if (choosingTricks >= TARGETS.choosing.win) return 'choosing';
  if (choosingTricks === TARGETS.choosing.draw) return 'draw';
  return 'defending';
}

/** §11.2: points, then total tricks, else draw. */
export function matchResult(points: { A: number; B: number }, tricks: { A: number; B: number }) {
  if (points.A !== points.B) return { winner: (points.A > points.B ? 'A' : 'B') as Team, decidedBy: 'points' as const };
  if (tricks.A !== tricks.B) return { winner: (tricks.A > tricks.B ? 'A' : 'B') as Team, decidedBy: 'tricks' as const };
  return { winner: 'draw' as const, decidedBy: 'draw' as const };
}

function endRound(s: State) {
  const tricks = teamTricks(s);
  const choosing = choosingTeamOf(s.round);
  const defending: Team = choosing === 'A' ? 'B' : 'A';
  const r = roundResult(tricks[choosing]);
  const result: RoundRecord['result'] = r === 'draw' ? 'draw' : r === 'choosing' ? choosing : defending;
  if (result !== 'draw') s.match.points[result]++;
  s.match.tricks.A += tricks.A;
  s.match.tricks.B += tricks.B;
  s.match.rounds.push({ round: s.round, choosingTeam: choosing, chooser: s.chooser, path: s.path as Path, trump: s.trump as Suit, tricks, result });
  if (s.round < ROUNDS) {
    s.phase = 'roundEnd';
  } else {
    s.phase = 'matchEnd';
    Object.assign(s.match, matchResult(s.match.points, s.match.tricks));
  }
}

// ---- dispatch + views

export function applyAction(state: State, seat: number, a: Action): Result {
  if (a?.type === 'path') return choosePath(state, seat, a.path);
  if (a?.type === 'trump') return chooseTrump(state, seat, a.suit);
  if (a?.type === 'play') return playCard(state, seat, a.card);
  return err('Unknown action');
}

/** Cards this seat may see in its own hand (§7.1, §7.4, §13). */
function visibleHand(s: State, seat: number): { cards: Card[]; hidden: number } {
  const hand = s.hands[seat - 1];
  if (s.trump) return { cards: hand, hidden: 0 };
  const first = hand.slice(0, FIRST_DEAL);
  const isChooser = seat === s.chooser;
  const isTeammate = !isChooser && teamOf(seat) === teamOf(s.chooser);
  if (s.path === 'B') {
    if (isChooser) return { cards: first, hidden: 0 }; // last 3 are the public openedCards
    if (isTeammate) return { cards: first, hidden: HAND_SIZE - FIRST_DEAL };
    return { cards: hand, hidden: 0 };
  }
  return isTeammate ? { cards: [], hidden: FIRST_DEAL } : { cards: first, hidden: 0 };
}

function cardCount(s: State, seat: number): number {
  return s.trump || s.path === 'B' ? s.hands[seat - 1].length : FIRST_DEAL;
}

export function viewFor(
  s: State,
  seat: number,
  extra: { paused?: View['paused']; nextRoundAt?: number | null; trickHoldUntil?: number | null } = {},
): View {
  const own = visibleHand(s, seat);
  const opened = s.path === 'B' && !s.trump ? s.hands[s.chooser - 1].slice(FIRST_DEAL) : null;
  return structuredClone({
    roomId: s.roomId,
    phase: s.phase,
    round: s.round,
    mySeat: seat,
    myHand: own.cards,
    myHiddenCount: own.hidden,
    seats: s.players.map((p, i) => ({
      seat: i + 1,
      team: teamOf(i + 1),
      name: p.name,
      avatar: p.avatar,
      connected: p.connected,
      bot: p.bot,
      cardCount: cardCount(s, i + 1),
      tricks: s.tricksWon[i],
    })),
    chooser: s.chooser,
    choosingTeam: choosingTeamOf(s.round),
    path: s.path,
    openedCards: opened,
    trump: s.trump,
    targets: TARGETS,
    trick: s.trick,
    lastTrick: s.lastTrick,
    activeSeat: activeSeat(s),
    legalCards: legalCards(s, seat),
    trumpOptions: trumpOptions(s, seat),
    roundTricks: teamTricks(s),
    match: s.match,
    paused: extra.paused ?? null,
    nextRoundAt: extra.nextRoundAt ?? null,
    trickHoldUntil: extra.trickHoldUntil ?? null,
  }) as View;
}

// ---- bot (§15.3): legal moves only

const cost = (c: Card, trump: Suit | null) => (c.suit === trump ? 100 : 0) + rankValue(c);

export function botAction(s: State, seat: number): Action | null {
  if (activeSeat(s) !== seat) return null;
  const hand = s.hands[seat - 1];

  if (s.phase === 'choosingPath') return { type: 'path', path: 'A' };
  if (s.phase === 'choosingTrump') {
    // Only what the chooser may see (§7.3/§7.4): Path A = first 5; Path B = first 5 + the 3 opened = all 8.
    // Most cards of the suit, ties to higher ranks.
    const seen = s.path === 'A' ? hand.slice(0, FIRST_DEAL) : hand;
    const score = (suit: Suit) => seen.filter(c => c.suit === suit).reduce((n, c) => n + 100 + rankValue(c), 0);
    const best = trumpOptions(s, seat).sort((a, b) => score(b) - score(a))[0];
    return { type: 'trump', suit: best };
  }

  const legal = legalCards(s, seat);
  const trump = s.trump as Suit;
  const cheapest = (cards: Card[]) => [...cards].sort((a, b) => cost(a, trump) - cost(b, trump))[0];

  if (s.trick.cards.length === 0) {
    const plain = legal.filter(c => c.suit !== trump);
    const pool = plain.length ? plain : legal;
    return { type: 'play', card: [...pool].sort((a, b) => cost(b, trump) - cost(a, trump))[0] };
  }

  const winning = trickWinner(s.trick.cards, trump);
  if (teamOf(winning) === teamOf(seat)) return { type: 'play', card: cheapest(legal) };
  const winners = legal.filter(c => trickWinner([...s.trick.cards, { seat, card: c }], trump) === seat);
  return { type: 'play', card: cheapest(winners.length ? winners : legal) };
}
