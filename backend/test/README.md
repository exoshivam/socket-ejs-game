Socket acceptance scripts (throwaway server on :3999, never :3000). Client path = frontend's socket.io-client.

```sh
C="$PWD/../frontend/node_modules/socket.io-client"
PORT=3999 node server.js &                                   # lobby.socket.js, seat4p.socket.js (seat4p takes ~35s)
TCB_DISCONNECT_MS=1000 TCB_ROUND_PAUSE_MS=150 TCB_BOT_DELAY_MS=20 TCB_TRICK_PAUSE_MS=400 PORT=3999 node server.js &   # match.socket.js
TCB_TRICK_PAUSE_MS=1500 TCB_DISCONNECT_MS=5000 TCB_BOT_DELAY_MS=20 PORT=3999 node server.js &   # holdpause.socket.js
TCB_ABANDON_MS=300 TCB_DISCONNECT_MS=5000 PORT=3999 node server.js &                           # abandon.socket.js
node test/lobby.socket.js "$C"
```
Engine unit tests: `node --test engine/teamCallBreak.test.ts`
