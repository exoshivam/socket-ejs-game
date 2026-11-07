// X2 (PRD §6, RULES §15.2-15.3, §15.6): the round-1 chooser disconnects before choosing a path and never
// returns. After 60s a bot takes the seat, chooses path + trump, and plays out the whole match.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, makeRoom, startMatch, Driver, until, cardKey, dump, short } from './lib.mjs';

test('X2: bot takes over a silent chooser and completes the match', { timeout: 360_000 }, async () => {
  const srv = await startServer('x2');
  let clients = [];
  try {
    ({ clients } = await makeRoom(srv.url));
    const [p1, ...humans] = clients; // P1 = round-1 chooser, gets no driver
    humans.forEach((c) => new Driver(c, { pathFor: () => 'A' }));
    await startMatch(clients);
    assert.equal(p1.state.phase, 'choosingPath');
    assert.equal(p1.state.chooser, 1);
    const t0 = Date.now();
    p1.close();

    await until(humans, (s) => s.paused?.seats?.includes(1), 5000, 'paused on P1');
    const err = await humans[1].expectError('tcb:choosePath', { roomId: p1.roomId, path: 'A' });
    assert.ok(err, 'non-chooser choosePath during pause was not rejected');

    await until(humans, (s) => s.seats[0].bot === true, 80_000, 'seat 1 becomes bot');
    const took = Date.now() - t0;
    assert.ok(took >= 58_000 && took <= 70_000, `bot took over after ${took}ms, want ~60s (§15.2)`);
    await until(humans, (s) => s.paused === null, 5000, 'pause cleared once bot sits');

    await until(humans, (s) => s.trump !== null || s.round > 1, 10_000, 'bot chooser names trump');
    await until(humans, (s) => s.phase === 'matchEnd', 240_000, 'match completes with the bot');

    const end = humans[0].state;
    const errs = humans.flatMap((c) => c.errors().map((e) => `${c.name}: ${e}`));
    assert.equal(errs.length, 1, `only the deliberate pause rejection expected, got: ${short(errs)}`);
    assert.equal(end.match.rounds.length, 5);
    assert.equal(end.match.rounds[0].chooser, 1);
    assert.ok(end.match.rounds[0].path && end.match.rounds[0].trump, 'bot chose a path and trump in round 1');
    assert.equal(end.match.tricks.A + end.match.tricks.B, 40);
    assert.ok(end.match.winner, 'match winner set');

    // Bot played every one of its 40 cards, and its tricks count for Team A (§15.6).
    const botCards = new Set();
    for (const v of humans[0].states())
      for (const p of [...v.trick.cards, ...(v.lastTrick?.cards ?? [])]) if (p.seat === 1) botCards.add(`${v.round}:${cardKey(p.card)}`);
    assert.equal(botCards.size, 40, `bot played ${botCards.size}/40 cards`);
    for (const v of humans[0].states().filter((v) => v.phase === 'roundEnd' || v.phase === 'matchEnd')) {
      const byTeam = { A: 0, B: 0 };
      v.seats.forEach((s) => (byTeam[s.team] += s.tricks));
      assert.deepEqual(byTeam, v.roundTricks, `round ${v.round}: per-seat tricks (incl. bot) sum to team tricks`);
    }
  } finally {
    dump('x2.payloads', Object.fromEntries(clients.map((c) => [c.name, c.log])));
    clients.forEach((c) => c.close());
    await srv.stop();
  }
});
