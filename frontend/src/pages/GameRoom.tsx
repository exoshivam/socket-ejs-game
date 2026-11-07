import { useEffect, useReducer, useRef, useState, type CSSProperties } from 'react';
import { onConnected, socket } from '../socket';
import { session, type Player } from '../session';
import { navigate } from '../router';
import {
  CARDS_PER_PLAYER,
  NUM_PLAYERS,
  TOTAL_ROUNDS,
  getPlayableCards,
  isRed,
  rotate,
  roundScore,
  sameCard,
  sortHand,
  toClientIndex,
  type Card,
  type TrickCard,
} from '../game/rules';

type SeatPlayer = Required<Pick<Player, 'name' | 'avatar' | 'totalScore' | 'isHost'>> & { id?: string | null };
type Phase = 'setup' | 'bidding' | 'playing';
interface Status {
  text: string;
  color?: string;
}

const SEATS = ['you', 'left', 'top', 'right'] as const;
const REACTIONS: [string, string][] = [
  ['😊', 'Smile'],
  ['😂', 'Laugh'],
  ['😢', 'Cry'],
  ['😱', 'Shocked'],
  ['👍', 'Good'],
  ['🎉', 'Celebrate'],
];
const hiddenHand = () => new Array<Card | null>(CARDS_PER_PLAYER).fill(null);

/** Same as the EJS route: connected players in server order, padded to 4. */
function initialPlayers(roomId: string): SeatPlayer[] | null {
  const room = session.roomData();
  if (!room || room.roomId !== roomId.trim().toUpperCase() || !room.players?.length) return null;
  const players: SeatPlayer[] = room.players
    .filter(p => p.connected !== false)
    .map(p => ({ name: p.name, avatar: p.avatar || '👤', totalScore: p.totalScore || 0, isHost: p.isHost === true, id: p.id }));
  while (players.length < NUM_PLAYERS) players.push({ name: 'Waiting...', avatar: '⏳', totalScore: 0, isHost: false });
  return players;
}

