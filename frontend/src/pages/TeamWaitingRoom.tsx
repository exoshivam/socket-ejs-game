import { useEffect, useState } from 'react';
import { socket } from '../socket';
import { session, type Player } from '../session';
import { navigate } from '../router';
import TopBar from '../components/TopBar';
import LoungeScene from '../components/LoungeScene';
import RoomChat from '../components/RoomChat';
import RoomCode from '../components/RoomCode';
import { Deck, FeltSuits, TableDeco } from '../components/TableBits';
import { CHARACTER_ICON, Crown, Gamepad, People, Silhouette, Spade } from '../components/icons';
import { leaveTeamRoom, rejoinTeamRoom, teamOfSeat, useTcbView } from '../team/store';
import { FIXTURE_LOBBY } from '../team/fixtures';

const SEATS = [1, 2, 3, 4, 5, 6];

/** P1..P6 clockwise from the top. */
const seatPos = (seat: number) => {
  const a = -Math.PI / 2 + ((seat - 1) * Math.PI) / 3;
  return { left: `${50 + 40 * Math.cos(a)}%`, top: `${50 + 37 * Math.sin(a)}%` };
};

/**
 * 6-seat waiting room for Team Call Break. Teams follow seat parity
 * (Team A = P1/P3/P5). Players move to empty seats; the host can swap two players.
 * `fixture` renders static data with no socket (dev screenshots).
 */
