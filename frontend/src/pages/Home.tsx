import { useEffect, useRef, useState, type ReactNode } from 'react';
import { socket } from '../socket';
import TopBar from '../components/TopBar';
import LoungeScene from '../components/LoungeScene';
import { Dagger, Door, Flourish, Orb, Plus, Swords } from '../components/icons';
import { session, type RoomData } from '../session';
import { navigate } from '../router';

const CHARACTERS: { id: string; label: string; icon: ReactNode }[] = [
  { id: 'warrior', label: 'Warrior', icon: <Swords /> },
  { id: 'mage', label: 'Mage', icon: <Orb /> },
  { id: 'rogue', label: 'Rogue', icon: <Dagger /> },
];

type GameType = 'callbreak' | 'teamcallbreak';
const GAMES: { value: GameType; name: string; short: string; desc: string }[] = [
  { value: 'teamcallbreak', name: 'Team Call Break', short: 'Team · 6P', desc: '6 players, 3 vs 3. Choose trump, win tricks as a team' },
  { value: 'callbreak', name: 'Call Break', short: 'Classic · 4P', desc: '4 players, every player for themselves. Bid and make your tricks' },
];
const QUICK_GAME_KEY = 'lakadia.quickGame';
const readQuickGame = (): GameType => {
  try {
    return localStorage.getItem(QUICK_GAME_KEY) === 'callbreak' ? 'callbreak' : 'teamcallbreak';
  } catch {
    return 'teamcallbreak';
  }
};

