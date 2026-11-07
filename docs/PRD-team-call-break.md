# PRD: Team Call Break (6 players, 3 vs 3) + Room Flow

Status: draft for user review · Owner: pf-orchestrator · Author: pf-coder2 · 2026-10-20
Rules source of truth: [RULES.md](RULES.md). This PRD never overrides it; where RULES is unclear, see §8 Open questions.

---

## 1. Goal and scope

**Goal:** add Team Call Break as a second game, playable by 6 people online, with every rule in RULES.md enforced by the server. Fix room creation so the host picks a game and a Public/Private room.

**In scope**
- Create Room modal: game picker + Public/Private toggle.
- Play Now matchmaking for public rooms (fixes the current `quickPlay` bug).
- Private rooms that can be joined by code only.
- Team Call Break: 6-seat waiting room with teams, trump selection (Path A/B), play, round result, match result, rematch.
- A server-authoritative rules engine with per-player views, plus disconnect pause and a bot (RULES §15).
- Unit tests for the engine and socket acceptance tests.

**Out of scope**
- Accounts and login.
- Persistence. Rooms live in memory, so a server restart loses games. RULES §15.5 covers disconnects, not restarts.
- A public room browser, spectators, rankings, and turn timers.
- Classic Poker, Blackjack, Rummy and Custom Game.
- Rewriting 4-player Call Break. Its client-side scoring and name-based rejoin stay as they are (tech debt, listed in §8).

**Phases**
| Phase | Delivers | Done when |
|---|---|---|
| 1 | Room flow: modal, Public/Private, Play Now fix. Applies to existing 4p Call Break too | 4p game creatable as public/private; Play Now never lands in private/started/other-game rooms |
| 2 | Team Call Break engine + server + UI, including pause/bot | All §6 acceptance criteria pass |
| 3 (later) | Optional chooser carry-over, bot difficulty, turn timer, room browser | Only if the user asks |

---

## 2. Room flow

### 2.1 Create Room modal
One modal with two required choices and a Continue button:
1. **Game** (radio cards):
   - **Team Call Break**: 6 players, 3 vs 3. This is the default.
   - **Call Break**: 4 players, the existing game.
2. **Room type** (segmented toggle):
   - **Public**: anyone can join via Play Now while the room is waiting and not full.
   - **Private**: join by room code only. This is the default.

The fake options (Classic Poker, Blackjack, Rummy, Custom Game) are **removed**. Every one of them currently starts a Call Break game, so they mislead players. The server rejects any `gameType` that is not `callbreak` or `teamcallbreak`.

### 2.2 Play Now (public matchmaking)
- The lobby card gets a game selector (same two games; remembers the last pick, default Team Call Break). Play Now sends `quickPlay { name, avatar, gameType }`.
- The server picks the **oldest** room where `type === 'public'`, `gameType` matches, `phase === 'waiting'` and there is a free seat. It joins the player there. If no such room exists, it creates a new public room with the player as host.
- Current `quickPlay` bugs this fixes:
  - It ignores the game type.
  - It can match rooms that are already playing.
  - It pushes players with no `isHost` and no `connected`, so a room it creates has no host and can never start.
  - It has no duplicate-name check.
  - Rooms it creates have no `gameType`.

