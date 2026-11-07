// B3 full-match acceptance over sockets. Server on :3999 with TCB_DISCONNECT_MS=1000 TCB_ROUND_PAUSE_MS=150 TCB_BOT_DELAY_MS=20 TCB_TRICK_PAUSE_MS=400
const HOLD = 400;
const { io } = require(process.argv[2]);
const assert = require('assert');
const U = 'http://localhost:3999';
const conn = () => new Promise(r => { const s = io(U, { transports: ['websocket'], forceNew: true }); s.on('connect', () => r(s)); });
const once = (s, ev, ms = 4000) => new Promise((r, j) => { const t = setTimeout(() => j(new Error('timeout ' + ev)), ms); s.once(ev, x => { clearTimeout(t); r(x); }); });
const until = (s, ev, pred, ms = 8000) => new Promise((r, j) => {
  const t = setTimeout(() => { s.off(ev, h); j(new Error('timeout waiting ' + ev)); }, ms);
  const h = x => { if (pred(x)) { clearTimeout(t); s.off(ev, h); r(x); } };
  s.on(ev, h);
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const key = c => c.suit + c.rank;

const P = {}; // seat -> { sock, token, states: [], last }
const states = []; // every payload: { seat, v }
const errors = [];
let roomId;

function attach(seat, sock) {
  const p = P[seat];
  p.sock = sock;
  p.acted = null;
  sock.on('errorMsg', m => { errors.push({ seat, m }); p.acted = null; }); // retry on the next state
  sock.on('tcb:state', v => {
    states.push({ seat, v });
    p.last = v;
    if (!p.auto || v.paused || v.activeSeat !== v.mySeat) return;
    const k = `${v.round}|${v.phase}|${v.trick.leader}|${v.trick.cards.length}|${v.roundTricks.A + v.roundTricks.B}`;
    if (p.acted === k) return;
    p.acted = k;
    if (v.phase === 'choosingPath') sock.emit('tcb:choosePath', { roomId, path: v.round % 2 ? 'B' : 'A' });
    else if (v.phase === 'choosingTrump') sock.emit('tcb:chooseTrump', { roomId, suit: v.trumpOptions[0] });
    else if (v.phase === 'playing') sock.emit('tcb:playCard', { roomId, card: v.legalCards[0] });
  });
}

(async () => {
  setTimeout(() => { console.log('TIMEOUT'); process.exit(3); }, 90000);
  const host = await conn();
  host.emit('createRoom', { name: 'H1', avatar: 'a', gameType: 'teamcallbreak', type: 'private' });
  const [room, s1] = await Promise.all([once(host, 'roomJoined'), once(host, 'tcb:session')]);
  roomId = room.roomId;
  P[1] = { token: s1.token, auto: false }; // held until the chat check
  attach(1, host);
  for (let i = 2; i <= 6; i++) {
    const s = await conn();
    s.emit('joinRoom', { roomId, name: 'H' + i, avatar: 'a' });
    const ss = await once(s, 'tcb:session');
    P[ss.seat] = { token: ss.token, auto: true };
    attach(ss.seat, s);
  }
  // Trick hold, seen from P1 (never disconnects): next lead no earlier than HOLD after the trick completed.
  const holds = []; // { t0, until, winner, nextAt }
  let probed = false;
  host.on('tcb:state', v => {
    const now = Date.now();
    const key = v.round + '|' + (v.roundTricks.A + v.roundTricks.B);
    const last = holds[holds.length - 1];
    if (v.phase === 'trickEnd') {
      if (last && last.key === key) return; // same hold, re-broadcast
      const winner = v.lastTrick.winner;
      holds.push({ key, t0: now, until: v.trickHoldUntil, winner, bot: v.seats[winner - 1].bot, cards: v.trick.cards.length });
      if (!probed && !v.seats[winner - 1].bot && P[winner].auto) {
        probed = true; // the winner (a human) tries to lead during the hold
        const w = P[winner];
        w.sock.emit('tcb:playCard', { roomId, card: w.last.myHand[0] });
        until(w.sock, 'errorMsg', m => /still on the table/.test(m)).then(() => (probed = 'rejected'), () => (probed = 'no error'));
      }
    } else if (last && last.nextAt === undefined && ((v.phase === 'playing' && v.trick.cards.length === 1) || v.phase === 'roundEnd' || v.phase === 'matchEnd')) {
      last.nextAt = now;
    }
  });
  host.emit('tcb:start', { roomId });
  const first = await until(host, 'tcb:state', v => v.phase === 'choosingPath');
  // chat closed during trump selection
  P[2].sock.emit('chatMessage', { roomId, name: 'H2', text: 'go spades' });
  await until(P[2].sock, 'errorMsg', m => /Chat is closed/.test(m));
  P[1].auto = true;
  host.emit('tcb:choosePath', { roomId, path: 'B' });
  console.log('ok start, chat blocked while choosing; round', first.round);

  // X1: in round 2 mid-trick, seat 3 drops: pause, actions rejected, rejoin restores identical hand
  await until(P[1].sock, 'tcb:state', v => v.round === 2, 20000);
  P[3].auto = false; // seat 3 stops acting; the game waits at its turn at worst
  await until(P[1].sock, 'tcb:state', v => v.round === 2 && v.phase === 'playing' && (v.trick.cards.length >= 2 || v.activeSeat === 3), 20000);
  await sleep(100);
  const handBefore = P[3].last.myHand.map(key).sort();
  P[3].sock.disconnect();
  const pausedView = await until(P[1].sock, 'tcb:state', v => v.paused && v.paused.seats.includes(3));
  assert.ok(pausedView.paused.deadline > Date.now());
  const prober = P[pausedView.activeSeat === 3 ? 1 : pausedView.activeSeat];
  prober.sock.emit('tcb:playCard', { roomId, card: prober.last.myHand[0] });
  await until(prober.sock, 'errorMsg', m => /paused/.test(m));
  await sleep(200);
  const s3 = await conn();
  P[3].auto = true;
  attach(3, s3);
  s3.emit('tcb:rejoin', { roomId, token: P[3].token });
  const back = await until(s3, 'tcb:state', v => !v.paused);
  assert.deepEqual(back.myHand.map(key).sort(), handBefore);
  console.log('ok X1 pause on disconnect, actions rejected, token rejoin resumes with identical hand');

  // X2: in round 3 seat 4 drops for good -> bot after 1s, game keeps going
  await until(P[1].sock, 'tcb:state', v => v.round === 3 && v.phase === 'playing', 20000);
  P[4].auto = false;
  P[4].sock.disconnect();
  await until(P[1].sock, 'updatePlayers', l => l.find(p => p.seat === 4).bot === true, 5000);
  await until(P[1].sock, 'tcb:state', v => v.round === 4, 20000);
  console.log('ok X2 bot took seat 4 after timeout and play continued');

  // X3: seat 4 returns in round 5 -> control back
  await until(P[1].sock, 'tcb:state', v => v.round === 5 && v.phase === 'playing', 20000);
  const s4 = await conn();
  P[4].auto = true;
  attach(4, s4);
  s4.emit('tcb:rejoin', { roomId, token: P[4].token });
  const pl = await until(s4, 'updatePlayers', l => l.find(p => p.seat === 4).connected);
  assert.equal(pl.find(p => p.seat === 4).bot, false);
  console.log('ok X3 player back, bot flag cleared');

  const end = await until(P[1].sock, 'tcb:state', v => v.phase === 'matchEnd', 30000);
  assert.equal(end.match.rounds.length, 5);
  assert.ok(end.match.winner);
  assert.equal(end.match.tricks.A + end.match.tricks.B, 40);
  console.log('ok match completed:', end.match.winner, end.match.decidedBy, end.match.points, end.match.tricks);

  // V1 over the wire: per round, a seat's 8 cards = the cards it played; no payload shows another seat's unplayed cards.
  const played = {}; // round -> seat -> Set
  for (const { v } of states) for (const t of [v.trick, v.lastTrick]) if (t) for (const pc of t.cards) {
    ((played[v.round] ??= {})[pc.seat] ??= new Set()).add(key(pc.card));
  }
  let checked = 0;
  for (const { seat, v } of states) {
    const pub = new Set([...(v.openedCards || []), ...v.trick.cards.map(x => x.card), ...((v.lastTrick && v.lastTrick.cards.map(x => x.card)) || [])].map(key));
    const mine = played[v.round][seat];
    assert.equal(mine.size, 8);
    const walk = o => Array.isArray(o) ? o.forEach(walk) : o && typeof o === 'object' ? (typeof o.suit === 'string' && typeof o.rank === 'string' ? found.push(key(o)) : Object.values(o).forEach(walk)) : 0;
    const found = [];
    walk(v);
    for (const k of found) assert.ok(mine.has(k) || pub.has(k), `seat ${seat} round ${v.round} ${v.phase} saw ${k}`);
    const isMate = seat !== v.chooser && (seat % 2) === (v.chooser % 2);
    if (isMate && !v.trump) assert.equal(v.myHand.length, v.path === 'B' ? 5 : 0);
    if (isMate && !v.trump) assert.equal(v.myHiddenCount, v.path === 'B' ? 3 : 5);
    checked++;
  }
  console.log(`ok V1 no leak across ${checked} tcb:state payloads`);

  // trick hold: every completed trick showed 6 cards, a deadline, and nothing moved before the hold ended
  const done = holds.filter(h => h.nextAt !== undefined);
  assert.equal(holds.length, 40, 'every trick held');
  for (const h of done) {
    assert.equal(h.cards, 6);
    assert.ok(h.until >= h.t0, 'trickHoldUntil in the future');
    assert.ok(h.nextAt - h.t0 >= HOLD - 50, `next action after ${h.nextAt - h.t0}ms (< hold ${HOLD})`);
  }
  const botWins = done.filter(h => h.bot).length;
  assert.equal(probed, 'rejected');
  console.log(`ok trick hold: 40/40 tricks held >= ${HOLD}ms (min ${Math.min(...done.map(h => h.nextAt - h.t0))}ms), human lead during hold rejected; ${botWins} tricks won by the bot also held`);

  // unexpected errors: only the ones the test provoked
  const unexpected = errors.filter(e => !/Chat is closed|paused|still on the table/.test(e.m));
  assert.deepEqual(unexpected, []);

  // rematch: host -> everyone gets roomJoined waiting
  const waits = [2, 5].map(s => until(P[s].sock, 'roomJoined', r => r.phase === 'waiting'));
  P[1].sock.emit('tcb:rematch', { roomId });
  await Promise.all(waits);
  console.log('ok rematch returns everyone to waiting');
  Object.values(P).forEach(p => p.sock.disconnect());
  process.exit(0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
