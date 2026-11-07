// Run: node --test engine/   (from backend/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Card, Suit, View } from '../../shared/teamCallBreak.types.ts';
import {
  createDeck, deal, newMatch, nextRound, collectTrick, choosePath, chooseTrump, playCard, legalCards, trickWinner,
  roundResult, matchResult, viewFor, botAction, applyAction, teamOf, sameCard, type State, type Rng,
} from './teamCallBreak.ts';

// Seeded rng (mulberry32) so every run is reproducible.
function rngFrom(seed: number): Rng {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const PLAYERS = [1, 2, 3, 4, 5, 6].map(n => ({ name: `P${n}`, avatar: 'x' }));
const c = (s: string): Card => ({ rank: s.slice(1) as Card['rank'], suit: s[0] as Suit });
const cards = (s: string) => s.split(' ').map(c);
const ok = (r: { state?: State; error?: string }): State => {
  assert.equal(r.error, undefined, r.error);
  return r.state as State;
};
const match = (seed = 1) => newMatch('R1', PLAYERS, rngFrom(seed));
/** A round-1 state with chosen hands (8 cards each, first 5 = first deal). */
function withHands(hands: string[]): State {
  const s = match();
  s.hands = hands.map(cards);
  return s;
}

// ---- deck / deal

test('D1 deck: 48 unique cards, no 2s, 12 per suit', () => {
  const d = createDeck();
  assert.equal(d.length, 48);
  assert.equal(new Set(d.map(x => x.suit + x.rank)).size, 48);
  assert.ok(d.every(x => x.rank !== ('2' as Card['rank'])));
  for (const s of ['♠', '♥', '♦', '♣']) assert.equal(d.filter(x => x.suit === s).length, 12);
});

test('D2 deal: 8 per seat, no duplicates, uniform over seats and over first-deal/reserve', () => {
  const rng = rngFrom(42);
  const N = 10000;
  const counts = new Map<string, number[]>(); // card -> per-seat count
  const inFirst = new Map<string, number>(); // card -> times in the first 5
  for (let i = 0; i < N; i++) {
    const hands = deal(rng);
    assert.ok(hands.every(h => h.length === 8));
    hands.forEach((h, seat) => h.forEach((x, pos) => {
      const k = x.suit + x.rank;
      if (!counts.has(k)) counts.set(k, Array(6).fill(0));
      counts.get(k)![seat]++;
      if (pos < 5) inFirst.set(k, (inFirst.get(k) ?? 0) + 1);
    }));
  }
  assert.equal(counts.size, 48);
  // Chi-square over the 48x6 table: 240 df, mean 240, sd ~22; 330 is ~4 sd (p < 1e-4).
  const E = N / 6;
  let chi2 = 0;
  for (const per of counts.values()) for (const n of per) chi2 += (n - E) ** 2 / E;
  assert.ok(chi2 < 330, `chi2 ${chi2.toFixed(1)}`);
  // Each card sits in the first deal 5/8 of the time (sd ~0.005 at N=10k).
  for (const [k, n] of inFirst) assert.ok(Math.abs(n / N - 5 / 8) < 0.025, `${k} first-deal rate ${n / N}`);
  const one = deal(rng).flat();
  assert.equal(new Set(one.map(x => x.suit + x.rank)).size, 48);
});

// ---- visibility

const allCardsIn = (v: unknown, out: Card[] = []): Card[] => {
  if (Array.isArray(v)) v.forEach(x => allCardsIn(x, out));
  else if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.suit === 'string' && typeof o.rank === 'string') out.push(o as unknown as Card);
    else Object.values(o).forEach(x => allCardsIn(x, out));
  }
  return out;
};
const inList = (list: Card[], x: Card) => list.some(y => sameCard(x, y));

