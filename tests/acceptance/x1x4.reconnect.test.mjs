// X1 (pause + token rejoin within 60s) and X4 (identity) from PRD §6. RULES §15.1, §15.5.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, makeRoom, startMatch, Driver, until, connect, cardKey, dump, short } from './lib.mjs';

const tricksDone = (s) => s.roundTricks.A + s.roundTricks.B;
const sorted = (cards) => cards.map(cardKey).sort();

test('X1 + X4: pause on disconnect, token rejoin restores state, identity checks', { timeout: 120_000 }, async (t) => {
  const srv = await startServer('x1x4');
  let clients = [];
  const extra = [];
  try {
    ({ clients } = await makeRoom(srv.url));
    // Freeze everyone once trick 1 of round 1 is complete. Path A every round keeps it simple.
    const gate = (s) => !(s.round === 1 && s.phase === 'playing' && tricksDone(s) >= 1);
    const drivers = clients.map((c) => new Driver(c, { pathFor: () => 'A', gate }));
    await startMatch(clients);
    await until(clients, (s) => s.phase === 'playing' && tricksDone(s) === 1 && s.trick.cards.length === 0, 30_000, 'trick 1 complete');

    const leaderSeat = clients[0].state.activeSeat;
    const leader = clients.find((c) => c.seat === leaderSeat);
    const victim = clients.find((c) => c.seat === (leaderSeat % 6) + 1);
    const others = clients.filter((c) => c !== victim);
    const before = victim.state;
    const leaderCard = leader.state.legalCards[0];

    await t.test('X1: disconnect sets paused and rejects actions', async () => {
      victim.close();
      await until(others, (s) => s.paused?.seats?.includes(victim.seat), 5000, `paused.seats includes ${victim.seat}`);
      const p = others[0].state.paused;
      const left = p.deadline - Date.now();
      assert.ok(left > 50_000 && left <= 61_000, `deadline should be ~60s out, is ${left}ms (§15.2). paused=${short(p)}`);
      assert.equal(others[0].state.seats[victim.seat - 1].connected, false, 'seat shown disconnected');
      const sinceStates = leader.states().length;
      const err = await leader.expectError('tcb:playCard', { roomId: leader.roomId, card: leaderCard });
      assert.ok(err, `playCard while paused was not rejected. leader state: ${short(leader.state)}`);
      const changed = leader.states().slice(sinceStates).find((s) => s.trick.cards.length > 0);
      assert.equal(changed, undefined, `trick changed while paused: ${short(changed)}`);
    });

    await t.test('X1: tcb:rejoin with token within 60s restores identical state', async () => {
      const back = await connect(srv.url, victim.name);
      extra.push(back);
      back.emit('tcb:rejoin', { roomId: victim.roomId, token: victim.token });
      await back.waitFor('roomJoined', () => true, 5000, 0);
      const sess = await back.waitFor('tcb:session', () => true, 5000, 0);
      const after = await back.waitFor('tcb:state', () => true, 5000, 0);
      assert.equal(sess.seat, victim.seat, 'same seat after rejoin');
      assert.deepEqual(sorted(after.myHand), sorted(before.myHand), 'hand identical (§15.5)');
      assert.equal(after.trump, before.trump, 'trump identical');
      assert.deepEqual(after.roundTricks, before.roundTricks, 'round tricks identical');
      assert.deepEqual(after.match, before.match, 'match scores identical');
      assert.deepEqual(after.trick, before.trick, 'current trick identical');
      assert.deepEqual(after.lastTrick, before.lastTrick, 'last trick identical');
      await until(others, (s) => s.paused === null && s.seats[victim.seat - 1].connected, 5000, 'pause cleared after rejoin');
      // Play resumes: unfreeze and let two more tricks happen with the rejoined socket driving the seat.
      drivers.forEach((d) => (d.gate = null));
      const d = new Driver(back, { pathFor: () => 'A' });
      drivers.forEach((x) => x.kick());
      d.kick();
      await until([...others, back], (s) => tricksDone(s) >= 3, 20_000, 'two more tricks after resume');
      // The only expected errorMsg is the one the leader got while paused.
      const errs = [...others, back].flatMap((c) => c.errors().map((e) => `${c.name}: ${e}`));
      assert.equal(errs.length, 1, `unexpected errorMsg: ${short(errs)}`);
    });

    await t.test('X4: wrong token and seated name mid-match are rejected', async () => {
      const stranger = await connect(srv.url, 'Mallory');
      extra.push(stranger);
      const e1 = await stranger.expectError('tcb:rejoin', { roomId: victim.roomId, token: 'not-the-token' });
      assert.ok(e1, 'tcb:rejoin with a wrong token was not rejected');
      const e2 = await stranger.expectError('joinRoom', { roomId: victim.roomId, name: clients[1].name, avatar: 'mage' });
      assert.ok(e2, `joinRoom as seated player "${clients[1].name}" mid-match was not rejected`);
      const e3 = await stranger.expectError('joinRoom', { roomId: victim.roomId, name: ` ${clients[1].name.toLowerCase()} `, avatar: 'mage' });
      assert.ok(e3, 'joinRoom with case/space variant of a seated name was not rejected');
      const got = stranger.log.filter((e) => ['tcb:state', 'tcb:session', 'roomJoined'].includes(e.event));
      assert.deepEqual(got, [], `stranger received game data: ${short(got)}`);
    });
  } finally {
    dump('x1x4.payloads', Object.fromEntries([...clients, ...extra].map((c) => [c.name + (extra.includes(c) ? '-2' : ''), c.log])));
    [...clients, ...extra].forEach((c) => c.close());
    await srv.stop();
  }
});
