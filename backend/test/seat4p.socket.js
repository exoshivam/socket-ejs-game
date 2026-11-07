const { spawn } = require('child_process');
const { io } = require(process.argv[2]);
const assert = require('assert');
const srv = { kill() {} }; // server is started separately on :3999
const U = 'http://localhost:3999';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const conn = () => new Promise(r => { const s = io(U, { transports: ['websocket'] }); s.on('connect', () => r(s)); });
const once = (s, ev) => new Promise(r => s.once(ev, r));
(async () => {
  setTimeout(() => { console.log('TIMEOUT'); process.exit(3); }, 60000);
  const host = await conn();
  host.emit('createRoom', { name: 'test', avatar: 'M', gameType: 'callbreak', type: 'private' });
  const room = await once(host, 'roomJoined');
  const id = room.roomId;
  const a = await conn();
  a.emit('joinRoom', { roomId: id, name: 'Bob', avatar: 'R' });
  await once(a, 'roomJoined');
  const b = await conn();
  b.emit('joinRoom', { roomId: id, name: ' TEST ', avatar: 'R' });
  assert.match(await once(b, 'errorMsg'), /already taken/); console.log('ok duplicate name rejected (case/space-insensitive)');
  // host reload within grace keeps seat + host
  host.disconnect(); await sleep(500);
  const host2 = await conn();
  host2.emit('rejoinRoom', { roomId: id, name: 'test', avatar: 'M' });
  const r2 = await once(host2, 'roomJoined');
  assert.ok(r2.players.find(p => p.name === 'test').isHost); assert.equal(r2.players.length, 2);
  console.log('ok reload within grace keeps seat and host');
  // host leaves for good: after grace, host moves to Test
  const msgs = []; a.on('systemMessage', m => msgs.push(m));
  host2.disconnect();
  const upd = await new Promise(r => a.on('updatePlayers', l => { if (l.length === 1) r(l); }));
  assert.equal(upd[0].name, 'Bob'); assert.ok(upd[0].isHost);
  assert.ok(msgs.includes('Bob is now the host'));
  console.log('ok host removed after grace, host moved, systemMessage sent');
  // last player leaves: room deleted
  a.disconnect(); await sleep(15500);
  const c = await conn();
  c.emit('joinRoom', { roomId: id, name: 'x', avatar: 'x' });
  assert.match(await once(c, 'errorMsg'), /Room not found/); console.log('ok empty room deleted');
  c.disconnect(); b.disconnect(); srv.kill(); process.exit(0);
})().catch(e => { console.error('FAIL', e); srv.kill(); process.exit(1); });