/** Independent statement of §7.1/§7.4: which own cards a seat may see right now. */
function allowedOwn(s: State, seat: number): Card[] {
  const hand = s.hands[seat - 1];
  if (s.trump) return hand;
  const mate = seat !== s.chooser && teamOf(seat) === teamOf(s.chooser);
  if (seat === s.chooser) return s.path === 'B' ? hand : hand.slice(0, 5); // opened 3 are public
  if (mate) return s.path === 'B' ? hand.slice(0, 5) : [];
  return s.path === 'B' ? hand : hand.slice(0, 5);
}
function publicCards(s: State): Card[] {
  const opened = s.path === 'B' && !s.trump ? s.hands[s.chooser - 1].slice(5) : [];
  return [...opened, ...s.trick.cards.map(p => p.card), ...(s.lastTrick?.cards.map(p => p.card) ?? [])];
}
function assertNoLeak(s: State) {
  for (let seat = 1; seat <= 6; seat++) {
    const v = viewFor(s, seat);
    const own = allowedOwn(s, seat);
    const pub = publicCards(s);
    for (const x of allCardsIn(v)) {
      assert.ok(inList(own, x) || inList(pub, x), `seat ${seat} sees ${x.suit}${x.rank} in phase ${s.phase} path ${s.path}`);
    }
    for (const x of v.myHand) assert.ok(inList(own, x));
    for (const x of v.legalCards) assert.ok(inList(v.myHand, x));
  }
}

test('V2 first-deal visibility: chooser + defenders see 5, teammates see nothing', () => {
  const s = match();
  const v = (seat: number) => viewFor(s, seat);
  assert.equal(v(1).myHand.length, 5);
  for (const mate of [3, 5]) {
    assert.deepEqual(v(mate).myHand, []);
    assert.equal(v(mate).myHiddenCount, 5);
  }
  for (const def of [2, 4, 6]) assert.equal(v(def).myHand.length, 5);
  assertNoLeak(s);
});

test('V1 no view ever leaks a card, across 50 bot matches with random paths', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const rng = rngFrom(seed);
    let s = newMatch('R', PLAYERS, rng);
    while (s.phase !== 'matchEnd') {
      assertNoLeak(s);
      if (s.phase === 'roundEnd') { s = ok(nextRound(s, rng)); continue; }
      if (s.phase === 'trickEnd') { s = ok(collectTrick(s)); continue; }
      const seat = s.phase === 'playing' ? (viewFor(s, 1).activeSeat as number) : s.chooser;
      const a = s.phase === 'choosingPath' ? { type: 'path' as const, path: rng() < 0.5 ? 'A' as const : 'B' as const } : botAction(s, seat)!;
      s = ok(applyAction(s, seat, a));
    }
    assertNoLeak(s);
  }
});

// ---- Path A

test('A1 Path A: suit must be in the chooser 5; valid suit starts play with chooser leading', () => {
  //            first 5 (P1 holds ♠ ♥ only)  reserve
  const s0 = withHands([
    '♠A ♠K ♥3 ♥4 ♠5 ♦A ♦K ♣A', '♠Q ♠J ♠10 ♠9 ♠8 ♦Q ♦J ♣K', '♠7 ♠6 ♠4 ♠3 ♥A ♦10 ♦9 ♣Q',
    '♥K ♥Q ♥J ♥10 ♥9 ♦8 ♦7 ♣J', '♥8 ♥7 ♥6 ♥5 ♦6 ♦5 ♦4 ♣10', '♦3 ♣9 ♣8 ♣7 ♣6 ♣5 ♣4 ♣3',
  ]);
  const s1 = ok(choosePath(s0, 1, 'A'));
  assert.deepEqual(viewFor(s1, 1).trumpOptions, ['♠', '♥']);
  assert.match(chooseTrump(s1, 1, '♦').error!, /not in your 5 cards/); // ♦ only in P1's reserve
  const s2 = ok(chooseTrump(s1, 1, '♥'));
  assert.equal(s2.trump, '♥');
  assert.equal(s2.phase, 'playing');
  for (let seat = 1; seat <= 6; seat++) {
    assert.equal(viewFor(s2, seat).myHand.length, 8);
    assert.equal(viewFor(s2, seat).trump, '♥');
  }
  assert.equal(viewFor(s2, 4).activeSeat, 1);
});

