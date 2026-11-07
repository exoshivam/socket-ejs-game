// Shared harness for the Team Call Break socket acceptance tests (docs/PRD-team-call-break.md §6).
// Each suite spawns its own throwaway server on a free port (never :3000), unless CB_URL is set.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
// socket.io-client is already installed for the frontend; reuse it instead of adding a dependency.
const { io } = createRequire(path.join(root, 'frontend/package.json'))('socket.io-client');

export const OUT = process.env.CB_OUT || path.join(here, '.out');
mkdirSync(OUT, { recursive: true });

const freePort = () =>
  new Promise((res, rej) => {
    const s = createServer();
    s.once('error', rej);
    s.listen(0, () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
  });

const FAST = { TCB_TRICK_PAUSE_MS: '200', TCB_ROUND_PAUSE_MS: '150', TCB_BOT_DELAY_MS: '20' };

/** Starts backend/server.js on a free port. Returns { url, stop, log }. */
export async function startServer(name) {
  if (process.env.CB_URL) return { url: process.env.CB_URL, stop: async () => {}, log: () => '' };
  const port = await freePort();
  if (port === 3000) throw new Error('refusing to use :3000');
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.join(root, 'backend'),
    // Short trick/round/bot pauses keep a full match fast; the 60s disconnect timeout (RULES §15) stays real.
    // CB_REAL_TIMERS=1 runs every timer at its server default.
    env: { ...(process.env.CB_REAL_TIMERS ? {} : FAST), ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (d) => (out += d));
  child.stderr.on('data', (d) => (out += d));
  const url = `http://localhost:${port}`;
  const deadline = Date.now() + 15000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`server exited ${child.exitCode}:\n${out}`);
    try {
      const r = await fetch(`${url}/socket.io/?EIO=4&transport=polling`);
      if (r.ok) break;
    } catch {}
    if (Date.now() > deadline) throw new Error(`server not up on ${port}:\n${out}`);
    await sleep(100);
  }
  return {
    url,
    log: () => out,
    stop: async () => {
      writeFileSync(path.join(OUT, `${name}.server.log`), out);
      child.kill();
      await new Promise((r) => (child.exitCode !== null ? r() : child.once('exit', r)));
    },
  };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** One player socket that records every payload it receives. */
export class Client {
  constructor(url, name, avatar = 'mage') {
    this.url = url;
    this.name = name;
    this.avatar = avatar;
    this.log = []; // { event, payload, t }
    this.waiters = [];
    this.ready = this.connect();
  }
  connect() {
    this.socket = io(this.url, { transports: ['websocket'], forceNew: true, reconnection: false });
    this.socket.onAny((event, payload) => {
      this.log.push({ event, payload, t: Date.now() });
      if (event === 'tcb:session') Object.assign(this, { roomId: payload.roomId, seat: payload.seat, token: payload.token });
      if (event === 'tcb:state') this.state = payload;
      for (const w of [...this.waiters]) if (w.event === event && w.pred(payload)) w.done(payload);
    });
    return new Promise((res, rej) => {
      this.socket.once('connect', res);
      this.socket.once('connect_error', rej);
    });
  }
  emit(event, payload) {
    this.log.push({ event: `>${event}`, payload, t: Date.now() });
    this.socket.emit(event, payload);
  }
  /** Resolves with the first matching payload received from now on (or already in `since` index onward). */
  waitFor(event, pred = () => true, timeout = 5000, since = this.log.length) {
    const hit = this.log.slice(since).find((e) => e.event === event && pred(e.payload));
    if (hit) return Promise.resolve(hit.payload);
    return new Promise((res, rej) => {
      const w = { event, pred };
      const timer = setTimeout(() => {
        this.waiters.splice(this.waiters.indexOf(w), 1);
        rej(new Error(`${this.name}: timed out after ${timeout}ms waiting for ${event}`));
      }, timeout);
      w.done = (p) => {
        clearTimeout(timer);
        this.waiters.splice(this.waiters.indexOf(w), 1);
        res(p);
      };
      this.waiters.push(w);
    });
  }
  /** Emits and waits for an errorMsg. Returns the message, or null if none arrived. */
  async expectError(event, payload, timeout = 1500) {
    const since = this.log.length;
    this.emit(event, payload);
    return this.waitFor('errorMsg', () => true, timeout, since).catch(() => null);
  }
  close() {
    this.socket.disconnect();
  }
  states() {
    return this.log.filter((e) => e.event === 'tcb:state').map((e) => e.payload);
  }
  errors() {
    return this.log.filter((e) => e.event === 'errorMsg').map((e) => e.payload);
  }
}

