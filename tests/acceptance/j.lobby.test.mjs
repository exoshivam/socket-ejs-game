// J1-J4 (PRD §6, §2.1-2.6): Play Now matching, private rooms, join gates, start gates.
// Every case gets a fresh server so leftover rooms can't change what Play Now picks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, makeRoom, startMatch, connect, short } from './lib.mjs';

const norm = (n) => n.trim().toLowerCase().replace(/\s+/g, ' ');

async function withServer(name, fn) {
  const srv = await startServer(name);
  const opened = [];
  const conn = async (n) => {
    const c = await connect(srv.url, n);
    opened.push(c);
    return c;
  };
  const room = async (opts) => {
    const r = await makeRoom(srv.url, opts);
    opened.push(...r.clients);
    return r;
  };
  try {
    await fn({ conn, room });
  } finally {
    opened.forEach((c) => c.close());
    await srv.stop();
  }
}

async function quickPlay(conn, name, gameType = 'teamcallbreak') {
  const q = await conn(name);
  q.emit('quickPlay', { name, avatar: 'mage', gameType });
  const joined = await q.waitFor('roomJoined', () => true, 3000).catch(() => null);
  return { q, joined, err: q.errors()[0] ?? null };
}

const isHostIn = (room, name) => room.players.find((p) => p.name === name)?.isHost === true;

test('J0: createRoom rejects game types other than callbreak/teamcallbreak (§2.1)', () =>
  withServer('j0', async ({ conn }) => {
    const c = await conn('Host');
    const err = await c.expectError('createRoom', { name: 'Host', avatar: 'mage', gameType: 'poker', type: 'public' });
    assert.ok(err, 'gameType "poker" was accepted');
  }));

test('J1a: Play Now joins a public waiting team room with a free seat', () =>
  withServer('j1a', async ({ conn, room }) => {
    const { roomId } = await room({ n: 2, type: 'public', prefix: 'A' });
    const { joined, err } = await quickPlay(conn, 'Q1');
    assert.ok(joined, `no roomJoined, errorMsg=${err}`);
    assert.equal(joined.roomId, roomId, `joined ${joined.roomId}, want the existing public room ${roomId}`);
    assert.equal(joined.gameType, 'teamcallbreak');
  }));

test('J1b: Play Now picks the oldest matching room', () =>
  withServer('j1b', async ({ conn, room }) => {
    const older = await room({ n: 1, type: 'public', prefix: 'A' });
    await room({ n: 1, type: 'public', prefix: 'B' });
    const { joined } = await quickPlay(conn, 'Q1');
    assert.equal(joined?.roomId, older.roomId, `joined ${joined?.roomId}, want oldest ${older.roomId}`);
  }));

test('J1c: Play Now ignores rooms of another game and creates a public room with the player as host', () =>
  withServer('j1c', async ({ conn, room }) => {
    const other = await room({ n: 1, type: 'public', gameType: 'callbreak', prefix: 'C' });
    const { joined, err } = await quickPlay(conn, 'Q1');
    assert.ok(joined, `no roomJoined, errorMsg=${err}`);
    assert.notEqual(joined.roomId, other.roomId, 'matched a 4p Call Break room for a Team Call Break Play Now');
    assert.equal(joined.type, 'public');
    assert.equal(joined.gameType, 'teamcallbreak');
    assert.ok(isHostIn(joined, 'Q1'), `creator is not host: ${short(joined.players)}`);
    assert.ok(joined.players.find((p) => p.name === 'Q1')?.connected, 'creator not marked connected');
  }));

test('J1d: Play Now skips a started public room', () =>
  withServer('j1d', async ({ conn, room }) => {
    const r = await room({ n: 6, type: 'public', prefix: 'S' });
    await startMatch(r.clients);
    const { joined, err } = await quickPlay(conn, 'Q1');
    assert.ok(joined, `no roomJoined, errorMsg=${err}`);
    assert.notEqual(joined.roomId, r.roomId, 'Play Now joined a room that is already playing');
  }));