test('A2 only the chooser can choose path or trump', () => {
  const s = match();
  assert.match(choosePath(s, 2, 'A').error!, /Only the chooser/);
  const s1 = ok(choosePath(s, 1, 'A'));
  assert.match(chooseTrump(s1, 3, s1.hands[0][0].suit).error!, /Only the chooser/);
});

// ---- Path B

const HANDS_B = [
  '♠A ♠K ♥3 ♥4 ♠5 ♦A ♦K ♣A', '♠Q ♠J ♠10 ♠9 ♠8 ♦Q ♦J ♣K', '♠7 ♠6 ♠4 ♠3 ♥A ♦10 ♦9 ♣Q',
  '♥K ♥Q ♥J ♥10 ♥9 ♦8 ♦7 ♣J', '♥8 ♥7 ♥6 ♥5 ♦6 ♦5 ♦4 ♣10', '♦3 ♣9 ♣8 ♣7 ♣6 ♣5 ♣4 ♣3',
];

test('B1 Path B: opened cards public, teammates see 5 + 3 hidden, defenders see 8', () => {
  const s = ok(choosePath(withHands(HANDS_B), 1, 'B'));
  for (let seat = 1; seat <= 6; seat++) assert.deepEqual(viewFor(s, seat).openedCards, cards('♦A ♦K ♣A'));
  for (const mate of [3, 5]) {
    assert.equal(viewFor(s, mate).myHand.length, 5);
    assert.equal(viewFor(s, mate).myHiddenCount, 3);
  }
  for (const def of [2, 4, 6]) assert.equal(viewFor(s, def).myHand.length, 8);
  assertNoLeak(s);
});

test('B2 Path B: only opened suits; Path B is final', () => {
  const s = ok(choosePath(withHands(HANDS_B), 1, 'B'));
  assert.deepEqual(viewFor(s, 1).trumpOptions, ['♦', '♣']);
  assert.match(chooseTrump(s, 1, '♠').error!, /not among the opened/); // ♠ is in his first 5
  assert.match(choosePath(s, 1, 'A').error!, /Path B is final/);
});

test('B3 Path B: three opened cards of one suit -> trump automatically', () => {
  const hands = [...HANDS_B];
  hands[0] = '♠A ♠K ♥3 ♥4 ♠5 ♦A ♦K ♦Q';
  hands[1] = '♠Q ♠J ♠10 ♠9 ♠8 ♣A ♦J ♣K';
  const s = ok(choosePath(withHands(hands), 1, 'B'));
  assert.equal(s.trump, '♦');
  assert.equal(s.phase, 'playing');
  assert.equal(viewFor(s, 2).activeSeat, 1); // chooser leads trick 1
});

test('§7.2 Path A is final too: A then B is rejected; chooseTrump before a path is rejected', () => {
  const s = withHands(HANDS_B);
  assert.match(chooseTrump(s, 1, '♠').error!, /Choose Path A or B first/);
  const a = ok(choosePath(s, 1, 'A'));
  assert.ok(choosePath(a, 1, 'B').error);
  assert.equal(a.path, 'A');
});

test('playCard is rejected outside the playing phase', () => {
  const s = withHands(HANDS_B);
  assert.match(playCard(s, 1, c('♠A')).error!, /Not in play/); // choosingPath
  const a = ok(choosePath(s, 1, 'A'));
  assert.match(playCard(a, 1, c('♠A')).error!, /Not in play/); // choosingTrump
  const end = structuredClone(a);
  end.phase = 'roundEnd';
  assert.match(playCard(end, 1, c('♠A')).error!, /Not in play/);
  end.phase = 'matchEnd';
  assert.match(playCard(end, 1, c('♠A')).error!, /Not in play/);
});

