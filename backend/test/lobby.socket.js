// B2 lobby acceptance (J1-J4, X4, seats). Usage: node lobby_test.js <socket.io-client path>; server on :3999
const { io } = require(process.argv[2]);
const assert = require('assert');
const U = 'http://localhost:3999';
const conn = () => new Promise(r => { const s = io(U, { transports: ['websocket'], forceNew: true }); s.on('connect', () => r(s)); });
const once = (s, ev, ms = 3000) => new Promise((r, j) => { const t = setTimeout(() => j(new Error('timeout ' + ev)), ms); s.once(ev, x => { clearTimeout(t); r(x); }); });
const err = s => once(s, 'errorMsg');
const all = [];
const user = async () => { const s = await conn(); all.push(s); return s; };
(async () => {
  setTimeout(() => { console.log('TIMEOUT'); process.exit(3); }, 30000);
  // createRoom validation
  const x = await user();
  x.emit('createRoom', { name: 'h', avatar: 'a', gameType: 'classic', type: 'public' });
  assert.match(await err(x), /Unknown game type/);
  x.emit('createRoom', { name: 'h', avatar: 'a', gameType: 'teamcallbreak' });
  assert.match(await err(x), /public or private/);
  console.log('ok createRoom validates gameType/type');

  // private team room: host seat 1 + token
  const host = await user();
  host.emit('createRoom', { name: 'Host', avatar: 'a', gameType: 'teamcallbreak', type: 'private' });
  const [room, sess] = await Promise.all([once(host, 'roomJoined'), once(host, 'tcb:session')]);
  assert.equal(room.gameType, 'teamcallbreak'); assert.equal(room.maxPlayers, 6); assert.equal(room.phase, 'waiting');
  assert.equal(sess.seat, 1); assert.ok(sess.token);
  assert.ok(!JSON.stringify(room).includes(sess.token)); console.log('ok private team room, host P1, token not in room payload');

  // J2: Play Now never lands in private room -> creates a new public room
  const q = await user();
  q.emit('quickPlay', { name: 'Q', avatar: 'a', gameType: 'teamcallbreak' });
  const qr = await once(q, 'roomJoined');
  assert.notEqual(qr.roomId, room.roomId); assert.equal(qr.type, 'public'); assert.ok(qr.players[0].isHost);
  // J1: second quickPlay joins that public room; different game creates its own
  const q2 = await user();
  q2.emit('quickPlay', { name: 'Q2', avatar: 'a', gameType: 'teamcallbreak' });
  const [q2r, q2s] = await Promise.all([once(q2, 'roomJoined'), once(q2, 'tcb:session')]);
  assert.equal(q2r.roomId, qr.roomId);
  const q3 = await user();
  q3.emit('quickPlay', { name: 'Q3', avatar: 'a', gameType: 'callbreak' });
  const q3r = await once(q3, 'roomJoined');
  assert.notEqual(q3r.roomId, qr.roomId); assert.equal(q3r.gameType, 'callbreak'); assert.ok(q3r.players[0].isHost);
  console.log('ok J1/J2 Play Now: public+same game only, private never, creates host room');

  // join private by code fills seats 2..6, teams alternate
  const joiners = [];
  for (let i = 2; i <= 6; i++) {
    const s = await user();
    s.emit('joinRoom', { roomId: room.roomId.toLowerCase(), name: 'P' + i, avatar: 'a' });
    const ss = await once(s, 'tcb:session');
    assert.equal(ss.seat, i);
    joiners.push(s);
  }
  const dup = await user();
  dup.emit('joinRoom', { roomId: room.roomId, name: ' host ', avatar: 'a' });
  assert.match(await err(dup), /already taken/);
  dup.emit('joinRoom', { roomId: room.roomId, name: 'Seven', avatar: 'a' });
  assert.match(await err(dup), /Room full/);
  console.log('ok J2/J3 join by code, seats 2..6 in order, dup name + 7th rejected');

  // seats: move needs empty seat; host swap; non-host swap rejected
  joiners[0].emit('tcb:moveSeat', { roomId: room.roomId, seat: 3 });
  assert.match(await err(joiners[0]), /seat is taken/);
  joiners[0].emit('tcb:swapSeats', { roomId: room.roomId, a: 2, b: 3 });
  assert.match(await err(joiners[0]), /Only the host/);
  host.emit('tcb:swapSeats', { roomId: room.roomId, a: 2, b: 3 });
  const up = await once(host, 'updatePlayers');
  const bySeat = n => up.find(p => p.seat === n);
  assert.equal(bySeat(2).name, 'P3'); assert.equal(bySeat(3).name, 'P2'); assert.equal(bySeat(3).team, 'A');
  host.emit('tcb:swapSeats', { roomId: room.roomId, a: 2, b: 3 }); await once(host, 'updatePlayers');
  console.log('ok seats: move/swap rules, team follows seat');

  // J4: start by non-host rejected; start with 6 works; then joins rejected
  joiners[0].emit('tcb:start', { roomId: room.roomId });
  assert.match(await err(joiners[0]), /Only the host/);
  host.emit('tcb:start', { roomId: room.roomId });
  const st = await once(host, 'tcb:state');
  assert.equal(st.phase, 'choosingPath'); assert.equal(st.mySeat, 1);
  const late = await user();
  late.emit('joinRoom', { roomId: room.roomId, name: 'Late', avatar: 'a' });
  assert.match(await err(late), /already started/);
  // X4: name of a seated player mid-match, wrong token
  late.emit('joinRoom', { roomId: room.roomId, name: 'P2', avatar: 'a' });
  assert.match(await err(late), /already started/);
  late.emit('tcb:rejoin', { roomId: room.roomId, token: 'nope' });
  assert.match(await err(late), /Seat not found/);
  console.log('ok J3/J4/X4 start gate, no joins mid-match, bad token rejected');

  // start in a room with <6 players
  q.emit('tcb:start', { roomId: qr.roomId });
  assert.match(await err(q), /All 6 players/);
  console.log('ok J4 start needs 6');

  // rejoin by token updates id to the new socket; tcb:leave frees seat and moves host now
  q2.disconnect();
  const q2b = await user();
  q2b.emit('tcb:rejoin', { roomId: qr.roomId, token: q2s.token });
  const upd = await once(q2b, 'updatePlayers');
  assert.equal(upd.find(p => p.name === 'Q2').id, q2b.id);
  assert.equal(upd.find(p => p.name === 'Q2').connected, true);
  q.emit('tcb:leave', { roomId: qr.roomId });
  const after = await once(q2b, 'updatePlayers');
  assert.equal(after.length, 1); assert.equal(after[0].name, 'Q2'); assert.ok(after[0].isHost);
  q2b.emit('tcb:leave', { roomId: qr.roomId });
  await new Promise(r => setTimeout(r, 200));
  q2b.emit('joinRoom', { roomId: qr.roomId, name: 'Z', avatar: 'a' });
  assert.match(await err(q2b), /Room not found/);
  console.log('ok rejoin sets current socket id; tcb:leave frees seat, moves host, deletes empty room');
  all.forEach(s => s.disconnect()); process.exit(0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
