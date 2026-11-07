// Team Call Break rooms: lobby (6 seats, tokens) + match handlers around the pure engine.
// Contract: docs/PRD-team-call-break.md §5, shared/teamCallBreak.types.ts.
const crypto = require("crypto");
const E = require("./engine/teamCallBreak.ts");

const SEATS = 6;
const DISCONNECT_MS = Number(process.env.TCB_DISCONNECT_MS) || 60000; // RULES §15 timeout
const ROUND_PAUSE_MS = Number(process.env.TCB_ROUND_PAUSE_MS) || 8000;
const BOT_DELAY_MS = Number(process.env.TCB_BOT_DELAY_MS) || 800;
const TRICK_PAUSE_MS = Number(process.env.TCB_TRICK_PAUSE_MS) || 3000; // completed trick stays on the table
const ABANDON_MS = Number(process.env.TCB_ABANDON_MS) || 5 * 60000;
const CHOOSING = ["choosingPath", "choosingTrump"];

// Server-only data per room, kept off the room object so roomJoined/updatePlayers never carry it.
// { state, tokens: Map<token, player>, pauses: Map<seat, {timer, deadline}>, botTimer, roundTimer, nextRoundAt,
//   holdTimer, trickHoldUntil, abandonTimer }
const priv = new WeakMap();

let io, rooms, deps;

/** deps: { scheduleRemoval(roomId, player), cancelRemoval(player), removePlayer(roomId, player), sameName(a, b), newRoomId() } */
function init(_io, _rooms, _deps) {
  io = _io;
  rooms = _rooms;
  deps = _deps;
}

const isTeam = room => room && room.gameType === "teamcallbreak";
const inMatch = room => room.phase !== "waiting" && room.phase !== "matchEnd";
const teamOf = seat => (seat % 2 === 1 ? "A" : "B");
const bySocket = (room, socket) => room.players.find(p => p.id === socket.id);
const bySeat = (room, seat) => room.players.find(p => p.seat === seat);
const lobbyView = room => ({
  roomId: room.roomId, gameType: room.gameType, type: room.type,
  maxPlayers: room.maxPlayers, phase: room.phase, players: room.players,
});

function freeSeat(room) {
  for (let s = 1; s <= SEATS; s++) if (!bySeat(room, s)) return s;
  return null;
}

function seatPlayer(room, socket, { name, avatar }, isHost) {
  const seat = freeSeat(room);
  const player = { id: socket.id, name, avatar, isHost, connected: true, seat, team: teamOf(seat), bot: false };
  room.players.push(player);
  const token = crypto.randomUUID();
  priv.get(room).tokens.set(token, player);
  socket.join(room.roomId);
  socket.emit("roomJoined", lobbyView(room));
  socket.emit("tcb:session", { roomId: room.roomId, seat, token });
  io.to(room.roomId).emit("updatePlayers", room.players);
  return player;
}

// ---- lobby

function createRoom(socket, { name, avatar, type }) {
  const roomId = deps.newRoomId();
  const room = { roomId, gameType: "teamcallbreak", type, maxPlayers: SEATS, phase: "waiting", players: [] };
  rooms[roomId] = room;
  priv.set(room, { state: null, tokens: new Map(), pauses: new Map() });
  seatPlayer(room, socket, { name, avatar }, true);
  io.to(roomId).emit("systemMessage", `${name} created the room`);
  return room;
}

/** joinRoom / quickPlay into an existing team room. Returns an error string or null. */
function joinRoom(socket, room, { name, avatar }) {
  if (room.phase !== "waiting") return "Game already started";
  if (room.players.some(p => deps.sameName(p.name, name))) return "That name is already taken in this room";
  if (!freeSeat(room)) return "Room full";
  seatPlayer(room, socket, { name, avatar }, false);
  io.to(room.roomId).emit("systemMessage", `${name} has joined the room`);
  return null;
}

const canQuickJoin = (room, name) =>
  room.phase === "waiting" && freeSeat(room) !== null && !room.players.some(p => deps.sameName(p.name, name));

// ---- presence