test('§8.1 round n: chooser n leads trick 1, and may lead trump', () => {
  const rng = rngFrom(3);
  let s = newMatch('R', PLAYERS, rng);
  for (let round = 1; round <= 5; round++) {
    assert.equal(s.round, round);
    s = ok(choosePath(s, round, 'A'));
    const suit = viewFor(s, round).trumpOptions[0];
    s = ok(chooseTrump(s, round, suit));
    assert.equal(viewFor(s, 1).activeSeat, round);
    const trumpCard = s.hands[round - 1].find(x => x.suit === suit)!; // in his first 5, so he holds one
    s = ok(playCard(s, round, trumpCard));
    while (s.phase === 'playing' || s.phase === 'trickEnd') {
      if (s.phase === 'trickEnd') { s = ok(collectTrick(s)); continue; }
      const seat = viewFor(s, 1).activeSeat as number;
      s = ok(applyAction(s, seat, botAction(s, seat)!));
    }
    if (s.phase === 'roundEnd') s = ok(nextRound(s, rng));
  }
  assert.equal(s.phase, 'matchEnd');
});

test('B4 Path B: after trump, opened cards gone, chooser holds 8, nothing hidden', () => {
  const s = ok(chooseTrump(ok(choosePath(withHands(HANDS_B), 1, 'B')), 1, '♣'));
  for (let seat = 1; seat <= 6; seat++) {
    const v = viewFor(s, seat);
    assert.equal(v.openedCards, null);
    assert.equal(v.myHiddenCount, 0);
    assert.equal(v.myHand.length, 8);
  }
  assert.match(chooseTrump(s, 1, '♦').error!, /already announced/);
});

// ---- play

function playing(hands: string[], trump: Suit): State {
  const s = withHands(hands);
  s.trump = trump;
  s.path = 'A';
  s.phase = 'playing';
  return s;
}

test('F1 follow suit: must follow when able, any led-suit card is fine, void plays anything', () => {
  let s = playing(HANDS_B, '♥');
  s = ok(playCard(s, 1, c('♣A'))); // lead ♣
  assert.match(playCard(s, 2, c('♠Q')).error!, /must follow ♣/); // P2 holds ♣K
  s = ok(playCard(s, 2, c('♣K'))); // no must-beat: ♣K doesn't need to beat ♣A
  assert.deepEqual(legalCards(s, 3), [c('♣Q')]);
  s = ok(playCard(s, 3, c('♣Q')));
  s = ok(playCard(s, 4, c('♣J')));
  s = ok(playCard(s, 5, c('♣10')));
  s = ok(playCard(s, 6, c('♣9')));
  assert.equal(s.lastTrick!.winner, 1);
  s = ok(collectTrick(s));
  s = ok(playCard(s, 1, c('♦A'))); // P1 leads ♦
  // P6 holds ♦3 -> must follow; P2 holds ♦Q ♦J
  s = ok(playCard(s, 2, c('♦Q')));
  s = ok(playCard(s, 3, c('♦10')));
  s = ok(playCard(s, 4, c('♦8')));
  s = ok(playCard(s, 5, c('♦6')));
  assert.match(playCard(s, 6, c('♣8')).error!, /must follow ♦/);
  // void case: seat with no ♦ may play anything
  const v = playing(['♠A ♠K ♠Q ♠J ♠10 ♠9 ♠8 ♠7', '♥A ♥K ♥Q ♥J ♥10 ♥9 ♥8 ♥7', '♦A ♦K ♦Q ♦J ♦10 ♦9 ♦8 ♦7',
    '♣A ♣K ♣Q ♣J ♣10 ♣9 ♣8 ♣7', '♠6 ♠5 ♠4 ♠3 ♥6 ♥5 ♥4 ♥3', '♦6 ♦5 ♦4 ♦3 ♣6 ♣5 ♣4 ♣3'], '♥');
  const v1 = ok(playCard(v, 1, c('♠A')));
  assert.equal(legalCards(v1, 2).length, 8);
  ok(playCard(v1, 2, c('♥7'))); // trump allowed
  ok(playCard(v1, 2, c('♥A'))); // or any other card in hand
});

