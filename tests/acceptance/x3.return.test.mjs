// X3 (PRD §6, RULES §15.4): a player drops mid-round, the bot plays for them, then they rejoin by token.
// Control comes back from their next decision and the bot's moves stand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, makeRoom, startMatch, Driver, until, connect, cardKey, dump, short } from './lib.mjs';

const tricksDone = (s) => s.roundTricks.A + s.roundTricks.B;

test('X3: player returns after the bot took over', { timeout: 240_000 }, async () => {
  const srv = await startServer('x3');
  let clients = [];
  let back;
  try {
    ({ clients } = await makeRoom(srv.url));
    const gate = (s) => !(s.round === 1 && s.phase === 'playing' && tricksDone(s) >= 1);
    const drivers = clients.map((c) => new Driver(c, { pathFor: () => 'A', gate }));
    await startMatch(clients);
    await until(clients, (s) => s.phase === 'playing' && tricksDone(s) === 1 && s.trick.cards.length === 0, 30_000, 'trick 1 complete');

    // The trick-2 leader drops, so the bot has to act as soon as it sits.
    const victim = clients.find((c) => c.seat === c.state.activeSeat);
    const others = clients.filter((c) => c !== victim);
    victim.close();
    drivers.forEach((d) => (d.gate = null));
    await until(others, (s) => s.seats[victim.seat - 1].bot === true, 80_000, `seat ${victim.seat} becomes bot`);
    others.forEach((c) => c.state && drivers[clients.indexOf(c)].kick());

    const botPlays = () => {
      const seen = new Map();
      for (const v of others[0].states())
        for (const p of [...v.trick.cards, ...(v.lastTrick?.cards ?? [])]) if (p.seat === victim.seat && v.round === 1) seen.set(cardKey(p.card), true);
      return [...seen.keys()];
    };
    await until(others, () => botPlays().length >= 2, 30_000, 'bot plays two cards');
    const historyBefore = others[0].state.roundTricks;

    back = await connect(srv.url, victim.name);
    back.emit('tcb:rejoin', { roomId: victim.roomId, token: victim.token });
    const sess = await back.waitFor('tcb:session', () => true, 5000, 0);
    assert.equal(sess.seat, victim.seat);
    await back.waitFor('tcb:state', () => true, 5000, 0);
    await until(others, (s) => s.seats[victim.seat - 1].bot === false && s.seats[victim.seat - 1].connected, 5000, 'seat back to human');

    const nowPlayed = botPlays();
    const inHand = (k) => back.state.myHand.some((c) => cardKey(c) === k);
    for (const k of nowPlayed) assert.ok(!inHand(k), `bot-played ${k} is back in the hand: moves must stand (§15.4)`);
    assert.ok(tricksDone(back.state) >= historyBefore.A + historyBefore.B, 'trick history not rolled back');

    // The returning player must make their own next play: their emitted card shows up in the trick.
    const since = back.log.length;
    new Driver(back, { pathFor: () => 'A' }).kick();
    await back.waitFor('tcb:state', (s) => s.activeSeat === back.seat, 30_000).catch(() => null);
    const mine = await (async () => {
      const end = Date.now() + 30_000;
      while (Date.now() < end) {
        const e = back.log.slice(since).find((x) => x.event === '>tcb:playCard');
        if (e) return e.payload.card;
        await new Promise((r) => setTimeout(r, 50));
      }
      return null;
    })();
    assert.ok(mine, 'returning player never got a turn within 30s');
    await until(others, (s) => [...s.trick.cards, ...(s.lastTrick?.cards ?? [])].some((p) => p.seat === back.seat && cardKey(p.card) === cardKey(mine)), 5000, 'human card accepted');
    const errs = [...others, back].flatMap((c) => c.errors().map((e) => `${c.name}: ${e}`));
    assert.deepEqual(errs, [], `errorMsg: ${short(errs)}`);
  } finally {
    dump('x3.payloads', Object.fromEntries([...clients, ...(back ? [back] : [])].map((c, i) => [c.name + (i >= clients.length ? '-2' : ''), c.log])));
    [...clients, ...(back ? [back] : [])].forEach((c) => c.close());
    await srv.stop();
  }
});
