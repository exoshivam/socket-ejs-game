import { useEffect, useState, type CSSProperties } from 'react';
import { socket } from '../socket';
import { session, type Player } from '../session';
import { navigate } from '../router';
import TopBar from '../components/TopBar';
import LoungeScene from '../components/LoungeScene';
import RoomChat from '../components/RoomChat';
import RoomCode from '../components/RoomCode';
import { Deck, FeltSuits, TableDeco } from '../components/TableBits';
import { CHARACTER_ICON, CHARACTER_LABEL, Crown, Gamepad, People, Silhouette, Spade } from '../components/icons';

/**
 * Seat positions around the oval as % of the table box. Seats are spread evenly,
 * starting at the top; fill order is top, then left/right pairs going down, then bottom.
 * For 4 seats that gives top, left, right, bottom.
 */
function seatPositions(count: number): { left: string; top: string }[] {
  const seats = Array.from({ length: count }, (_, k) => {
    const a = -Math.PI / 2 + (k * 2 * Math.PI) / count;
    return { cos: Math.cos(a), sin: Math.sin(a) };
  });
  seats.sort((p, q) => Math.round(p.sin * 100) - Math.round(q.sin * 100) || p.cos - q.cos);
  return seats.map(({ cos, sin }) => ({ left: `${50 + 39 * cos}%`, top: `${50 + 36 * sin}%` }));
}

export default function WaitingRoom({ replay }: { replay: boolean }) {
  const [roomData] = useState(session.roomData);
  const localPlayer = session.localPlayer() ?? roomData?.players?.[0] ?? null;
  const localName = localPlayer?.name ?? null;
  const maxPlayers = roomData?.maxPlayers || 4;

  const [players, setPlayers] = useState<Player[]>([]);

  // Server flag first, then the flags the room had when this player joined.
  const isHost =
    players.some(p => p.name === localName && p.isHost === true) ||
    !!roomData?.players?.some(p => p.name === localName && p.isHost === true);

  useEffect(() => {
    if (!roomData) {
      navigate('/', true);
      return;
    }
    const roomId = roomData.roomId;

    const onPlayers = (list: Player[]) => {
      setPlayers(list);
      // The game page reads players from here (the EJS page got them from the server).
      session.setRoomData({ ...(session.roomData() ?? roomData), players: list });
    };
    const onError = (msg: string) => alert(msg);
    const onStarted = () => {
      setTimeout(() => navigate(`/game-room?roomId=${roomId}&playerName=${encodeURIComponent(localName ?? '')}`), 500);
    };
    const onReset = () => history.replaceState(null, '', '/waiting-room');

    socket.on('updatePlayers', onPlayers);
    socket.on('errorMsg', onError);
    socket.on('gameStarted', onStarted);
    socket.on('gameResetForReplay', onReset);

    if (replay) socket.emit('replayGame', { roomId });
    if (localPlayer) socket.emit('rejoinRoom', { roomId, name: localPlayer.name, avatar: localPlayer.avatar });

    return () => {
      socket.off('updatePlayers', onPlayers);
      socket.off('errorMsg', onError);
      socket.off('gameStarted', onStarted);
      socket.off('gameResetForReplay', onReset);
    };
    // Mount only: the old page ran this once per page load.
  }, []);

  if (!roomData) return null;

  const full = players.length === maxPlayers;
  const ready = full && isHost;

  const startGame = () => {
    if (!isHost) return alert('Only the host can start the game!');
    if (players.length !== maxPlayers) return alert('All 4 players must be present to start the game!');
    socket.emit('startGame', { roomId: roomData.roomId, name: localName });
  };

  const leaveRoom = () => {
    if (confirm('Are you sure you want to leave the room?')) {
      session.setRoomData(null);
      navigate('/');
    }
  };

  // Host sits at the top; everyone else fills the remaining seats in join order.
  const host = players.find(p => p.isHost);
  const seated = host ? [host, ...players.filter(p => p !== host)] : players;
  const positions = seatPositions(maxPlayers);

  return (
    <div className="lobby wr">
      <LoungeScene photo="/waiting-bg.jpg" />
      <TopBar
        name={localName ?? ''}
        avatar={localPlayer?.avatar}
        showClass
        showWifi
        menu={[{ label: 'Leave room', onClick: leaveRoom }]}
        left={<RoomCode code={roomData.roomId} />}
      />

      <main className="wr-main">
        <section className="wr-table-area">
          <div className="wr-table">
            <TableDeco />
            <div className="wr-felt">
              <FeltSuits />

              <div className="wr-center">
                <Deck />
                <div className="wr-center-title">{full ? 'All players are here!' : 'Waiting for players...'}</div>
                <div className="wr-center-sub">
                  {full ? (isHost ? 'Start the game when ready' : 'Waiting for host to start') : `Need ${maxPlayers} players to start`}
                </div>
              </div>
            </div>

            {positions.map((pos, i) => (
              <Seat key={i} player={seated[i]} style={pos} />
            ))}
          </div>
        </section>

        <RoomChat roomId={roomData.roomId} localName={localName} />

        <div className="wr-bottom">
          <div className="wr-count">
            <People />
            <span>
              Players <b>({players.length}/{maxPlayers})</b>
            </span>
          </div>
          <div className="wr-start-wrap">
            <button type="button" className={`wr-start ${ready ? 'is-ready' : ''}`} disabled={!ready} onClick={startGame}>
              <Gamepad />
              {!isHost ? 'WAITING FOR HOST TO START' : ready ? 'START GAME' : `START GAME (${players.length}/${maxPlayers})`}
            </button>
            {!full && <div className="wr-start-note">Waiting for more players to join...</div>}
          </div>
        </div>
      </main>
    </div>
  );
}

function Seat({ player, style }: { player?: Player; style: CSSProperties }) {
  if (!player) {
    return (
      <div className="wr-seat" style={style}>
        <div className="wr-avatar is-empty">
          <Silhouette />
        </div>
        <div className="wr-plate">
          <div className="wr-plate-name">Waiting...</div>
          <div className="wr-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
        </div>
      </div>
    );
  }
  const avatar = player.avatar || '';
  const Icon = CHARACTER_ICON[avatar];
  return (
    <div className={`wr-seat ${player.connected === false ? 'is-away' : ''}`} style={style}>
      {player.isHost && (
        <span className="wr-crown">
          <Crown />
        </span>
      )}
      <div className="wr-avatar">
        {Icon ? <Icon size={64} /> : <Spade size={40} />}
        {player.isHost && <span className="wr-host">HOST</span>}
      </div>
      <div className="wr-plate">
        <div className="wr-plate-name">{player.name}</div>
        <div className="wr-plate-class">{CHARACTER_LABEL[avatar] ?? avatar}</div>
      </div>
    </div>
  );
}