test('F2 turn, ownership and double-play are rejected; chooser leads; winner leads next', () => {
  let s = playing(HANDS_B, '♥');
  assert.match(playCard(s, 2, c('♠Q')).error!, /Not your turn/);
  assert.match(playCard(s, 1, c('♠Q')).error!, /not in your hand/);
  s = ok(playCard(s, 1, c('♠A')));
  assert.match(playCard(s, 1, c('♠K')).error!, /Not your turn/);
  s = ok(playCard(s, 2, c('♠Q')));
  s = ok(playCard(s, 3, c('♠7')));
  s = ok(playCard(s, 4, c('♥K'))); // P4 void in ♠: trumps
  s = ok(playCard(s, 5, c('♥8')));
  s = ok(playCard(s, 6, c('♦3')));
  assert.equal(s.lastTrick!.winner, 4);
  s = ok(collectTrick(s));
  assert.equal(viewFor(s, 1).activeSeat, 4);
  assert.match(playCard(s, 1, c('♠K')).error!, /Not your turn/);
  assert.match(playCard(s, 4, c('♥K')).error!, /not in your hand/); // already played
});

test('trickEnd: completed trick stays on the table, plays rejected, collectTrick hands the lead to the winner', () => {
  let s = playing(HANDS_B, '♥');
  for (const [seat, card] of [[1, '♠A'], [2, '♠Q'], [3, '♠7'], [4, '♥K'], [5, '♥8'], [6, '♦3']] as const) s = ok(playCard(s, seat, c(card)));
  assert.equal(s.phase, 'trickEnd');
  const v = viewFor(s, 2, { trickHoldUntil: 123 });
  assert.equal(v.trick.cards.length, 6);
  assert.equal(v.lastTrick!.winner, 4);
  assert.equal(v.activeSeat, null);
  assert.deepEqual(v.legalCards, []);
  assert.equal(v.trickHoldUntil, 123);
  assert.equal(v.seats[3].tricks, 1);
  assert.match(playCard(s, 4, c('♥Q')).error!, /still on the table/);
  assert.match(collectTrick(ok(collectTrick(s))).error!, /No trick to collect/);
  s = ok(collectTrick(s));
  assert.equal(s.phase, 'playing');
  assert.deepEqual(s.trick, { leader: 4, cards: [] });
  assert.equal(viewFor(s, 1).trickHoldUntil, null);
  ok(playCard(s, 4, c('♥Q')));
});

test('W1-W3 trick winner: RULES §9 examples (trump ♥)', () => {
  const t = (s: string) => cards(s).map((card, i) => ({ seat: i + 1, card }));
  assert.equal(trickWinner(t('♣9 ♣K ♦A ♣3 ♠A ♣10'), '♥'), 2); // ♣K
  assert.equal(trickWinner(t('♣9 ♣K ♥4 ♣3 ♥J ♣10'), '♥'), 5); // ♥J
  assert.equal(trickWinner(t('♥5 ♥Q ♠A ♥3 ♥K ♦A'), '♥'), 5); // ♥K
});

// ---- results

test('R1 round result table: all 9 splits', () => {
  const want = ['defending', 'defending', 'defending', 'defending', 'defending', 'draw', 'choosing', 'choosing', 'choosing'];
  for (let n = 0; n <= 8; n++) assert.equal(roundResult(n), want[n], `choosing tricks ${n}`);
});

