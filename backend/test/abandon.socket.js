const { io } = require(process.argv[2]);
const assert = require('assert');
const conn = () => new Promise(r => { const s = io('http://localhost:3999', { transports: ['websocket'], forceNew: true }); s.on('connect', () => r(s)); });
const once = (s, ev) => new Promise(r => s.once(ev, r));
(async () => {
  setTimeout(() => { console.log('TIMEOUT'); process.exit(3); }, 15000);
  const ss = [];
  const h = await conn(); ss.push(h);
  h.emit('createRoom', { name: 'A1', avatar: 'a', gameType: 'teamcallbreak', type: 'private' });
  const { roomId } = await once(h, 'roomJoined');
  for (let i = 2; i <= 6; i++) { const s = await conn(); ss.push(s); s.emit('joinRoom', { roomId, name: 'A' + i, avatar: 'a' }); await once(s, 'tcb:session'); }
  h.emit('tcb:start', { roomId }); await once(h, 'tcb:state');
  ss.forEach(s => s.disconnect());
  await new Promise(r => setTimeout(r, 800));
  const x = await conn();
  x.emit('joinRoom', { roomId, name: 'X', avatar: 'a' });
  assert.match(await once(x, 'errorMsg'), /Room not found/);
  console.log('ok abandoned match room deleted'); process.exit(0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