test('J1e: Play Now skips a full waiting public room', () =>
  withServer('j1e', async ({ conn, room }) => {
    const r = await room({ n: 6, type: 'public', prefix: 'F' });
    const { joined, err } = await quickPlay(conn, 'Q1');
    assert.ok(joined, `no roomJoined, errorMsg=${err}`);
    assert.notEqual(joined.roomId, r.roomId, 'Play Now joined a full room');
  }));

test('J1f: a room created by Play Now can be filled by Play Now and started by its host', () =>
  withServer('j1f', async ({ conn }) => {
    const qs = [];
    for (let i = 1; i <= 6; i++) qs.push(await quickPlay(conn, `Q${i}`));
    const ids = new Set(qs.map((x) => x.joined?.roomId));
    assert.equal(ids.size, 1, `6 Play Now players spread over rooms ${[...ids]}`);
    const host = qs[0].q;
    await Promise.all(qs.map((x) => x.q.waitFor('tcb:session', () => true, 3000, 0)));
    const since = qs.map((x) => x.q.log.length);
    host.emit('tcb:start', { roomId: host.roomId });
    await Promise.all(qs.map((x, i) => x.q.waitFor('tcb:state', () => true, 5000, since[i])));
  }));

test('J1g: Play Now never seats a duplicate name', () =>
  withServer('j1g', async ({ conn, room }) => {
    await room({ n: 2, type: 'public', prefix: 'D' }); // D1, D2
    const { joined, err } = await quickPlay(conn, ' d1 ');
    assert.ok(joined || err, 'duplicate-name Play Now got neither roomJoined nor errorMsg');
    if (joined) {
      const names = joined.players.map((p) => norm(p.name));
      assert.equal(new Set(names).size, names.length, `duplicate name seated: ${short(joined.players)}`);
    }
  }));

test('J2: a private room is never returned by Play Now; join by code works', () =>
  withServer('j2', async ({ conn, room }) => {
    const priv = await room({ n: 1, type: 'private', prefix: 'P' });
    const { joined, err } = await quickPlay(conn, 'Q1');
    assert.ok(joined, `no roomJoined, errorMsg=${err}`);
    assert.notEqual(joined.roomId, priv.roomId, 'Play Now joined a private room');
    const c = await conn('ByCode');
    c.emit('joinRoom', { roomId: priv.roomId, name: 'ByCode', avatar: 'mage' });
    const r = await c.waitFor('roomJoined', () => true, 3000);
    assert.equal(r.roomId, priv.roomId);
    assert.equal(r.type, 'private');
  }));

test('J3: join by code is rejected for a started room and for a 7th player', () =>
  withServer('j3', async ({ conn, room }) => {
    const started = await room({ n: 6, prefix: 'S' });
    await startMatch(started.clients);
    const late = await conn('Late');
    const e1 = await late.expectError('joinRoom', { roomId: started.roomId, name: 'Late', avatar: 'mage' });
    assert.ok(e1, 'joined a started room by code');

    const full = await room({ n: 6, prefix: 'F' });
    const seventh = await conn('Seventh');
    const e2 = await seventh.expectError('joinRoom', { roomId: full.roomId, name: 'Seventh', avatar: 'mage' });
    assert.match(e2 ?? '', /full/i, `7th player: errorMsg=${JSON.stringify(e2)}, want "Room full"`);
    assert.equal(seventh.log.filter((e) => e.event === 'roomJoined').length, 0, '7th player got roomJoined');
  }));

test('J4: tcb:start rejected with <6 players or from a non-host', () =>
  withServer('j4', async ({ conn, room }) => {
    const r = await room({ n: 5, prefix: 'P' });
    const e1 = await r.clients[0].expectError('tcb:start', { roomId: r.roomId });
    assert.ok(e1, 'host started with 5/6');
    const sixth = await conn('P6');
    sixth.emit('joinRoom', { roomId: r.roomId, name: 'P6', avatar: 'mage' });
    await sixth.waitFor('roomJoined', () => true, 3000);
    await sixth.waitFor('tcb:session', () => true, 3000, 0);
    const e2 = await r.clients[2].expectError('tcb:start', { roomId: r.roomId });
    assert.ok(e2, 'non-host started the match');
    const noState = [...r.clients, sixth].flatMap((c) => c.states());
    assert.deepEqual(noState, [], `a rejected start still sent tcb:state: ${short(noState[0])}`);
  }));