test('R2/R3/M1 30 full matches: 8 tricks/round, hands empty, schedule, points + winner consistent', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const rng = rngFrom(seed * 7);
    let s = newMatch('R', PLAYERS, rng);
    const choosers: number[] = [];
    while (s.phase !== 'matchEnd') {
      if (s.phase === 'roundEnd') {
        assert.ok(s.hands.every(h => h.length === 0));
        assert.equal(s.tricksWon.reduce((a, b) => a + b), 8);
        s = ok(nextRound(s, rng));
        continue;
      }
      if (s.phase === 'trickEnd') { s = ok(collectTrick(s)); continue; }
      if (s.phase === 'choosingPath') choosers.push(s.chooser);
      const seat = viewFor(s, 1).activeSeat as number;
      const a = s.phase === 'choosingPath' && rng() < 0.5 ? { type: 'path' as const, path: 'B' as const } : botAction(s, seat)!;
      s = ok(applyAction(s, seat, a));
    }
    assert.ok(s.hands.every(h => h.length === 0));
    assert.deepEqual(choosers, [1, 2, 3, 4, 5]);
    const rounds = s.match.rounds;
    assert.deepEqual(rounds.map(r => r.choosingTeam), ['A', 'B', 'A', 'B', 'A']);
    const won = { A: 0, B: 0 };
    const tricks = { A: 0, B: 0 };
    for (const r of rounds) {
      assert.equal(r.tricks.A + r.tricks.B, 8);
      const defending = r.choosingTeam === 'A' ? 'B' : 'A';
      const want = { choosing: r.choosingTeam, draw: 'draw', defending }[roundResult(r.tricks[r.choosingTeam])];
      assert.equal(r.result, want);
      if (r.result !== 'draw') won[r.result]++;
      tricks.A += r.tricks.A;
      tricks.B += r.tricks.B;
    }
    assert.deepEqual(s.match.points, won);
    assert.deepEqual(s.match.tricks, tricks);
    assert.equal(tricks.A + tricks.B, 40);
    const m = matchResult(won, tricks);
    assert.equal(s.match.winner, m.winner);
    assert.equal(s.match.decidedBy, m.decidedBy);
  }
});

/** Play the last trick of a round (P4 wins it with ♥K, trump ♥) after the given tricks per seat. */
function lastTrick(round: number, before: number[]): State {
  let s = playing(HANDS_B, '♥');
  s.round = round;
  s.chooser = round;
  s.hands = [[c('♠A')], [c('♠Q')], [c('♠7')], [c('♥K')], [c('♥8')], [c('♦3')]];
  s.tricksWon = before;
  for (const [seat, card] of [[1, '♠A'], [2, '♠Q'], [3, '♠7'], [4, '♥K'], [5, '♥8'], [6, '♦3']] as const) s = ok(playCard(s, seat, c(card)));
  assert.equal(s.phase, 'trickEnd'); // the 8th trick is held before the round ends
  assert.equal(s.match.rounds.length, 0);
  s = ok(collectTrick(s));
  assert.equal(s.phase, 'roundEnd');
  return s;
}

test('R1 points: choosing win, defending win, draw; for both choosing teams', () => {
  // Round 1, A chooses. Before: A 6, B 1 -> A 6, B 2: choosing team wins.
  let s = lastTrick(1, [3, 0, 2, 1, 1, 0]);
  assert.deepEqual(s.match.rounds[0].tricks, { A: 6, B: 2 });
  assert.equal(s.match.rounds[0].result, 'A');
  assert.deepEqual(s.match.points, { A: 1, B: 0 });
  // Round 1, A chooses. A 5, B 3: draw.
  s = lastTrick(1, [3, 0, 1, 0, 1, 2]);
  assert.equal(s.match.rounds[0].result, 'draw');
  assert.deepEqual(s.match.points, { A: 0, B: 0 });
  // Round 1, A chooses. Before A 3, B 4 -> A 3, B 5: defending team wins.
  s = lastTrick(1, [1, 2, 1, 1, 1, 1]);
  assert.equal(s.match.rounds[0].result, 'B');
  assert.deepEqual(s.match.points, { A: 0, B: 1 });
  // Round 2, B chooses. Before A 2, B 5 -> B 6: choosing team (B) wins.
  s = lastTrick(2, [1, 2, 1, 2, 0, 1]);
  assert.equal(s.match.rounds[0].choosingTeam, 'B');
  assert.equal(s.match.rounds[0].result, 'B');
  assert.deepEqual(s.match.points, { A: 0, B: 1 });
  // Round 2, B chooses. Before A 4, B 3 -> B 4: defending team (A) wins.
  s = lastTrick(2, [2, 1, 1, 1, 1, 1]);
  assert.deepEqual(s.match.rounds[0].tricks, { A: 4, B: 4 });
  assert.equal(s.match.rounds[0].result, 'A');
  assert.deepEqual(s.match.points, { A: 1, B: 0 });
});