function pauseInfo(p) {
  if (!p.pauses.size) return null;
  return { seats: [...p.pauses.keys()].sort(), deadline: Math.min(...[...p.pauses.values()].map(x => x.deadline)) };
}

function syncPresence(room, p) {
  if (!p.state) return;
  for (const pl of room.players) {
    const sp = p.state.players[pl.seat - 1];
    if (sp) Object.assign(sp, { connected: pl.connected, bot: pl.bot });
  }
}

function anyHumanConnected(room) {
  return room.players.some(pl => pl.connected && !pl.bot);
}

function checkAbandoned(room) {
  const p = priv.get(room);
  clearTimeout(p.abandonTimer);
  p.abandonTimer = null;
  if (!p.state || anyHumanConnected(room)) return;
  p.abandonTimer = setTimeout(() => {
    if (rooms[room.roomId] !== room || anyHumanConnected(room)) return;
    clearTimers(p);
    delete rooms[room.roomId];
    console.log(`Team room ${room.roomId} deleted (abandoned)`);
  }, ABANDON_MS);
}

function clearTimers(p) {
  for (const x of p.pauses.values()) clearTimeout(x.timer);
  p.pauses.clear();
  clearTimeout(p.botTimer);
  clearTimeout(p.roundTimer);
  clearTimeout(p.abandonTimer);
  clearTimeout(p.holdTimer);
  p.botTimer = p.roundTimer = p.abandonTimer = p.holdTimer = null;
  p.nextRoundAt = p.trickHoldUntil = null;
}

function onDisconnect(socket, room) {
  const player = bySocket(room, socket);
  if (!player) return;
  const p = priv.get(room);
  player.id = null;
  player.connected = false;
  io.to(room.roomId).emit("systemMessage", `${player.name} has left the room`);

  if (!inMatch(room)) {
    deps.scheduleRemoval(room.roomId, player); // waiting / matchEnd: 15s seat grace
  } else if (!player.bot) {
    // RULES §15: pause, bot after the timeout
    const seat = player.seat;
    const timer = setTimeout(() => takeover(room, seat), DISCONNECT_MS);
    p.pauses.set(seat, { timer, deadline: Date.now() + DISCONNECT_MS });
  }
  io.to(room.roomId).emit("updatePlayers", room.players);
  checkAbandoned(room);
  afterChange(room);
}

function takeover(room, seat) {
  const p = priv.get(room);
  if (rooms[room.roomId] !== room) return;
  p.pauses.delete(seat);
  const player = bySeat(room, seat);
  if (!player || player.connected || !inMatch(room)) return afterChange(room);
  player.bot = true;
  io.to(room.roomId).emit("systemMessage", `${player.name} is now played by a bot`);
  io.to(room.roomId).emit("updatePlayers", room.players);
  afterChange(room);
}

function rejoin(socket, { roomId, token }) {
  const room = rooms[String(roomId || "").trim().toUpperCase()];
  const p = isTeam(room) && priv.get(room);
  const player = p && p.tokens.get(token);
  if (!player || !room.players.includes(player)) return socket.emit("errorMsg", "Seat not found");

  deps.cancelRemoval(player);
  const pause = p.pauses.get(player.seat);
  if (pause) clearTimeout(pause.timer);
  p.pauses.delete(player.seat);
  player.id = socket.id;
  player.connected = true;
  player.bot = false; // §15.4: control returns from the next decision
  socket.join(room.roomId);
  socket.emit("roomJoined", lobbyView(room));
  socket.emit("tcb:session", { roomId: room.roomId, seat: player.seat, token });
  io.to(room.roomId).emit("updatePlayers", room.players);
  io.to(room.roomId).emit("systemMessage", `${player.name} is back`);
  checkAbandoned(room);
  afterChange(room);
}

/** Waiting/matchEnd: seat freed now. Mid-match: same as a disconnect (pause, bot after the timeout; token still valid). */
function leave(socket, { roomId }) {
  const room = rooms[String(roomId || "").trim().toUpperCase()];
  if (!isTeam(room)) return;
  const player = bySocket(room, socket);
  if (!player) return;
  if (inMatch(room)) {
    onDisconnect(socket, room);
  } else {
    for (const [token, pl] of priv.get(room).tokens) if (pl === player) priv.get(room).tokens.delete(token);
    io.to(room.roomId).emit("systemMessage", `${player.name} has left the room`);
    deps.removePlayer(room.roomId, player);
  }
  socket.leave(room.roomId);
}