### 2.3 Join by code
- Join Room accepts a code for **public or private** rooms.
- It is rejected with `errorMsg` when:
  - the room is not found
  - the room is full
  - the game has started (unless it is the player's own seat rejoining via token)
  - the name is already taken (case- and space-insensitive, as already implemented).

### 2.4 Visibility rules
| Room | Found by Play Now | Joinable by code | Listed anywhere |
|---|---|---|---|
| Public, waiting, free seat | yes | yes | no (no room browser) |
| Public, playing or full | no | rejoin only | no |
| Private, any phase | **never** | yes (rejoin only once playing) | no |

### 2.5 Seats and teams (6 players)
- There are 6 seats, P1 to P6, clockwise. Team A = P1/P3/P5 and Team B = P2/P4/P6 (RULES §4). The team always follows from the seat number and is never stored separately.
- The host creates the room and sits in P1. Each new joiner auto-fills the **lowest empty seat**, so teams alternate A, B, A, B as players arrive.
- While the room is waiting, any player may move themselves to an empty seat. That is how friends pick a team. The host may also **swap any two seated players**.
- Seat order fixes the chooser schedule: P1 chooses in round 1, P2 in round 2, and so on (RULES §5). The UI shows this before start.
- The 15s waiting-room grace (already built) applies. When a seat is removed, later players **do not shift**; the seat just becomes empty.

### 2.6 Start conditions
- Team Call Break needs **exactly 6** connected players in seats P1 to P6, and only the host can start. Otherwise the server sends `errorMsg`.
- 4p Call Break keeps its existing rule (exactly 4).
- Once started, the room leaves Play Now matching, and new joins are rejected.

---

## 3. Game flow screens

### 3.1 Waiting room (6 seats)
- An oval table with 6 seat slots in clockwise P1 to P6 order.
- Each seat shows a team colour **and** a text label "Team A" / "Team B", so the information never depends on colour alone.
- Each seat shows the name, avatar, HOST badge and an away (dimmed) state. An empty seat shows "Empty, tap to sit" when it is a legal move.
- Under the table: "Round 1 chooser: P1 (name)", then the room code with a copy button and the Public/Private badge.
- The host sees a Start button, enabled at 6/6, and can swap seats. Chat is available.

### 3.2 Trump selection, by role
The server sends each player only what that player may see (§4.2).

| Step | Chooser | Chooser's 2 teammates | 3 defenders | Everyone |
|---|---|---|---|---|
| Path choice | Own 5 cards face-up. Buttons: **Path A: pick from my hand** / **Path B: open my last 3**. Path B asks for confirmation ("final, cannot go back") | 5 cards face-down, label "Hidden until trump is chosen" | Own 5 cards face-up | Banner: "Round n: P1 (Team A) is choosing trump". Chat disabled |
| Path A: naming trump | 4 suit buttons. Only suits in the 5 cards are enabled (`trumpOptions`) | Same as above | Same as above | Banner shows "Path A" |
| Path B: naming trump | 5 own cards + the 3 opened cards highlighted in the centre. Suit buttons enabled only for the opened suits. If all 3 share a suit, trump is set automatically and a toast says so | First 5 face-up + 3 face-down (unseen) | All 8 face-up | Banner shows "Path B". **The 3 opened cards are shown face-up in the centre** |
| Trump announced | 8 cards | 8 cards | 8 cards | Trump badge set. Opened cards leave the centre (RULES §7.4.6) |

### 3.3 Play screen
- **Header:**
  - Round n/5
  - Match points A–B
  - Match tricks A–B
  - Trump badge
  - "Choosing: Team A (P1) · Defending: Team B"
  - Targets: "Team A: 6+ win, 5 draw · Team B: 4+ win, 3 draw"
- **Table:** 6 seats rotated so that "you" sit at the bottom. Each seat shows the name, team label, tricks won this round, card count, an active-player glow, and a BOT or AWAY badge.
- **Centre:** the current trick, each card placed toward the seat that played it, and a highlight on the trick winner when the trick resolves.
- **Your hand:**
  - Only `legalCards` are clickable; the rest are dimmed.
  - A tap plays the card. The server confirms it, so there is no optimistic removal.
- **Pause overlay:** "Waiting for <name> to reconnect: 0:47", then "<name> is now played by a bot".

### 3.4 Round result (overlay, server auto-advances after 8s)
- Team tricks A vs B, which team chose trump, the path and the trump suit.
- The result (choosing team wins / draw / defending team wins) and the points awarded.
- Tricks per player.
- Cumulative points and tricks.
- A countdown to the next round.

### 3.5 Match result
- The winner, or a draw.
- Final points, then total tricks. When points tie, show the tie-breaker line, for example "Tied 2–2 on points, Team A wins on tricks 22–18".
- A per-round table: round, choosing team, path, trump, tricks A–B, result.
- Buttons: **Rematch** (host only; returns everyone to the waiting room with the same seats) and **Home**.

### 3.6 RULES §16 to UI
| §16 requirement | UI element |
|---|---|
| Round number and match score | Header: "Round n/5" and "Points A x – y B" |
| Choosing team, chooser, defending team | Header line plus a chooser crown on the seat |
| Trick targets for both teams | Header targets line |
| Trump suit once announced | Header trump badge (large suit glyph + name) |
| 3 opened cards during Path B | Centre face-up row during Path B naming |
| Current trick and cards so far | Centre trick area |
| Active player | Seat glow plus "Your turn" on your hand |
| Tricks per player and per team (round) | Seat counters plus header team counters |
| Total tricks per team (match) | Header "Tricks A–B" |
| Round results and final result | Round overlay (§3.4) and match screen (§3.5) |

---

## 4. Architecture

### 4.1 Server is authoritative
- All dealing, visibility, validation (RULES §14 in full), trick resolution, scoring, round progression and bot moves happen on the server.
- The client only renders the view it receives and sends intents.
- Round progression runs on a server timer, so there is no host-only "next round" event. That removes the 4p ghost-host failure mode.

### 4.2 Per-player views: hidden cards are never sent
- The engine keeps the full state.
- The server emits `tcb:state` **per socket** and builds each payload with `viewFor(state, seat)`. The full state never goes over the wire.
- Each view carries `myHand` (cards this seat may see), `myHiddenCount` (cards held face-down) and, for every other seat, `cardCount` only.
- Rules:
  - **Chooser's teammates, before the path is chosen:** `myHand = []` and `myHiddenCount = 5`.
  - **Path B, after the reveal:** `myHand` holds the first 5 and `myHiddenCount = 3`. The 3 face-down cards are **not in the payload at all** until trump is announced (RULES §7.4.3, §13, §14).
  - **Path A:** every seat's last 3 cards are absent from every view until trump is announced.
  - **`openedCards`** is public only between the Path B reveal and the trump announcement, then removed (RULES §7.4.6).
- The engine deals all 8 cards per seat at round start (5 + reserve of 3). This is equivalent to RULES §6, because every assignment is equally likely. Visibility is decided purely by phase, which leaves one place where leaks can happen.
- The test suite asserts that no view ever contains a card the seat may not see (acceptance criterion V1).

### 4.3 Rules engine module (pure)
`backend/engine/teamCallBreak.ts` has no sockets, timers, IO or `Math.random` inside; the RNG is injected so tests are deterministic.

```
newMatch(seats[6], rng) -> State
choosePath(s, seat, 'A'|'B')      -> State | Err
chooseTrump(s, seat, suit)        -> State | Err
playCard(s, seat, card)           -> State | Err   // resolves trick / round / match when complete
legalCards(s, seat), trumpOptions(s, seat)
trickWinner(cards, leadSuit, trump), roundResult(choosingTricks), matchResult(rounds)
viewFor(s, seat) -> View
botAction(s, seat) -> Action   // always legal (RULES §15.3)
```
- Errors are returned as values carrying the RULES § number, for example `{ error: 'Must follow ♣ (§8.3)' }`. The server forwards them as `errorMsg`.
- Tests live in `backend/engine/teamCallBreak.test.ts` and run with `node --test`.

### 4.4 Where code lives, and TS vs JS
- `backend/engine/teamCallBreak.ts` holds the engine. `backend/teamRoom.js` holds the socket handlers for team rooms, registered from `server.js` (which gets only small routing edits).
- `shared/teamCallBreak.types.ts` holds the `View`, `Card` and event payload types. It contains **types only**. The frontend imports it with `import type`, so Vite erases the import and no runtime file is shared.
- The client needs no engine code, because legal cards and trump options arrive inside the view.
- **Use TypeScript with Node 26 type stripping** for the engine and shared types:
  - Erasable syntax only: no `enum` or `namespace`, `import type` for types, and `erasableSyntaxOnly` turned on in tsconfig.
  - `server.js` stays CommonJS JS (the earlier move-only rule) and loads the engine with `require('./engine/teamCallBreak.ts')`, which relies on require(esm).
  - Verified on Node 26.5: a CommonJS `.js` file can `require()` an ESM `.ts` file, with no flags and no warnings. Fallback if that ever breaks: rename to `.mts` and load it with `await import()` at startup.
  - The existing frontend `rules.ts` already runs this way (`npm run check`).

### 4.5 Room state machine
```
waiting --start(host, 6/6)--> choosingPath --A--> choosingTrump(A) --trump--> playing
                                  |                                            ^
                                  +--B--> choosingTrump(B) --trump/auto--------+
playing --6th card--> trickEnd --3s hold--> playing (trick winner leads)
trickEnd(8th trick) --3s hold--> roundEnd --8s, round<5--> choosingPath (next chooser)
roundEnd --round==5--> matchEnd --rematch(host)--> waiting (same seats)
```
- `trickEnd`: the completed trick stays in `trick.cards` (all 6 cards) and the winner is in `lastTrick`. `activeSeat` is null, and plays are rejected ("the last trick is still on the table"). After `TCB_TRICK_PAUSE_MS` (default 3000) the server calls `collectTrick`, which applies to humans and bots alike. If a pause starts during the hold, nothing is collected while paused, and the trick gets a full hold again after resume.
- `paused` is a flag on the room, not a phase. While it is set, every game action is rejected, and the phase stays where it was.
- 4p Call Break rooms keep their current implicit flow.

### 4.6 Disconnect, pause and bot (RULES §15), and how it fits the 15s grace
| Room phase | On disconnect |
|---|---|
| `waiting` / `matchEnd` | Existing rule: the seat is held for 15s, then removed. Host passes on, and an empty room is deleted |
| any in-match phase | Seat kept. Room `paused`. A 60s timer starts **per disconnected seat** |

- **Reconnect within 60s:** the timer is cancelled. When no disconnected seats remain, `paused` clears and play resumes from the exact same state.
- **After 60s:**
  - `seat.bot = true`.
  - The pause clears for that seat, and the game resumes once no other seat is still in its own countdown.
  - The bot acts when it is active: after an 800ms delay it calls `botAction`, which covers choosing a path, naming trump and playing cards.
  - Its tricks count for the team.
- **Reconnect after the bot took over:** the seat goes back to human control (`bot = false`). The player acts from their next decision, and moves already made stand (RULES §15.4).
- **Reconnect identity:** in team rooms a reconnect is matched by a random **seat token**, not by name. The server issues the token on join (`tcb:session`) and the client keeps it in `sessionStorage`. Typing someone's name can no longer take their seat (closes the known gap from the 4p fix).
- **Abandoned rooms:** if no human is connected for 5 minutes, the room is deleted. Otherwise bots would play to an empty room forever.
- **Bot strategy (default "basic"):**
  - Path A, naming the suit it holds most of; ties go to the higher total rank.
  - When following: if its team is already winning the trick, play the lowest legal card. Otherwise play the lowest legal card that wins, and if none wins, the lowest legal card.
  - When leading: play its highest non-trump card.

---

## 5. Socket event contract

Existing lobby events are reused with **additive** fields; existing field names are unchanged. All team-game events are new and prefixed `tcb:`.

### 5.1 Lobby (both games)
| Event | Dir | Payload | Notes |
|---|---|---|---|
| `createRoom` | C→S | `{ name, avatar, gameType: 'callbreak'\|'teamcallbreak', type: 'public'\|'private' }` | The `gameName`, `gameRules` and custom `maxPlayers` fields are dropped. maxPlayers is 4 or 6, derived from the game |
| `quickPlay` | C→S | `{ name, avatar, gameType }` | §2.2 |
| `joinRoom` | C→S | `{ roomId, name, avatar }` | §2.3 |
| `roomJoined` | S→C (joiner) | room: `{ roomId, gameType, type, maxPlayers, phase, players }` | Unchanged event. Adds `gameType`, `phase` |
| `updatePlayers` | S→room | `players: [{ id, name, avatar, isHost, connected, seat?, team?, bot? }]` | `seat` (1–6), `team` ('A'\|'B') and `bot` appear in team rooms only. The token is **never** included |
| `errorMsg`, `systemMessage`, `chatMessage` | as today | string / `{name,text}` | `chatMessage` is rejected during the team choosing phases (RULES §7.5) |

### 5.2 Team Call Break (new)
| Event | Dir | Payload |
|---|---|---|
| `tcb:session` | S→C (that socket only) | `{ roomId, seat, token }` |
| `tcb:rejoin` | C→S | `{ roomId, token }` → on success `roomJoined` + `tcb:session` + `tcb:state` |
| `tcb:leave` | C→S | `{ roomId }`. In waiting/matchEnd, frees the seat immediately (host passes to the next player who joined; an empty room is deleted) and sends `updatePlayers`. Mid-match it counts as a disconnect: the game pauses, a bot takes over after 60s, and the token stays valid |
| `tcb:moveSeat` | C→S | `{ roomId, seat }`. Waiting only, to an empty seat |
| `tcb:swapSeats` | C→S | `{ roomId, a, b }`. Host only, waiting only |
| `tcb:start` | C→S | `{ roomId }`. Host only, 6/6 |
| `tcb:choosePath` | C→S | `{ roomId, path: 'A'\|'B' }` |
| `tcb:chooseTrump` | C→S | `{ roomId, suit: '♠'\|'♥'\|'♦'\|'♣' }` |
| `tcb:playCard` | C→S | `{ roomId, card: { suit, rank } }` |
| `tcb:rematch` | C→S | `{ roomId }`. Host only, matchEnd only. The server then sends `roomJoined` (phase `waiting`) to the whole room as the signal to return to the waiting room |
| `tcb:state` | S→C (per socket) | `View` (below), sent after every change |

```ts
type View = {
  roomId: string; phase: 'choosingPath'|'choosingTrump'|'playing'|'trickEnd'|'roundEnd'|'matchEnd';
  round: number;                        // 1..5
  mySeat: number; myHand: Card[]; myHiddenCount: number;
  seats: { seat: number; team: 'A'|'B'; name: string; avatar: string;
           connected: boolean; bot: boolean; cardCount: number; tricks: number }[];
  chooser: number; choosingTeam: 'A'|'B'; path: 'A'|'B'|null;
  openedCards: Card[] | null; trump: Suit | null;
  targets: { choosing: { draw: 5, win: 6 }, defending: { draw: 3, win: 4 } };
  trick: { leader: number; cards: { seat: number; card: Card }[] };
  lastTrick: { winner: number; cards: { seat: number; card: Card }[] } | null;
  activeSeat: number | null; legalCards: Card[]; trumpOptions: Suit[];
  roundTricks: { A: number; B: number };
  match: { points: { A: number; B: number }; tricks: { A: number; B: number };
           rounds: { round: number; choosingTeam: 'A'|'B'; path: 'A'|'B'; trump: Suit;
                     tricks: { A: number; B: number }; result: 'A'|'B'|'draw' }[];
           winner: 'A'|'B'|'draw'|null; decidedBy: 'points'|'tricks'|'draw'|null };
  paused: { seats: number[]; deadline: number } | null;   // deadline = epoch ms
  nextRoundAt: number | null;                              // roundEnd countdown
  trickHoldUntil: number | null;                           // trickEnd: epoch ms when the trick is collected
};
```
**4p Call Break keeps all its old events unchanged:**
- `startGame`, `gameStarted`, `dealCards`, `cardsDealtToMe`, `dealingComplete`
- `submitBid`, `bidSubmittedUpdate`, `allBidsSubmitted`, `startPlayingPhase`
- `playCard`, `cardPlayed`, `nextPlayer`, `trickComplete`, `nextTrick`, `roundComplete`
- `startNewRound`, `gameEnded`, `replayGame`, `gameResetForReplay`
- `joinGameRoom`, `rejoinRoom`, `gameChat`/`receiveChatMessage`, `playerReaction`/`receiveReaction`

The unused `cardsDealt` listener can be deleted.

---

## 6. Acceptance criteria
- **Engine-level** criteria use a seeded RNG and are written as `node --test` tests.
- **Socket-level** criteria run against a throwaway server instance.

| # | Area | Criterion |
|---|---|---|
| D1 | Deck | Every round deck = 48 unique cards, no rank `2`, 12 per suit |
| D2 | Deal | After deal: every seat holds 8 (5 + 3 reserve), no card twice. Over 10k seeded deals, each card lands on each seat at a rate within ±2% of 1/6 |
| V1 | Visibility | For every phase and every seat, `viewFor` contains no card outside that seat's allowed set. Socket test: capture **every** `tcb:state` payload per socket for a full match and assert it |
| V2 | Visibility | During path choice: chooser's teammates `myHand=[]`, `myHiddenCount=5`; chooser and defenders see 5 |
| A1 | Path A | Trump not in the chooser's 5 → rejected (§14). Valid → trump public, all 8 visible to all, chooser `activeSeat` |
| A2 | Path A | `tcb:chooseTrump` from a non-chooser → rejected |
| B1 | Path B | After B: `openedCards` (3) in all 6 views; teammates see 5 and have 3 hidden; defenders see 8 |
| B2 | Path B | Suit not among opened → rejected, even if held in the first 5. `tcb:choosePath 'A'` after B → rejected |
| B3 | Path B | All 3 opened the same suit → trump set automatically, no chooseTrump needed |
| B4 | Path B | After trump: `openedCards=null`, chooser holds 8, teammates' `myHiddenCount=0` |
| F1 | Follow suit | Holding the led suit and playing another suit → rejected. Any card of the led suit accepted (no must-beat). Void → any card accepted |
| F2 | Turn | Play out of turn / card not held / card already played → rejected. The chooser leads trick 1; the trick winner leads the next |
| W1 | Trick winner | Trump ♥: led ♣ `♣9 ♣K ♦A ♣3 ♠A ♣10` → ♣K |
| W2 | Trick winner | led ♣ `♣9 ♣K ♥4 ♣3 ♥J ♣10` → ♥J |
| W3 | Trick winner | led ♥ `♥5 ♥Q ♠A ♥3 ♥K ♦A` → ♥K |
| R1 | Round result | Choosing tricks 8,7,6 → choosing wins (+1). 5 → draw (0/0). 4..0 → defending wins (+1). All 9 splits tested, and A+B = 8 always |
| R2 | Round | All 8 tricks are played even when the result is already decided. Every hand ends at 0 cards |
| R3 | Schedule | Rounds 1–5 choosers = P1, P2, P3, P4, P5. Choosing team A, B, A, B, A |
| M1 | Match | More points wins. If points tie → more total tricks wins (`decidedBy:'tricks'`). 20–20 → draw. All 5 rounds always played |
| X1 | Disconnect | Disconnect mid-round → `paused` set and actions rejected. Reconnect via token within 60s → resume with identical hands/trick/trump/scores |
| X2 | Bot | No reconnect in 60s → `bot:true`, and the bot completes the match with legal moves only (run 200 seeded all-bot matches, zero rejected actions), including as chooser. Its tricks count for the team |
| X3 | Bot | Player returns after the bot took over → control back from their next decision. Earlier bot moves stand |
| X4 | Identity | `tcb:rejoin` with a wrong token, or `joinRoom` with the seated player's name mid-match → rejected |
| J1 | Public | Play Now joins only rooms that are public + same gameType + waiting + not full. Otherwise it creates a public room with the player as host |
| J2 | Private | A private room is never returned by Play Now. Join by code works |
| J3 | Join | Joining a started room by code → rejected. A 7th player → "Room full" |
| J4 | Start | `tcb:start` with <6 players or from a non-host → rejected |

---

## 7. Build plan
Owners: **C2** = pf-coder2 (engine + server), **C1** = pf-coder1 (frontend), **T** = pf-tester, **S** = pf-service-runner. Order is top to bottom; `∥` marks tasks that can run at the same time.

| # | Owner | Task | Depends on | Parallel |
|---|---|---|---|---|
| B0 | C2 | `shared/teamCallBreak.types.ts` (View + payloads), (the `require` of .ts is already verified) | — | first, unblocks C1 |
| B1 | C2 | Engine + unit tests (D1–D2, V1–V2 engine part, A, B, F, W, R, M, bot legality) | B0 | ∥ F1–F3, T1 |
| B2 | C2 | Lobby: `gameType`/`type` validation, Play Now fix, private exclusion, phase gate on join, 6-seat assignment, `tcb:moveSeat`/`swapSeats`, seat token + `tcb:rejoin` | B0 | ∥ B1 |
| B3 | C2 | Team room handlers: start, choosePath, chooseTrump, playCard, per-socket `tcb:state`, round timer, rematch, pause/60s/bot, abandoned-room cleanup | B1, B2 | |
| F1 | C1 | Create modal (game + Public/Private), Play Now game selector, remove fake games | B0 | ∥ B1 |
| F2 | C1 | 6-seat waiting room with teams, move/swap, start | B0 | ∥ B1 |
| F3 | C1 | Team game screen, built against static `View` fixtures: trump UI per role, play, pause overlay, round + match overlays | B0 | ∥ B1 |
| T1 | T | Review B1 tests against RULES. Write the socket acceptance scripts (V1 leak capture, X, J) | B0 | ∥ B1–B3 |
| S1 | S | Restart backend after B2 and after B3. Keep frontend running | B2, B3 | |
| I1 | C1+C2 | Integrate F1–F3 with the live server | B3, F3, S1 | |
| T2 | T | Full acceptance run (§6) plus manual 6-tab play-through. Report failures to C1/C2 | I1 | |

Phase 1 (room flow) = B2's lobby part + F1. It can ship before the rest.

---

## 8. Open questions (recommended default in **bold**)

**Product decisions**
1. **How are teams formed?** **Seats auto-fill in join order; anyone may move to an empty seat; the host can swap.** Alternatives: random shuffle at start, or host-only assignment.
2. **What happens to the fake game types (Poker/Blackjack/Rummy/Custom)?** **Remove them.** None is implemented; all of them start Call Break.
3. **Does 4p Call Break stay?** **Yes, unchanged, as the second option.** Its scoring stays client-side and its rejoin stays name-based (tech debt). Moving it to the new engine is a later phase.
4. **Does 4p Call Break also get Public/Private?** **Yes.** The lobby code is shared, so it costs almost nothing.
5. **Optional chooser carry-over (RULES §17)?** **Off; build later only if wanted.** It is also underspecified, see A2 below.
6. **Bot difficulty?** **One "basic" bot (§4.6).** Selectable difficulty is Phase 3.
7. **Default room type in the modal?** **Private.** Avoids strangers joining by accident.
8. **Chat in team matches?** **Disabled during trump selection; enabled otherwise.** Hinting through chat is a rules violation (§13) that software can't detect. Alternative: emoji reactions only for the whole match.
9. **Turn timer for a player who stays connected but idle?** **None in Phase 2** (RULES defines none). The risk is a stalled match. Phase 3 could auto-play after 30s.
10. **Abandoned match (no human connected)?** **Delete the room after 5 minutes.**

**Ambiguities found in RULES.md (not edited)**
- **A1.** §5 says "see Section 16 for the optional carry-over setting", but the setting is in **§17**. → **Read it as §17.**
- **A2.** §17 carry-over says "Player 6 starts Team B's rotation in the next match", but doesn't say whether the next match still opens with Team A, or who Team A's first chooser is. → **Next match still opens with Team A; Team A rotation continues P1→P3→P5 cycle; Team B starts at P6.** Only matters if carry-over is built.
- **A3.** §13 lists "the 3 opened cards" as public information, but §7.4.6 says they are "no longer displayed" after trump. → **Hide them after trump is announced; don't show them in history.**
- **A4.** §15.1 "the game pauses": does that apply when the disconnected player is not the one to act, and what happens when several seats disconnect? → **Pause on any disconnect, with an independent 60s timer per seat; resume only when no seat is in countdown.**
- **A5.** §7.4.4 "if all 3 opened cards are the same suit, that suit becomes trump automatically": should the chooser still confirm? → **No confirmation; the server announces it immediately.**
- **A6.** §15 doesn't say whether a *different* person may take over a bot seat. → **No; only the original player (seat token).**
- **A7.** RULES defines no time limit for the path or trump decision. → **None (same as Q9).**