test('M1 match winner: points, then tricks, else draw', () => {
  assert.deepEqual(matchResult({ A: 3, B: 1 }, { A: 18, B: 22 }), { winner: 'A', decidedBy: 'points' });
  assert.deepEqual(matchResult({ A: 1, B: 2 }, { A: 22, B: 18 }), { winner: 'B', decidedBy: 'points' });
  assert.deepEqual(matchResult({ A: 2, B: 2 }, { A: 18, B: 22 }), { winner: 'B', decidedBy: 'tricks' });
  assert.deepEqual(matchResult({ A: 2, B: 2 }, { A: 21, B: 19 }), { winner: 'A', decidedBy: 'tricks' });
  assert.deepEqual(matchResult({ A: 1, B: 1 }, { A: 20, B: 20 }), { winner: 'draw', decidedBy: 'draw' });
});

// ---- bot

test('X2 bot: 200 all-bot matches, both paths, zero rejected actions', () => {
  for (let seed = 100; seed < 300; seed++) {
    const rng = rngFrom(seed);
    let s = newMatch('R', PLAYERS, rng);
    let steps = 0;
    while (s.phase !== 'matchEnd') {
      if (s.phase === 'roundEnd') { s = ok(nextRound(s, rng)); continue; }
      if (s.phase === 'trickEnd') { s = ok(collectTrick(s)); continue; }
      const seat = viewFor(s, 1).activeSeat as number;
      // Half the time a "human" picked Path B before the bot took over; the bot must still name a legal trump.
      const a = s.phase === 'choosingPath' && seed % 2 ? { type: 'path' as const, path: 'B' as const } : botAction(s, seat)!;
      s = ok(applyAction(s, seat, a));
      assert.ok(++steps < 1000);
    }
    assert.ok(s.match.winner);
  }
});

test('bot sees only what its seat may see: Path A trump from the first 5 only (§7.3, §13)', () => {
  // P1 first 5: one ♠ and two ♥ (plus ♦3 ♣3); reserve: ♠A ♠K ♠Q. Full-hand scoring would pick ♠.
  const p1 = cards('♠3 ♥A ♥K ♦3 ♣3 ♠A ♠K ♠Q');
  const rest = createDeck().filter(x => !p1.some(y => sameCard(x, y)));
  const s = match();
  s.hands = [p1, ...[0, 1, 2, 3, 4].map(i => rest.slice(i * 8, i * 8 + 8))];
  const a = ok(choosePath(s, 1, 'A'));
  assert.deepEqual(botAction(a, 1), { type: 'trump', suit: '♥' });
  // Path B: the chooser sees first 5 + opened 3 (all ♠ here, so automatic), nothing else to leak.
  // Play decisions use only the bot's own hand (visible after trump) and public trick cards.
});

test('views are detached copies (mutating a view cannot change state)', () => {
  const s = match();
  const v: View = viewFor(s, 1);
  v.myHand.pop();
  assert.equal(viewFor(s, 1).myHand.length, 5);
});
