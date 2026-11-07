// Pause during a trick hold: no collect while paused, full hold again after resume.
// Server: TCB_TRICK_PAUSE_MS=1500 TCB_DISCONNECT_MS=5000 TCB_BOT_DELAY_MS=20 PORT=3999 node server.js
const { io } = require(process.argv[2]);
const assert = require('assert');
const conn = () => new Promise(r => { const s = io('http://localhost:3999', { transports: ['websocket'], forceNew: true }); s.on('connect', () => r(s)); });
const once = (s, ev) => new Promise(r => s.once(ev, r));
const until = (s, ev, pred, ms = 15000) => new Promise((r, j) => {
  const t = setTimeout(() => { s.off(ev, h); j(new Error('timeout ' + ev)); }, ms);
  const h = x => { if (pred(x)) { clearTimeout(t); s.off(ev, h); r(x); } };
  s.on(ev, h);
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  setTimeout(() => { console.log('TIMEOUT'); process.exit(3); }, 40000);
  const P = {};
  let roomId;
  const drive = (seat, sock) => sock.on('tcb:state', v => {
    if (v.paused || v.activeSeat !== v.mySeat) return;
    if (v.phase === 'choosingPath') sock.emit('tcb:choosePath', { roomId, path: 'A' });
    if (v.phase === 'choosingTrump') sock.emit('tcb:chooseTrump', { roomId, suit: v.trumpOptions[0] });
    if (v.phase === 'playing') sock.emit('tcb:playCard', { roomId, card: v.legalCards[0] });
  });
  const h = await conn();
  h.emit('createRoom', { name: 'K1', avatar: 'a', gameType: 'teamcallbreak', type: 'private' });
  ({ roomId } = await once(h, 'roomJoined'));
  P[1] = { sock: h, token: (await once(h, 'tcb:session')).token };
  for (let i = 2; i <= 6; i++) {
    const s = await conn();
    s.emit('joinRoom', { roomId, name: 'K' + i, avatar: 'a' });
    P[i] = { sock: s, token: (await once(s, 'tcb:session')).token };
  }
  for (let i = 1; i <= 6; i++) drive(i, P[i].sock);
  h.emit('tcb:start', { roomId });
  const hold = await until(h, 'tcb:state', v => v.phase === 'trickEnd');
  const dropSeat = hold.lastTrick.winner === 2 ? 3 : 2;
  P[dropSeat].sock.disconnect();
  await until(h, 'tcb:state', v => v.paused && v.phase === 'trickEnd');
  await sleep(2000); // past the 1500ms hold
  const seen = [];
  h.on('tcb:state', v => seen.push(v));
  await sleep(300);
  assert.ok(seen.every(v => v.phase === 'trickEnd'), 'trick not collected while paused');
  const s = await conn();
  drive(dropSeat, s);
  const resumedAt = Date.now();
  s.emit('tcb:rejoin', { roomId, token: P[dropSeat].token });
  const again = await until(h, 'tcb:state', v => !v.paused && v.phase === 'trickEnd');
  assert.ok(again.trickHoldUntil >= resumedAt + 1400, 'fresh full hold after resume');
  const next = await until(h, 'tcb:state', v => v.phase === 'playing' && v.trick.cards.length === 1);
  assert.ok(Date.now() - resumedAt >= 1450);
  assert.equal(next.trick.leader, hold.lastTrick.winner);
  console.log('ok pause during trick hold: no collect while paused, full hold after resume, winner leads');
  process.exit(0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