export default function TeamWaitingRoom({ fixture = false }: { fixture?: boolean }) {
  const [roomData] = useState(() => (fixture ? FIXTURE_LOBBY.room : session.roomData()));
  const localPlayer = fixture ? FIXTURE_LOBBY.me : session.localPlayer();
  const localName = localPlayer?.name ?? null;
  const [players, setPlayers] = useState<Player[]>(() => (roomData?.players as Player[]) ?? []);
  const [swapFrom, setSwapFrom] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const view = useTcbView();
  const roomId = roomData?.roomId ?? '';

  useEffect(() => {
    if (fixture) return;
    if (!roomData) {
      navigate('/', true);
      return;
    }
    const onPlayers = (list: Player[]) => {
      setPlayers(list);
      session.setRoomData({ ...(session.roomData() ?? roomData), players: list });
    };
    const onRoom = (room: { roomId: string; players: Player[] }) => {
      if (room.roomId === roomId) onPlayers(room.players);
    };
    const onError = (msg: string) => setToast(msg);
    socket.on('updatePlayers', onPlayers);
    socket.on('roomJoined', onRoom);
    socket.on('errorMsg', onError);
    const offRejoin = rejoinTeamRoom(roomId);
    return () => {
      socket.off('updatePlayers', onPlayers);
      socket.off('roomJoined', onRoom);
      socket.off('errorMsg', onError);
      offRejoin();
    };
  }, []);

  // The match has started once the server sends a View for this room.
  useEffect(() => {
    if (!fixture && view?.roomId === roomId) navigate(`/team-game?roomId=${roomId}`);
  }, [view, roomId, fixture]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  if (!roomData) return null;

  // Seat from tcb:session is stable across reconnects; socket id and name are fallbacks.
  const mySeat = session.tcbSession()?.roomId === roomId ? session.tcbSession()!.seat : undefined;
  const me =
    (fixture ? players.find(p => p.name === localName) : undefined) ??
    players.find(p => p.id === socket.id) ??
    players.find(p => mySeat !== undefined && p.seat === mySeat) ??
    players.find(p => p.name === localName);
  const isHost = !!me?.isHost;
  const bySeat = new Map(players.filter(p => p.seat).map(p => [p.seat!, p]));
  const seatedCount = bySeat.size;
  const ready = seatedCount === 6 && [...bySeat.values()].every(p => p.connected !== false);
  const chooser = bySeat.get(1);

  const emit = (event: string, payload: object) => {
    if (fixture) setToast(`(fixture) ${event} ${JSON.stringify(payload)}`);
    else socket.emit(event, { roomId, ...payload });
  };

  const clickSeat = (seat: number) => {
    const p = bySeat.get(seat);
    if (!p) {
      if (me?.seat && me.seat !== seat) emit('tcb:moveSeat', { seat });
      setSwapFrom(null);
      return;
    }
    if (!isHost) return;
    if (swapFrom === null) setSwapFrom(seat);
    else if (swapFrom === seat) setSwapFrom(null);
    else {
      emit('tcb:swapSeats', { a: swapFrom, b: seat });
      setSwapFrom(null);
    }
  };

  const leaveRoom = () => {
    if (confirm('Are you sure you want to leave the room?')) leaveTeamRoom(roomId);
  };

  const hint = swapFrom
    ? `Swapping P${swapFrom}: pick another player, or tap again to cancel`
    : isHost
      ? 'Tap an empty seat to move, or tap two players to swap them'
      : 'Tap an empty seat to switch seats (and team)';

  return (
    <div className="lobby wr tw">
      <LoungeScene photo="/waiting-bg.jpg" />
      <TopBar
        name={localName ?? ''}
        avatar={localPlayer?.avatar}
        showClass
        showWifi
        menu={[{ label: 'Leave room', onClick: leaveRoom }]}
        left={<RoomCode code={roomId} badge={roomData.type === 'public' ? 'Public' : 'Private'} />}
      />

      <main className="wr-main">
        <section className="wr-table-area">
          <div className="wr-table">
            <TableDeco />
            <div className="wr-felt">
              <FeltSuits />
              <div className="wr-center">
                <Deck />
                <div className="wr-center-title">{ready ? 'All 6 players are here!' : 'Waiting for players...'}</div>
                <div className="wr-center-sub">
                  {ready ? (isHost ? 'Start the match when ready' : 'Waiting for host to start') : 'Need 6 players to start · 3 vs 3'}
                </div>
                <div className="tw-legend">
                  <span className="team-chip team-a">Team A · P1 P3 P5</span>
                  <span className="team-chip team-b">Team B · P2 P4 P6</span>
                </div>
              </div>
            </div>

            {SEATS.map(seat => {
              const p = bySeat.get(seat);
              const team = teamOfSeat(seat);
              const mine = !!p && p === me;
              const canSit = !p && !!me?.seat;
              const Icon = p?.avatar ? CHARACTER_ICON[p.avatar] : undefined;
              return (
                <button
                  key={seat}
                  type="button"
                  className={`wr-seat tw-seat team-${team.toLowerCase()} ${p ? '' : 'is-open'} ${p?.connected === false ? 'is-away' : ''} ${swapFrom === seat ? 'is-picked' : ''} ${mine ? 'is-me' : ''}`}
                  style={seatPos(seat)}
                  onClick={() => clickSeat(seat)}
                  disabled={!p && !canSit}
                  aria-label={p ? `P${seat} ${p.name}, Team ${team}` : `P${seat}, empty, Team ${team}${canSit ? ', tap to sit' : ''}`}
                >
                  {p?.isHost && (
                    <span className="wr-crown">
                      <Crown />
                    </span>
                  )}
                  <div className={`wr-avatar ${p ? '' : 'is-empty'}`}>
                    {p ? Icon ? <Icon size={64} /> : <Spade size={40} /> : <Silhouette />}
                    {p?.isHost && <span className="wr-host">HOST</span>}
                    <span className="tw-seatno">P{seat}</span>
                  </div>
                  <div className="wr-plate">
                    <div className="wr-plate-name">{p ? (mine ? `${p.name} (you)` : p.name) : canSit ? 'Empty' : 'Waiting...'}</div>
                    <div className="tw-team-label">Team {team}</div>
                    {!p && canSit && <div className="tw-sit">Tap to sit</div>}
                    {!p && !canSit && (
                      <div className="wr-dots" aria-hidden="true">
                        <i />
                        <i />
                        <i />
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <RoomChat roomId={roomId} localName={localName} />

        <div className="wr-bottom">
          <div className="wr-count">
            <People />
            <span>
              Players <b>({seatedCount}/6)</b>
            </span>
          </div>
          <div className="wr-start-wrap">
            <button
              type="button"
              className={`wr-start ${ready && isHost ? 'is-ready' : ''}`}
              disabled={!ready || !isHost}
              onClick={() => emit('tcb:start', {})}
            >
              <Gamepad />
              {!isHost ? 'WAITING FOR HOST TO START' : ready ? 'START MATCH' : `START MATCH (${seatedCount}/6)`}
            </button>
            <div className="wr-start-note">{ready ? hint : 'Waiting for more players to join...'}</div>
          </div>
          <div className="tw-schedule">
            <div className="tw-schedule-title">
              Round 1 chooser: <b>P1{chooser ? ` (${chooser.name})` : ''}</b>
            </div>
            <div className="tw-schedule-row">
              {[1, 2, 3, 4, 5].map(r => (
                <span key={r} className={`team-chip team-${teamOfSeat(r).toLowerCase()}`}>
                  R{r} P{r}
                </span>
              ))}
            </div>
            {!ready && <div className="tw-schedule-hint">{hint}</div>}
          </div>
        </div>
      </main>

      {toast && (
        <div className="tw-toast" role="alert">
          {toast}
        </div>
      )}
    </div>
  );
}
