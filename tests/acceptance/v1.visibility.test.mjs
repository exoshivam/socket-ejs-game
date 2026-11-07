// V1 (+ V2, B1, B4 at socket level): play a full 5-round match with 6 sockets, capture every payload,
// and assert no view ever carries a card its seat may not see (RULES §7, §13, §14; PRD §4.2).
// Path B in rounds 1, 3, 5 and Path A in rounds 2, 4, so both hidden-card cases are covered.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, makeRoom, startMatch, Driver, until, cardsIn, cardKey, dump, short } from './lib.mjs';

const ALLOWED = /^\$\.(myHand|legalCards|openedCards)\.\d+$|^\$\.(trick|lastTrick)\.cards\.\d+\.card$/;
const teamOf = (seat) => (seat % 2 ? 'A' : 'B');

test('V1: no hidden card in any payload over a full match', { timeout: 300_000 }, async () => {
  const srv = await startServer('v1');
  let clients = [];
  const leaks = [];
  const leak = (c, i, why, payload) => leaks.push({ socket: c.name, seat: c.seat, logIndex: i, why, payload: short(payload, 4000) });
  try {
    ({ clients } = await makeRoom(srv.url));
    clients.forEach((c) => new Driver(c));
    await startMatch(clients);
    await until(clients, (s) => s.phase === 'matchEnd', 240_000, 'every socket reaches matchEnd');

    // Ground truth per round: each seat's 8 cards = myHand in its first 'playing' view of that round.
    const truth = {}; // truth[round][seat] = Set
    const first5 = {}; // first5[round][seat] = Set of the first-deal cards the seat legitimately saw
    for (const c of clients) {
      for (const v of c.states()) {
        truth[v.round] ??= {};
        first5[v.round] ??= {};
        if (v.phase === 'playing' && !truth[v.round][c.seat]) {
          assert.equal(v.myHand.length, 8, `${c.name} round ${v.round}: first playing view has ${v.myHand.length} cards, want 8 (RULES §12.6)`);
          truth[v.round][c.seat] = new Set(v.myHand.map(cardKey));
        }
        if (!first5[v.round][c.seat] && v.trump === null && v.myHand.length === 5) first5[v.round][c.seat] = new Set(v.myHand.map(cardKey));
      }
    }
    for (const [r, seats] of Object.entries(truth)) {
      const all = Object.values(seats).flatMap((s) => [...s]);
      assert.equal(Object.keys(seats).length, 6, `round ${r}: truth for ${Object.keys(seats).length}/6 seats`);
      assert.equal(new Set(all).size, 48, `round ${r}: 48 unique cards across hands (D1)`);
      assert.ok(!all.some((k) => k.startsWith('2')), `round ${r}: a 2 was dealt (§3.1)`);
    }

    for (const c of clients) {
      c.log.forEach(({ event, payload }, i) => {
        if (event.startsWith('>')) return;
        const found = cardsIn(payload);
        if (event !== 'tcb:state') {
          if (found.length) leak(c, i, `${event} carries cards at ${found.map((f) => f.at)}`, payload);
          if (event !== 'tcb:session' && JSON.stringify(payload ?? null).includes('"token"')) leak(c, i, `${event} carries a token`, payload);
          return;
        }
        const v = payload;
        const me = c.seat;
        const mine = truth[v.round]?.[me] ?? new Set();
        const isTeammate = teamOf(me) === v.choosingTeam && me !== v.chooser;
        const preTrump = v.trump === null && (v.phase === 'choosingPath' || v.phase === 'choosingTrump');
        const opened = new Set((v.openedCards ?? []).map(cardKey));

        for (const f of found) if (!ALLOWED.test(f.at)) leak(c, i, `card ${f.card} at unexpected path ${f.at}`, v);
        if (v.mySeat !== me) leak(c, i, `mySeat ${v.mySeat} != session seat ${me}`, v);
        for (const k of v.myHand.map(cardKey)) if (!mine.has(k)) leak(c, i, `myHand has ${k}, not this seat's card`, v);
        for (const k of v.legalCards.map(cardKey)) if (!v.myHand.some((h) => cardKey(h) === k)) leak(c, i, `legalCards has ${k} not in myHand`, v);
        if (v.legalCards.length && !(v.phase === 'playing' && v.activeSeat === me)) leak(c, i, 'legalCards non-empty off-turn', v);
        for (const p of [...(v.trick?.cards ?? []), ...(v.lastTrick?.cards ?? [])])
          if (truth[v.round]?.[p.seat] && !truth[v.round][p.seat].has(cardKey(p.card))) leak(c, i, `trick shows ${cardKey(p.card)} for seat ${p.seat}, not its card`, v);
        if (v.openedCards) {
          if (!(v.path === 'B' && v.trump === null)) leak(c, i, 'openedCards present outside Path B pre-trump (§7.4.6, B4)', v);
          if (v.openedCards.length !== 3) leak(c, i, `openedCards length ${v.openedCards.length} (B1)`, v);
          for (const k of opened) if (!truth[v.round]?.[v.chooser]?.has(k)) leak(c, i, `openedCard ${k} not the chooser's`, v);
        }
        if (v.seats.some((s) => s.cardCount < 0 || s.cardCount > 8)) leak(c, i, 'cardCount out of range', v);

        if (preTrump) {
          if (isTeammate && v.path !== 'B') {
            // §7.1 / §7.3: teammates see nothing until trump (Path A) or the Path B reveal.
            if (v.myHand.length || v.myHiddenCount !== 5) leak(c, i, `teammate pre-reveal myHand=${v.myHand.length} hidden=${v.myHiddenCount}, want 0/5 (V2)`, v);
          } else if (isTeammate && v.path === 'B') {
            // §7.4.2-3: first 5 visible, last 3 face-down and absent from the payload.
            if (v.myHand.length !== 5 || v.myHiddenCount !== 3) leak(c, i, `Path B teammate myHand=${v.myHand.length} hidden=${v.myHiddenCount}, want 5/3 (B1)`, v);
          } else if (v.path === 'B' && v.phase === 'choosingTrump') {
            // Chooser: own 5 + opened 3 (public). Defenders: all 8 (§7.4.3).
            if (me !== v.chooser && v.myHand.length !== 8) leak(c, i, `Path B defender sees ${v.myHand.length}, want 8 (B1)`, v);
          } else if (v.myHand.length !== 5) {
            leak(c, i, `pre-trump (path ${v.path}) myHand=${v.myHand.length}, want 5: last 3 must not be sent`, v);
          }
          // Nobody may see anybody's not-yet-visible cards: anything in myHand beyond the first 5 must be explicitly allowed above.
          const f5 = first5[v.round]?.[me];
          const extra = v.myHand.map(cardKey).filter((k) => f5 && !f5.has(k) && !opened.has(k));
          const extraOk = v.path === 'B' && v.phase === 'choosingTrump' && !isTeammate && me !== v.chooser;
          if (extra.length && !extraOk) leak(c, i, `pre-trump myHand includes last-3 cards ${extra}`, v);
          if (v.chooser === me && v.path === 'B' && v.phase === 'choosingTrump')
            for (const k of opened) if (!mine.has(k)) leak(c, i, 'opened card not in chooser hand', v);
        } else if (v.phase === 'playing' && v.myHiddenCount !== 0) {
          leak(c, i, `myHiddenCount=${v.myHiddenCount} after trump (B4)`, v);
        }
      });
    }

    const errs = clients.flatMap((c) => c.errors().map((e) => `${c.name}: ${e}`));
    const file = dump('v1.payloads', { leaks, errs, logs: Object.fromEntries(clients.map((c) => [c.name, c.log])) });
    assert.deepEqual(errs, [], `server rejected a driver action (all actions were legal). Payloads: ${file}`);
    assert.deepEqual(leaks.slice(0, 20), [], `${leaks.length} leak(s). All payloads: ${file}`);

    const end = clients[0].state;
    assert.equal(end.match.rounds.length, 5, 'all 5 rounds played (M1)');
    assert.deepEqual(end.match.rounds.map((r) => r.chooser), [1, 2, 3, 4, 5], 'chooser schedule (R3)');
    assert.deepEqual(end.match.rounds.map((r) => r.choosingTeam), ['A', 'B', 'A', 'B', 'A'], 'choosing team schedule (R3)');
    assert.deepEqual(end.match.rounds.map((r) => r.path), ['B', 'A', 'B', 'A', 'B'], 'paths the drivers chose');
    for (const r of end.match.rounds) assert.equal(r.tricks.A + r.tricks.B, 8, `round ${r.round} tricks sum to 8 (§14)`);
  } finally {
    clients.forEach((c) => c.close());
    await srv.stop();
  }
});