export default function GameRoom({ roomId, playerName }: { roomId: string; playerName: string }) {
  const [, render] = useReducer((x: number) => x + 1, 0);
  const [bidInput, setBidInput] = useState('');
  const [chatInput, setChatInput] = useState('');
  const seatRefs = useRef<(HTMLDivElement | null)[]>([]);
  const chatWindowRef = useRef<HTMLDivElement>(null);
  const chatIconRef = useRef<HTMLButtonElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const chatListRef = useRef<HTMLDivElement>(null);
  const reactionRef = useRef<HTMLDivElement>(null);

  // Game state lives in one mutable object, like the old gameState, so socket
  // handlers registered once always see the latest values. render() repaints.
  const g = useRef<{
    players: SeatPlayer[];
    isHost: boolean;
    serverPlayerIndex?: number; // my seat in server order, set on first deal
    hands: (Card | null)[][]; // client order: 0 = me (real cards), others = card backs
    trick: TrickCard[]; // client player indices
    bids: (number | null)[]; // server order
    myBid: number | null;
    tricksWon: number[]; // server order
    serverCurrentPlayerIndex: number;
    currentPlayerName: string;
    phase: Phase;
    cardLocked: boolean;
    endRoundLock: boolean;
    round: number;
    setupOpen: boolean;
    setupStatus: string;
    dealing: boolean;
    readyOpen: boolean;
    bidEntryOpen: boolean;
    waitingForBids: boolean;
    turnBanner: { mine: boolean; name: string } | null;
    status: Status;
    statusBold: boolean;
    chat: { name: string; text: string; own: boolean }[];
    chatOpen: boolean;
    chatBadge: boolean;
    reactionMenuOpen: boolean;
    floats: { id: number; emoji: string; x: number; y: number }[];
  } | null>(null);

  if (!g.current) {
    const players = initialPlayers(roomId);
    g.current = players && {
      players,
      isHost: players.some(p => p.name === playerName && p.isHost),
      hands: [[], [], [], []],
      trick: [],
      bids: [null, null, null, null],
      myBid: null,
      tricksWon: [0, 0, 0, 0],
      serverCurrentPlayerIndex: 0,
      currentPlayerName: '',
      phase: 'setup',
      cardLocked: false,
      endRoundLock: false,
      round: 1,
      setupOpen: true,
      setupStatus: 'Ready to deal cards?',
      dealing: false,
      readyOpen: false,
      bidEntryOpen: false,
      waitingForBids: false,
      turnBanner: null,
      status: { text: 'Awaiting Bid...' },
      statusBold: false,
      chat: [],
      chatOpen: false,
      chatBadge: false,
      reactionMenuOpen: false,
      floats: [],
    };
  }
  const s = g.current;

  const isMyTurn = () => !!s && s.serverCurrentPlayerIndex === (s.serverPlayerIndex ?? 0);

  const updatePlayingStatus = () => {
    if (!s) return;
    const mine = isMyTurn();
    s.turnBanner = { mine, name: s.currentPlayerName };
    s.status = mine
      ? { text: 'Select a card to play', color: '#10b981' }
      : { text: `Waiting for ${s.currentPlayerName}...`, color: '#fbbf24' };
  };

  const showFloatingReaction = (emoji: string, seat: number) => {
    const el = seatRefs.current[seat];
    if (!s || !el) return;
    const rect = el.getBoundingClientRect();
    const id = Math.random();
    s.floats.push({ id, emoji, x: Math.random() * (rect.width - 40) + rect.left, y: rect.top - 50 });
    render();
    setTimeout(() => {
      s.floats = s.floats.filter(f => f.id !== id);
      render();
    }, 2000);
  };

  useEffect(() => {
    if (!s) return;
    let alive = true;
    const later = (fn: () => void, ms: number) => setTimeout(() => alive && fn(), ms);

    const endGame = () => {
      const ranked = [...s.players].sort((a, b) => b.totalScore - a.totalScore);
      alert(`🏆 GAME OVER!\n\nFinal Scores:\n${ranked.map(p => `${p.name}: ${p.totalScore.toFixed(1)}`).join('\n')}`);
      const rankedPlayers = ranked.map(p => ({ name: p.name, totalScore: p.totalScore, avatar: p.avatar }));
      socket.emit('gameEnded', { roomId, players: rankedPlayers });
      session.setFinalResults({ roomId: roomId.trim().toUpperCase(), rankedPlayers });
      later(() => navigate(`/winner?roomId=${roomId}`), 3000);
    };

    const endRound = () => {
      if (s.endRoundLock) return;
      s.endRoundLock = true;
      const spi = s.serverPlayerIndex ?? 0;
      const roundScores = s.bids.map((bid, i) => roundScore(bid ?? 0, s.tricksWon[i]));
      roundScores.forEach((score, serverIndex) => {
        s.players[toClientIndex(serverIndex, spi)].totalScore += score;
      });
      render();
      alert(`Round ${s.round} Scores:\n\n${s.players.map((p, i) => `${p.name}: ${roundScores[(i + spi) % NUM_PLAYERS].toFixed(1)}`).join('\n')}`);

      if (s.round < TOTAL_ROUNDS) {
        s.round++;
        s.tricksWon = [0, 0, 0, 0];
        s.bids = [null, null, null, null];
        s.myBid = null;
        s.trick = [];
        s.hands = [[], [], [], []];
        if (s.isHost) socket.emit('startNewRound', { roomId, roundNumber: s.round });
        s.setupOpen = true;
        s.setupStatus = '🔀 Shuffling and dealing cards...';
        // endRoundLock stays set until dealingComplete
        render();
      } else {
        endGame();
        s.endRoundLock = false;
      }
    };

    const handlers: Record<string, (data: any) => void> = {
      cardsDealtToMe: ({ hand }: { hand: Card[] }) => {
        if (s.serverPlayerIndex === undefined) {
          // First deal: rotate seats so I am always index 0.
          const pos = Math.max(0, s.players.findIndex(p => p.name === playerName));
          s.serverPlayerIndex = pos;
          s.players = rotate(s.players, pos);
        }
        s.hands = [sortHand(hand), hiddenHand(), hiddenHand(), hiddenHand()];
        render();
      },
      dealingComplete: () => {
        s.endRoundLock = false;
        s.readyOpen = true;
        render();
      },
      receiveReaction: ({ playerName: from, emoji }: { playerName: string; emoji: string }) => {
        const seat = s.players.findIndex(p => p.name === from);
        if (seat > 0) showFloatingReaction(emoji, seat);
      },
      receiveChatMessage: ({ playerName: from, message }: { playerName: string; message: string }) => {
        s.chat.push({ name: from, text: message, own: false });
        if (!s.chatOpen) s.chatBadge = true;
        render();
      },
      bidSubmittedUpdate: (d: { bidsReceivedCount: number; totalPlayersNeeded: number }) => {
        if (s.phase !== 'bidding') return;
        s.status = { text: `⏳ Bids received: ${d.bidsReceivedCount}/${d.totalPlayersNeeded}`, color: '#f59e0b' };
        render();
      },
      allBidsSubmitted: ({ bidsArray }: { bidsArray: number[] }) => {
        // Bids lock now; play starts on the server's startPlayingPhase (2 s later).
        // The old page also started play here, using last round's turn index.
        s.bids = [...bidsArray];
        render();
      },
      startPlayingPhase: (d: { currentPlayerIndex: number; currentPlayerName: string }) => {
        s.serverCurrentPlayerIndex = d.currentPlayerIndex;
        s.currentPlayerName = d.currentPlayerName || s.players[0].name;
        s.phase = 'playing';
        s.trick = [];
        s.cardLocked = false;
        s.waitingForBids = false;
        updatePlayingStatus();
        render();
      },
      cardPlayed: (d: { playerIndex: number; playerName: string; card: Card }) => {
        const ci = toClientIndex(d.playerIndex, s.serverPlayerIndex ?? 0);
        if (!s.trick.some(t => t.playerIndex === ci && sameCard(t.card, d.card))) {
          s.trick.push({ playerIndex: ci, playerName: d.playerName, card: d.card });
        }
        // My own hand was already updated when I clicked.
        const hand = s.hands[ci];
        if (ci !== 0 && hand.length) {
          const idx = hand.findIndex(c => c && sameCard(c, d.card));
          if (idx !== -1) hand.splice(idx, 1);
          else hand.pop();
        }
        s.serverCurrentPlayerIndex = d.playerIndex;
        render();
      },
      nextPlayer: (d: { currentPlayerIndex: number; currentPlayerName: string }) => {
        s.serverCurrentPlayerIndex = d.currentPlayerIndex;
        s.currentPlayerName = d.currentPlayerName;
        updatePlayingStatus();
        render();
      },
      nextTrick: (d: { currentPlayerIndex: number; currentPlayerName: string; tricksWon: number[] }) => {
        s.cardLocked = false;
        s.serverCurrentPlayerIndex = d.currentPlayerIndex;
        s.currentPlayerName = d.currentPlayerName;
        s.trick = [];
        s.tricksWon = d.tricksWon;
        updatePlayingStatus();
        render();
      },
      trickComplete: (d: { winnerName: string }) => {
        s.status = { text: `✅ ${d.winnerName} won the trick!`, color: '#10b981' };
        render();
      },
      roundComplete: (d: { tricksWon: number[] }) => {
        s.status = { ...s.status, text: '🎉 Round Complete!' };
        s.tricksWon = d.tricksWon;
        render();
        later(endRound, 1000);
      },
    };

    for (const [event, fn] of Object.entries(handlers)) socket.on(event, fn);
    const offConnect = onConnected(() => socket.emit('joinGameRoom', { roomId, playerName }));
    return () => {
      alive = false;
      for (const [event, fn] of Object.entries(handlers)) socket.off(event, fn);
      offConnect();
    };
    // Registered once for this room; handlers read the mutable state.
  }, []);

  // Close chat / reaction menu on outside click.
  useEffect(() => {
    if (!s) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (s.chatOpen && !chatWindowRef.current?.contains(t) && !chatIconRef.current?.contains(t)) {
        s.chatOpen = false;
        render();
      }
      if (s.reactionMenuOpen && !reactionRef.current?.contains(t)) {
        s.reactionMenuOpen = false;
        render();
      }
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [s]);

  useEffect(() => {
    chatListRef.current?.scrollTo(0, chatListRef.current.scrollHeight);
  });

  if (!s) {
    return <div className="p-4">Room not found or empty</div>;
  }

  const spi = s.serverPlayerIndex ?? 0;
  const myTurn = isMyTurn();
  const myHand = s.hands[0] as Card[];
  const playable = getPlayableCards(myHand, s.trick);

  const setupGame = () => {
    s.dealing = true;
    s.setupStatus = '🔀 Shuffling and dealing cards...';
    if (s.isHost) socket.emit('dealCards', { roomId, playerName });
    render();
  };

  const confirmReady = () => {
    s.readyOpen = false;
    s.setupOpen = false;
    render();
    setTimeout(() => {
      s.phase = 'bidding';
      s.tricksWon = [0, 0, 0, 0];
      s.bids = [null, null, null, null];
      s.myBid = null;
      s.trick = [];
      s.turnBanner = null;
      s.status = { text: '📋 Enter your bid (1-13) to start the game', color: '#f59e0b' };
      s.statusBold = true;
      s.bidEntryOpen = true;
      setBidInput('');
      render();
    }, 100);
  };

  const submitBid = () => {
    const val = parseInt(bidInput, 10);
    if (!val || val < 1 || val > 13) {
      alert('Please enter a bid between 1 and 13');
      return;
    }
    s.myBid = val;
    s.bidEntryOpen = false;
    s.status = { ...s.status, text: '⏳ Waiting for other players to bid...' };
    s.waitingForBids = true;
    socket.emit('submitBid', { roomId, playerName, bidAmount: val });
    render();
  };

  const playCard = (card: Card) => {
    if (s.phase !== 'playing' || !isMyTurn() || s.cardLocked) return;
    s.cardLocked = true; // one card per trick; nextTrick unlocks
    socket.emit('playCard', { roomId, playerName, card });
    s.hands[0] = myHand.filter(c => !sameCard(c, card));
    render();
  };

  const sendReaction = (emoji: string) => {
    showFloatingReaction(emoji, 0);
    socket.emit('playerReaction', { roomId, playerName, emoji });
  };

  const toggleChat = () => {
    s.chatOpen = !s.chatOpen;
    if (s.chatOpen) {
      s.chatBadge = false;
      setTimeout(() => chatInputRef.current?.focus(), 100);
    }
    render();
  };

  const sendChat = () => {
    const text = chatInput.trim();
    if (!text) return;
    s.chat.push({ name: playerName, text, own: true });
    socket.emit('gameChat', { roomId, playerName, message: text });
    setChatInput('');
    render();
  };

  const seatInfo = (seat: number) => {
    const serverIndex = (seat + spi) % NUM_PLAYERS;
    const bid = s.bids[serverIndex] ?? (seat === 0 ? s.myBid : null);
    return {
      player: s.players[seat],
      bid: bid || '-',
      won: s.tricksWon[serverIndex],
      score: s.players[seat].totalScore.toFixed(1),
      cards: s.hands[seat].length,
    };
  };

  const cardStyle = (isPlayable: boolean): { style: CSSProperties; clickable: boolean } => {
    const playing = s.phase === 'playing';
    if (myTurn && playing && isPlayable && !s.cardLocked) {
      return { clickable: true, style: { cursor: 'pointer', boxShadow: '0 0 15px rgba(16, 185, 129, 0.6)', border: '3px solid #10b981' } };
    }
    if (myTurn && playing && !isPlayable) return { clickable: false, style: { cursor: 'not-allowed', pointerEvents: 'none', opacity: 0.5 } };
    if (s.cardLocked && myTurn && playing) return { clickable: false, style: { cursor: 'not-allowed', pointerEvents: 'none', opacity: 0.4 } };
    return { clickable: false, style: { cursor: 'default', pointerEvents: 'none' } };
  };

  const backs = (seat: number) => s.hands[seat].map((_, i) => <CardView key={i} card={null} />);

  const info = SEATS.map((_, i) => seatInfo(i));
  const seatStats = (i: number) => (
    <>
      <div className="text-xs font-semibold text-purple-600">
        Bid: <span>{info[i].bid}</span> | Won: <span>{info[i].won}</span>
      </div>
      <div className="text-xs font-semibold text-green-600">
        Score: <span>{info[i].score}</span>
      </div>
    </>
  );

  return (
    <div className="game">
      <div className="h-screen w-screen p-2 sm:p-4 flex items-center justify-center">
        <div className="game-table w-full h-full rounded-2xl relative">
          {/* Top player */}
          <div className="player-area top-10 left-1/2 transform -translate-x-1/2">
            <div ref={el => (seatRefs.current[2] = el)} style={{ display: 'flex', gap: 5, justifyContent: 'center', flexWrap: 'wrap', transform: 'rotate(180deg)' }}>
              {backs(2)}
            </div>
            <div className="player-info text-center mb-2" style={{ transform: 'translateY(190px)' }}>
              <div className="font-bold text-sm">{info[2].player.name}</div>
              <div className="text-xs text-gray-600">{info[2].cards} cards</div>
              {seatStats(2)}
            </div>
          </div>

          {/* Left player */}
          <div className="player-area left-2 top-1/2 transform -translate-y-1/2" style={{ flexDirection: 'column', gap: 10, alignItems: 'flex-end' }}>
            <div className="player-info mb-2" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', transform: 'translateX(-260px) translateY(40px)' }}>
              <div className="font-bold text-sm">{info[1].player.name}</div>
              <div className="text-xs text-gray-600">{info[1].cards} cards</div>
              {seatStats(1)}
            </div>
            <div ref={el => (seatRefs.current[1] = el)} style={{ display: 'flex', gap: 5, justifyContent: 'center', flexWrap: 'wrap', maxWidth: 600, transform: 'rotate(90deg) translateY(180px)' }}>
              {backs(1)}
            </div>
          </div>

          {/* Right player */}
          <div className="player-area right-2 top-1/2 transform -translate-y-1/2" style={{ flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
            <div className="player-info mb-2" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', transform: 'translateX(260px) translateY(40px)' }}>
              <div className="font-bold text-sm">{info[3].player.name}</div>
              <div className="text-xs text-gray-600">{info[3].cards} cards</div>
              {seatStats(3)}
            </div>
            <div ref={el => (seatRefs.current[3] = el)} style={{ display: 'flex', gap: 5, justifyContent: 'center', flexWrap: 'wrap', maxWidth: 600, transform: 'rotate(-90deg) translateY(180px)' }}>
              {backs(3)}
            </div>
          </div>

          {/* Trick */}
          <div className="center-pile">
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ display: 'flex', gap: 15, justifyContent: 'center' }}>
                {s.trick.map(({ playerIndex, card }) => (
                  <div key={card.rank + card.suit} style={{ textAlign: 'center' }}>
                    <CardView card={card} />
                    <div style={{ color: 'white', fontSize: 12, fontWeight: 600, marginTop: 5 }}>
                      {s.players[playerIndex].name.substring(0, 3)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {s.turnBanner && (
            <div className={`turn-status-display ${s.turnBanner.mine ? 'your-turn' : 'other-turn'}`}>
              {s.turnBanner.mine ? '🎴 Your Turn' : `⏳ ${s.turnBanner.name} Playing...`}
            </div>
          )}

          {s.waitingForBids && (
            <div className="turn-status-display" style={{ display: 'flex', background: 'linear-gradient(135deg, #b18fffad 0%, #6c28d9b9 100%)', color: 'white' }}>
              ⏳ Waiting for other players to submit their bids...
            </div>
          )}

          {/* You */}
          <div className="player-area bottom-10 left-1/2 transform -translate-x-1/2">
            {s.bidEntryOpen && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', background: 'white', padding: '8px 12px', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.2)', position: 'fixed', bottom: 200, left: 150, transform: 'translateX(-50%)' }}>
                <input
                  type="number"
                  min={1}
                  max={13}
                  autoFocus
                  placeholder="Bid 1-13"
                  value={bidInput}
                  onChange={e => setBidInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submitBid()}
                  style={{ width: 80, padding: 6, borderRadius: 6, border: '1px solid #ddd', fontSize: 13 }}
                />
                <button onClick={submitBid} style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', border: 'none', padding: '8px 10px', borderRadius: 8, color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>
                  Bid
                </button>
              </div>
            )}
            <div className="player-info mb-3 text-center" style={{ position: 'fixed', bottom: 175, left: 250, display: 'flex', flexDirection: 'column', alignItems: 'center', width: 250 }}>
              <div className="font-bold text-sm">{info[0].player.name}</div>
              <div className="text-xs text-gray-600" style={{ color: s.status.color, fontWeight: s.statusBold ? 'bold' : undefined }}>
                {s.status.text}
              </div>
              {seatStats(0)}
            </div>
            <div ref={el => (seatRefs.current[0] = el)} style={{ display: 'flex', gap: 5, justifyContent: 'center', flexWrap: 'wrap', width: 750 }}>
              {myHand.map(card => {
                const { style, clickable } = cardStyle(playable.some(c => sameCard(c, card)));
                return (
                  <CardView key={card.rank + card.suit} card={card} own style={style} onClick={clickable ? () => playCard(card) : undefined} />
                );
              })}
            </div>
          </div>

          {/* Round */}
          <div style={{ position: 'absolute', top: 20, right: 20, background: 'white', padding: 15, borderRadius: 10, boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)', textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: '#999', marginBottom: 5 }}>Round</div>
            <div style={{ fontSize: 24, fontWeight: 'bold', color: '#667eea' }}>{s.round}</div>
          </div>

          <button
            style={{ position: 'absolute', top: 20, left: 20, background: 'white', padding: 12, borderRadius: 10, boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)', border: 'none', cursor: 'pointer', fontSize: 18 }}
            onClick={() => alert('Menu - Coming soon!')}
          >
            ☰
          </button>

          <div className="reaction-container" ref={reactionRef}>
            <button className="reaction-icon-btn" title="Send Reaction" onClick={() => { s.reactionMenuOpen = !s.reactionMenuOpen; render(); }}>
              😊
            </button>
            {s.reactionMenuOpen && (
              <div className="reaction-menu">
                {REACTIONS.map(([emoji, title]) => (
                  <button key={emoji} className="reaction-btn" title={title} onClick={() => sendReaction(emoji)}>
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button className="chat-icon" ref={chatIconRef} onClick={toggleChat} title="Chat">
            💬
            {s.chatBadge && <div className="chat-badge" />}
          </button>

          {s.chatOpen && (
            <div className="chat-window" ref={chatWindowRef}>
              <div className="chat-header">
                <span>Game Chat</span>
                <button className="chat-close-btn" onClick={toggleChat}>✕</button>
              </div>
              <div className="chat-messages" ref={chatListRef}>
                {s.chat.map((m, i) => (
                  <div key={i} className={`chat-message ${m.own ? 'own' : 'other'}`}>
                    <div className="chat-message-player">{m.name}</div>
                    <div>{m.text}</div>
                  </div>
                ))}
              </div>
              <div className="chat-input-area">
                <input
                  ref={chatInputRef}
                  type="text"
                  className="chat-input"
                  placeholder="Type message..."
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendChat();
                    }
                  }}
                />
                <button className="chat-send-btn" onClick={sendChat}>📤</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {s.setupOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            {s.isHost ? (
              <>
                <h1 style={{ fontSize: 32, marginBottom: 10 }}>🎴 Lakadia Card Game</h1>
                <p style={{ fontSize: 16, color: '#666', margin: '10px 0' }}>Round {s.round} of {TOTAL_ROUNDS}</p>
                <p style={{ fontSize: 14, color: '#666', marginBottom: 30 }}>4 Players • 52 Cards • Trump: Spades ♠</p>
                <div className="status-text">{s.setupStatus}</div>
                <button
                  disabled={s.dealing}
                  onClick={setupGame}
                  style={{ background: 'linear-gradient(135deg, #a855f7 0%, #d946ef 100%)', border: 'none', padding: '15px 40px', borderRadius: 10, color: 'white', fontWeight: 'bold', fontSize: 16, cursor: 'pointer', transition: 'all 0.3s', opacity: s.dealing ? 0.5 : 1 }}
                >
                  🔀 Shuffle & Deal Cards
                </button>
              </>
            ) : (
              <>
                <h1 style={{ fontSize: 32, marginBottom: 10 }}>⏳ Waiting for Host</h1>
                <p style={{ fontSize: 16, color: '#666', margin: '10px 0' }}>Round {s.round} of {TOTAL_ROUNDS}</p>
                <p style={{ fontSize: 14, color: '#666', marginBottom: 30 }}>4 Players • 52 Cards • Trump: Spades ♠</p>
                <div className="status-text">Waiting for the host to shuffle and deal cards...</div>
                <div style={{ fontSize: 14, color: '#999', marginTop: 30 }}>📌 You'll be able to view and bid on your cards once they're dealt</div>
              </>
            )}
          </div>
        </div>
      )}

      {s.readyOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 500 }}>
            <h2 style={{ fontSize: 28, marginBottom: 30, color: '#1a472a' }}>🎯 Ready to Bid?</h2>
            <button onClick={confirmReady} style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', border: 'none', padding: '15px 40px', borderRadius: 10, color: 'white', fontWeight: 'bold', fontSize: 16, cursor: 'pointer', transition: 'all 0.3s' }}>
              ✓ Yes, Ready
            </button>
          </div>
        </div>
      )}

      {s.floats.map(f => (
        <div key={f.id} className="floating-reaction" style={{ left: f.x, top: f.y }}>
          {f.emoji}
        </div>
      ))}
    </div>
  );
}

function CardView({ card, own, style, onClick }: { card: Card | null; own?: boolean; style?: CSSProperties; onClick?: () => void }) {
  const face: CSSProperties = { width: '100%', height: '100%', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' };
  if (!card) {
    return (
      <div className="card">
        <div style={{ ...face, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', border: '2px solid #4a5568' }}>
          <div style={{ color: 'white', fontSize: 24, fontWeight: 'bold', opacity: 0.5 }}>L</div>
        </div>
      </div>
    );
  }
  const color = isRed(card) ? '#dc2626' : '#1f2937';
  const suitColor = isRed(card) ? '#dc2626' : '#000';
  const corner = (
    <>
      <div style={{ color, fontWeight: 'bold', fontSize: 12 }}>{card.rank}</div>
      <div style={{ color: suitColor, fontSize: 14 }}>{card.suit}</div>
    </>
  );
  return (
    <div className={own ? 'card playable-card' : 'card'} style={style} onClick={onClick}>
      <div style={{ ...face, background: 'white', border: '2px solid #333', padding: '3px 2px', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 2, left: 2, textAlign: 'center', lineHeight: 1.2 }}>{corner}</div>
        <div style={{ fontSize: 28, color: suitColor }}>{card.suit}</div>
        <div style={{ position: 'absolute', bottom: 2, right: 2, textAlign: 'center', lineHeight: 1.2, transform: 'rotate(180deg)' }}>{corner}</div>
      </div>
    </div>
  );
}