// ---- seats (waiting only)

function moveSeat(socket, { roomId, seat }) {
  const room = rooms[String(roomId || "").trim().toUpperCase()];
  if (!isTeam(room)) return socket.emit("errorMsg", "Room not found");
  const player = bySocket(room, socket);
  if (!player) return socket.emit("errorMsg", "You are not in this room");
  if (room.phase !== "waiting") return socket.emit("errorMsg", "Seats are locked once the game starts");
  if (!Number.isInteger(seat) || seat < 1 || seat > SEATS) return socket.emit("errorMsg", "Invalid seat");
  if (bySeat(room, seat)) return socket.emit("errorMsg", "That seat is taken");
  player.seat = seat;
  player.team = teamOf(seat);
  io.to(room.roomId).emit("updatePlayers", room.players);
}

function swapSeats(socket, { roomId, a, b }) {
  const room = rooms[String(roomId || "").trim().toUpperCase()];
  if (!isTeam(room)) return socket.emit("errorMsg", "Room not found");
  const me = bySocket(room, socket);
  if (!me || !me.isHost) return socket.emit("errorMsg", "Only the host can swap seats");
  if (room.phase !== "waiting") return socket.emit("errorMsg", "Seats are locked once the game starts");
  const ok = s => Number.isInteger(s) && s >= 1 && s <= SEATS;
  if (!ok(a) || !ok(b) || a === b) return socket.emit("errorMsg", "Invalid seats");
  const pa = bySeat(room, a);
  const pb = bySeat(room, b);
  if (pa) Object.assign(pa, { seat: b, team: teamOf(b) });
  if (pb) Object.assign(pb, { seat: a, team: teamOf(a) });
  io.to(room.roomId).emit("updatePlayers", room.players);
}

// ---- match

function start(socket, { roomId }) {
  const room = rooms[String(roomId || "").trim().toUpperCase()];
  if (!isTeam(room)) return socket.emit("errorMsg", "Room not found");
  const me = bySocket(room, socket);
  if (!me || !me.isHost) return socket.emit("errorMsg", "Only the host can start the game");
  if (room.phase !== "waiting") return socket.emit("errorMsg", "Game already started");
  const seated = [1, 2, 3, 4, 5, 6].map(s => bySeat(room, s));
  if (seated.some(pl => !pl || !pl.connected)) return socket.emit("errorMsg", "All 6 players must be present to start");

  const p = priv.get(room);
  clearTimers(p);
  p.state = E.newMatch(room.roomId, seated.map(pl => ({ name: pl.name, avatar: pl.avatar })), Math.random);
  seated.forEach(pl => (pl.bot = false));
  io.to(room.roomId).emit("systemMessage", "Game started");
  afterChange(room);
}

function act(socket, roomId, action) {
  const room = rooms[String(roomId || "").trim().toUpperCase()];
  if (!isTeam(room)) return socket.emit("errorMsg", "Room not found");
  const p = priv.get(room);
  const me = bySocket(room, socket);
  if (!me) return socket.emit("errorMsg", "You are not in this room");
  if (!p.state || !inMatch(room)) return socket.emit("errorMsg", "No game in progress");
  if (p.pauses.size) return socket.emit("errorMsg", "Game is paused while a player reconnects");
  const res = E.applyAction(p.state, me.seat, action);
  if (res.error) return socket.emit("errorMsg", res.error);
  p.state = res.state;
  afterChange(room);
}

function rematch(socket, { roomId }) {
  const room = rooms[String(roomId || "").trim().toUpperCase()];
  if (!isTeam(room)) return socket.emit("errorMsg", "Room not found");
  const me = bySocket(room, socket);
  if (!me || !me.isHost) return socket.emit("errorMsg", "Only the host can start a rematch");
  if (room.phase !== "matchEnd") return socket.emit("errorMsg", "The match is not over");
  const p = priv.get(room);
  clearTimers(p);
  p.state = null;
  room.phase = "waiting";
  for (const pl of room.players) {
    pl.bot = false;
    if (!pl.connected) deps.scheduleRemoval(room.roomId, pl);
  }
  io.to(room.roomId).emit("roomJoined", lobbyView(room)); // everyone back to the waiting room
  io.to(room.roomId).emit("updatePlayers", room.players);
}