export default function Home() {
  const [name, setName] = useState('');
  const [character, setCharacter] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [gameType, setGameType] = useState<GameType>('teamcallbreak');
  const [roomType, setRoomType] = useState<'public' | 'private'>('private');
  const [quickGame, setQuickGame] = useState<GameType>(readQuickGame);
  // Only a room this player created shows the "Room Created" alert.
  const creating = useRef(false);

  useEffect(() => {
    const onRoomJoined = (room: RoomData) => {
      if (creating.current) {
        alert(`Room Created Successfully!\nRoom Code: ${room.roomId}\n\nShare this code with other players to join!`);
      }
      creating.current = false;
      session.setRoomData(room);
      navigate('/waiting-room');
    };
    const onError = (msg: string) => {
      creating.current = false;
      alert(msg);
    };
    socket.on('roomJoined', onRoomJoined);
    socket.on('errorMsg', onError);
    return () => {
      socket.off('roomJoined', onRoomJoined);
      socket.off('errorMsg', onError);
    };
  }, []);

  const player = () => {
    const playerName = name.trim();
    if (!playerName || !character) {
      alert('Enter name and select character');
      return null;
    }
    session.setLocalPlayer({ name: playerName, avatar: character });
    return { name: playerName, avatar: character };
  };

  const pickQuickGame = (g: GameType) => {
    setQuickGame(g);
    try {
      localStorage.setItem(QUICK_GAME_KEY, g);
    } catch {
      /* remembered for this visit only */
    }
  };

  const playGame = () => {
    const p = player();
    if (p) socket.emit('quickPlay', { ...p, gameType: quickGame });
  };

  const joinRoom = () => {
    const p = player();
    if (!p) return;
    const roomCode = prompt('Enter Room Code');
    if (!roomCode) return;
    socket.emit('joinRoom', { roomId: roomCode.trim().toUpperCase(), ...p });
  };

  const openGameTypeModal = () => {
    if (!name.trim()) {
      alert('Please enter your name first!');
      return;
    }
    setGameType('teamcallbreak');
    setRoomType('private');
    setModalOpen(true);
  };

  const confirmGameType = () => {
    const p = player();
    if (!p) return;
    creating.current = true;
    socket.emit('createRoom', { ...p, gameType, type: roomType });
    setModalOpen(false);
  };

  return (
    <div className="home lobby">
      {/* Shows public/lobby-bg.jpg when present, else the SVG lounge. */}
      <LoungeScene photo="/lobby-bg.jpg" table />
      <TopBar name={name.trim()} avatar={character} />

      <main className="lobby-main">
        <section className="lobby-card">
          <span className="lobby-crest" aria-hidden="true" />
          <Flourish style={{ top: 6, left: 6 }} />
          <Flourish style={{ top: 6, right: 6, transform: 'scaleX(-1)' }} />
          <Flourish style={{ bottom: 6, left: 6, transform: 'scaleY(-1)' }} />
          <Flourish style={{ bottom: 6, right: 6, transform: 'scale(-1)' }} />

          <div className="lobby-ornament" aria-hidden="true">
            <span />
            <i />
            <span />
          </div>
          <h1 className="lobby-title">LAKADIA</h1>
          <p className="lobby-tagline">CARDS • STRATEGY • FRIENDS</p>

          <label className="lobby-label" htmlFor="player-name">Enter Your Name</label>
          <input
            id="player-name"
            type="text"
            className="lobby-input"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Enter your name"
            autoComplete="nickname"
          />

          <div className="lobby-label">Choose Your Character</div>
          <div className="lobby-characters">
            {CHARACTERS.map(c => (
              <button
                key={c.id}
                type="button"
                aria-pressed={character === c.id}
                className={`lobby-character ${character === c.id ? 'selected' : ''}`}
                onClick={() => setCharacter(c.id)}
              >
                {c.icon}
                <span>{c.label}</span>
              </button>
            ))}
          </div>

          <div className="lobby-label">Quick Play</div>
          <div className="lobby-segment" role="radiogroup" aria-label="Game for Play Now">
            {GAMES.map(g => (
              <button
                key={g.value}
                type="button"
                role="radio"
                aria-checked={quickGame === g.value}
                className={quickGame === g.value ? 'active' : ''}
                onClick={() => pickQuickGame(g.value)}
              >
                {g.short}
              </button>
            ))}
          </div>
          <button type="button" className="lobby-play" onClick={playGame}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M6 3.5v17l14-8.5z" />
            </svg>
            PLAY NOW
          </button>

          <div className="lobby-actions">
            <button type="button" className="lobby-outline" onClick={joinRoom}>
              <Door /> Join Room
            </button>
            <button type="button" className="lobby-outline" onClick={openGameTypeModal}>
              <Plus /> Create Room
            </button>
          </div>
        </section>
      </main>

      {modalOpen && (
        <div className="modal" onClick={e => e.target === e.currentTarget && setModalOpen(false)}>
          <div className="modal-content" role="dialog" aria-modal="true" aria-labelledby="create-title">
            <div className="modal-header" id="create-title">Create Room</div>

            <div className="lobby-label">Game</div>
            <div className="create-games" role="radiogroup" aria-label="Game">
              {GAMES.map(g => (
                <label key={g.value} className={`game-option ${gameType === g.value ? 'selected' : ''}`}>
                  <input type="radio" name="gameType" value={g.value} checked={gameType === g.value} onChange={() => setGameType(g.value)} />
                  <span className="game-option-icon" aria-hidden="true">
                    {g.value === 'teamcallbreak' ? <TeamIcon /> : <FourIcon />}
                  </span>
                  <span className="flex-1">
                    <span className="game-name">
                      {g.name}
                      <span className="game-badge">{g.value === 'teamcallbreak' ? '6 players' : '4 players'}</span>
                    </span>
                    <span className="game-desc">{g.desc}</span>
                  </span>
                </label>
              ))}
            </div>

            <div className="lobby-label">Room Type</div>
            <div className="lobby-segment" role="radiogroup" aria-label="Room type">
              {(['private', 'public'] as const).map(t => (
                <button key={t} type="button" role="radio" aria-checked={roomType === t} className={roomType === t ? 'active' : ''} onClick={() => setRoomType(t)}>
                  {t === 'private' ? '🔒 Private' : '🌐 Public'}
                </button>
              ))}
            </div>
            <p className="create-hint">
              {roomType === 'private' ? 'Only players with the room code can join.' : 'Anyone using Play Now can join while the room is waiting.'}
            </p>

            <div className="modal-buttons">
              <button className="modal-button secondary" onClick={() => setModalOpen(false)}>Cancel</button>
              <button className="modal-button" onClick={confirmGameType}>Create Room</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const TeamIcon = () => (
  <svg width="40" height="32" viewBox="0 0 40 32" aria-hidden="true">
    {[6, 20, 34].map((x, i) => (
      <circle key={x} cx={x} cy={i === 1 ? 9 : 13} r="4.5" fill={i === 1 ? '#f6dc95' : '#d9b56a'} />
    ))}
    {[6, 20, 34].map((x, i) => (
      <path key={x} d={`M${x - 7} ${i === 1 ? 27 : 30}c0-5 3-8 7-8s7 3 7 8z`} fill={i === 1 ? '#f6dc95' : '#d9b56a'} />
    ))}
  </svg>
);

const FourIcon = () => (
  <svg width="40" height="32" viewBox="0 0 40 32" aria-hidden="true">
    {[[10, 6], [30, 6], [10, 20], [30, 20]].map(([x, y]) => (
      <rect key={`${x}${y}`} x={x - 7} y={y - 4} width="14" height="10" rx="2" fill="#15130f" stroke="#d9b56a" strokeWidth="1.5" />
    ))}
  </svg>
);