export async function connect(url, name, avatar) {
  const c = new Client(url, name, avatar);
  await c.ready;
  return c;
}

/** Host creates a team room; n-1 others join by code. Returns clients in join order. */
export async function makeRoom(url, { n = 6, type = 'private', gameType = 'teamcallbreak', prefix = 'P' } = {}) {
  const host = await connect(url, `${prefix}1`);
  host.emit('createRoom', { name: host.name, avatar: host.avatar, gameType, type });
  const room = await host.waitFor('roomJoined');
  const clients = [host];
  for (let i = 2; i <= n; i++) {
    const c = await connect(url, `${prefix}${i}`);
    c.emit('joinRoom', { roomId: room.roomId, name: c.name, avatar: c.avatar });
    await c.waitFor('roomJoined');
    clients.push(c);
  }
  if (gameType === 'teamcallbreak') await Promise.all(clients.map((c) => c.waitFor('tcb:session', () => true, 3000, 0).catch(() => null)));
  return { roomId: room.roomId, clients };
}

export async function startMatch(clients) {
  const since = clients.map((c) => c.log.length);
  clients[0].emit('tcb:start', { roomId: clients[0].roomId });
  await Promise.all(clients.map((c, i) => c.waitFor('tcb:state', () => true, 5000, since[i])));
}

/**
 * Auto-player: acts whenever the latest tcb:state says it is this seat's move.
 * pathFor(round) picks the path when choosing. hold=true pauses all actions until kick().
 */
export class Driver {
  constructor(client, { pathFor = (r) => (r % 2 ? 'B' : 'A'), gate = null } = {}) {
    this.c = client;
    this.pathFor = pathFor;
    this.gate = gate; // (state) => false freezes this driver on that state
    this.hold = false;
    this.done = new Set();
    this.onState = () => this.kick();
    client.socket.on('tcb:state', this.onState);
  }
  detach() {
    this.c.socket.off('tcb:state', this.onState);
  }
  kick() {
    const s = this.c.state;
    if (this.hold || !s || s.paused || (this.gate && !this.gate(s))) return;
    const me = s.mySeat;
    let key, event, payload;
    if (s.phase === 'choosingPath' && s.chooser === me && s.path === null) {
      key = `${s.round}:path`;
      event = 'tcb:choosePath';
      payload = { roomId: s.roomId, path: this.pathFor(s.round) };
    } else if (s.phase === 'choosingTrump' && s.chooser === me && s.trump === null && s.trumpOptions.length) {
      key = `${s.round}:trump`;
      event = 'tcb:chooseTrump';
      payload = { roomId: s.roomId, suit: s.trumpOptions[0] };
    } else if (s.phase === 'playing' && s.activeSeat === me && s.legalCards.length) {
      key = `${s.round}:${s.roundTricks.A + s.roundTricks.B}:${s.trick.cards.length}`;
      event = 'tcb:playCard';
      payload = { roomId: s.roomId, card: s.legalCards[0] };
    } else return;
    if (this.done.has(key)) return;
    this.done.add(key);
    this.c.emit(event, payload);
  }
}

export const cardKey = (c) => `${c.rank}${c.suit}`;

/** Every {suit, rank} object in a payload, with its JSON path. */
export function cardsIn(obj, at = '$', out = []) {
  if (obj && typeof obj === 'object') {
    if ('suit' in obj && 'rank' in obj) out.push({ at, card: cardKey(obj) });
    for (const [k, v] of Object.entries(obj)) cardsIn(v, `${at}.${k}`, out);
  }
  return out;
}

export function dump(name, data) {
  const file = path.join(OUT, `${name}.json`);
  writeFileSync(file, JSON.stringify(data, null, 1));
  return file;
}

export const short = (x, n = 1500) => {
  const s = JSON.stringify(x) ?? String(x);
  return s.length > n ? s.slice(0, n) + '…' : s;
};

/** Waits until every client's latest state satisfies pred. */
export async function until(clients, pred, timeout, label) {
  const end = Date.now() + timeout;
  while (!clients.every((c) => c.state && pred(c.state, c))) {
    if (Date.now() > end) {
      const errs = clients.flatMap((c) => c.errors().map((e) => `${c.name}: ${e}`));
      throw new Error(`timed out (${timeout}ms) waiting for: ${label}. errorMsg so far: ${short(errs)}. last state P1: ${short(clients[0].state, 800)}`);
    }
    await sleep(50);
  }
}