/** After any state or presence change: sync, schedule timers, send every seat its own view. */
function afterChange(room) {
  const p = priv.get(room);
  if (!p.state || rooms[room.roomId] !== room) return;
  syncPresence(room, p);
  room.phase = p.state.phase;
  const paused = pauseInfo(p);

  // Completed trick: keep it on the table, then collect (next lead, or roundEnd after the 8th).
  // A pause during the hold blocks the collect; after resume the trick gets a full hold again.
  if (room.phase === "trickEnd" && !p.holdTimer && !paused) {
    p.trickHoldUntil = Date.now() + TRICK_PAUSE_MS;
    p.holdTimer = setTimeout(() => {
      p.holdTimer = null;
      p.trickHoldUntil = null;
      if (pauseInfo(p) || p.state.phase !== "trickEnd") return afterChange(room); // resumes later
      p.state = E.collectTrick(p.state).state;
      afterChange(room);
    }, TRICK_PAUSE_MS);
  }

  if (room.phase === "roundEnd" && !p.roundTimer && !paused) {
    p.nextRoundAt = Date.now() + ROUND_PAUSE_MS;
    p.roundTimer = setTimeout(() => {
      p.roundTimer = null;
      p.nextRoundAt = null;
      if (pauseInfo(p) || p.state.phase !== "roundEnd") return afterChange(room); // resumes later
      p.state = E.nextRound(p.state, Math.random).state;
      afterChange(room);
    }, ROUND_PAUSE_MS);
  }

  for (const pl of room.players) {
    if (pl.connected && pl.id) {
      io.to(pl.id).emit("tcb:state", E.viewFor(p.state, pl.seat, {
        paused, nextRoundAt: p.nextRoundAt ?? null, trickHoldUntil: p.trickHoldUntil ?? null,
      }));
    }
  }

  clearTimeout(p.botTimer);
  p.botTimer = null;
  if (paused || room.phase !== "choosingPath" && room.phase !== "choosingTrump" && room.phase !== "playing") return;
  const seat = E.activeSeat(p.state);
  const player = seat && bySeat(room, seat);
  if (!player || !player.bot) return;
  const before = p.state;
  p.botTimer = setTimeout(() => {
    p.botTimer = null;
    if (p.state !== before || pauseInfo(p) || !player.bot) return;
    const res = E.applyAction(p.state, seat, E.botAction(p.state, seat));
    if (res.error) return console.error(`Bot error in ${room.roomId} seat ${seat}:`, res.error);
    p.state = res.state;
    afterChange(room);
  }, BOT_DELAY_MS);
}

/** Chat is closed during trump selection (RULES §7.5). */
const chatBlocked = room => isTeam(room) && CHOOSING.includes(room.phase);

function register(socket) {
  socket.on("tcb:rejoin", payload => rejoin(socket, payload || {}));
  socket.on("tcb:leave", payload => leave(socket, payload || {}));
  socket.on("tcb:moveSeat", payload => moveSeat(socket, payload || {}));
  socket.on("tcb:swapSeats", payload => swapSeats(socket, payload || {}));
  socket.on("tcb:start", payload => start(socket, payload || {}));
  socket.on("tcb:choosePath", ({ roomId, path } = {}) => act(socket, roomId, { type: "path", path }));
  socket.on("tcb:chooseTrump", ({ roomId, suit } = {}) => act(socket, roomId, { type: "trump", suit }));
  socket.on("tcb:playCard", ({ roomId, card } = {}) => act(socket, roomId, { type: "play", card }));
  socket.on("tcb:rematch", payload => rematch(socket, payload || {}));
}

module.exports = { init, register, isTeam, inMatch, createRoom, joinRoom, canQuickJoin, onDisconnect, chatBlocked };
