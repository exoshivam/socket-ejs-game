import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Card, Suit, View } from '../../../shared/teamCallBreak.types.ts';
import { socket } from '../socket';
import { session } from '../session';
import { navigate } from '../router';
import TopBar from '../components/TopBar';
import LoungeScene from '../components/LoungeScene';
import RoomChat from '../components/RoomChat';
import RoomCode from '../components/RoomCode';
import { TableDeco } from '../components/TableBits';
import { CHARACTER_ICON, Crown, Spade } from '../components/icons';
import { leaveTeamRoom, rejoinTeamRoom, setView, SUIT_NAME, useTcbView } from '../team/store';
import { FIXTURE_VIEWS } from '../team/fixtures';
import { MatchResult, PauseOverlay, RoundResult } from './TeamOverlays';

const SUITS: Suit[] = ['♠', '♥', '♣', '♦'];
const RANKS = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3'];
const red = (s: Suit) => s === '♥' || s === '♦';
const same = (a: Card, b: Card) => a.suit === b.suit && a.rank === b.rank;
const key = (c: Card) => c.rank + c.suit;

/** Display order only: trump first, then alternating colours, high to low. */
function sortHand(hand: Card[], trump: Suit | null): Card[] {
  const order = trump ? [trump, ...SUITS.filter(s => s !== trump)] : SUITS;
  return [...hand].sort((a, b) => order.indexOf(a.suit) - order.indexOf(b.suit) || RANKS.indexOf(a.rank) - RANKS.indexOf(b.rank));
}

/** Seats rotated so I sit at the bottom; clockwise continues to my left. */
function seatAngle(seat: number, mySeat: number) {
  const r = (seat - mySeat + 6) % 6;
  return ((90 + r * 60) * Math.PI) / 180;
}
const seatPos = (seat: number, mySeat: number): CSSProperties => {
  const a = seatAngle(seat, mySeat);
  return { left: `${50 + 44 * Math.cos(a)}%`, top: `${50 + 41 * Math.sin(a)}%` };
};
const trickPos = (seat: number, mySeat: number): CSSProperties => {
  const a = seatAngle(seat, mySeat);
  return { left: `${50 + 21 * Math.cos(a)}%`, top: `${48 + 27 * Math.sin(a)}%` };
};

/** Where collected cards fly: past the trick ring toward the winner's seat. */
const collectPos = (seat: number, mySeat: number): CSSProperties => {
  const a = seatAngle(seat, mySeat);
  return { left: `${50 + 38 * Math.cos(a)}%`, top: `${50 + 36 * Math.sin(a)}%` };
};

/** Shrinking bar for the trick hold; duration fixed when the hold starts. */
function HoldBar({ until }: { until: number }) {
  const [ms] = useState(() => Math.max(0, until - Date.now()));
  return (
    <span className="tg-hold-bar" aria-hidden="true">
      <i style={{ animationDuration: `${ms}ms` }} />
    </span>
  );
}

export function CardFace({ card, size = 'md', className = '', style, onClick, label }: {
  card: Card | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
  label?: string;
}) {
  const cls = `tc-card tc-${size} ${card ? (red(card.suit) ? 'is-red' : 'is-black') : 'is-back'} ${className}`;
  const body = card ? (
    <>
      <span className="tc-corner">
        {card.rank}
        <br />
        {card.suit}
      </span>
      <span className="tc-pip">{card.suit}</span>
      <span className="tc-corner tc-corner-br">
        {card.rank}
        <br />
        {card.suit}
      </span>
    </>
  ) : (
    <span className="tc-back-mark">
      <Spade size={18} />
    </span>
  );
  return onClick ? (
    <button type="button" className={cls} style={style} onClick={onClick} aria-label={label ?? (card ? `${card.rank}${card.suit}` : 'Face-down card')}>
      {body}
    </button>
  ) : (
    <span className={cls} style={style} role="img" aria-label={label ?? (card ? `${card.rank}${card.suit}` : 'Face-down card')}>
      {body}
    </span>
  );
}

export default function TeamGame({ roomId, fixture }: { roomId: string; fixture?: string | null }) {
  const live = useTcbView();
  const [confirmB, setConfirmB] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // Cards of a just-collected trick, sliding to the winner (stage 1) after the hold ends.
  const [collect, setCollect] = useState<{ cards: View['trick']['cards']; winner: number; stage: 0 | 1 } | null>(null);
  const prev = useRef<View | null>(null);

  // Dev: static View fixtures, switchable from the corner menu.
  useEffect(() => {
    if (!fixture) return;
    const make = FIXTURE_VIEWS[fixture];
    setView(make ? make() : null, true);
    return () => setView(null);
  }, [fixture]);

  useEffect(() => {
    if (fixture) return;
    const onError = (msg: string) => setToast(msg);
    const onRoom = (room: { roomId: string; phase?: string }) => {
      // Rematch: the server puts the room back to waiting.
      if (room.roomId === roomId && room.phase === 'waiting') {
        session.setRoomData({ ...(session.roomData() ?? {}), ...room });
        setView(null);
        navigate('/waiting-room');
      }
    };
    socket.on('errorMsg', onError);
    socket.on('roomJoined', onRoom);
    const offRejoin = rejoinTeamRoom(roomId);
    return () => {
      socket.off('errorMsg', onError);
      socket.off('roomJoined', onRoom);
      offRejoin();
    };
  }, [roomId, fixture]);

  const view = live && (fixture || live.roomId === roomId) ? live : null;

  // Announcements derived from consecutive Views.
  useEffect(() => {
    const p = prev.current;
    prev.current = view;
    // Hold over: animate the 6 cards toward the winner before the next lead.
    if (view && p?.phase === 'trickEnd' && view.phase !== 'trickEnd' && p.lastTrick && p.trick.cards.length) {
      setCollect({ cards: p.trick.cards, winner: p.lastTrick.winner, stage: 0 });
      requestAnimationFrame(() => requestAnimationFrame(() => setCollect(c => c && { ...c, stage: 1 })));
      setTimeout(() => setCollect(null), 520);
    }
    if (!view || !p || p.round !== view.round) return;
    if (!p.trump && view.trump) {
      const opened = p.openedCards;
      const auto = view.path === 'B' && opened?.length === 3 && opened.every(c => c.suit === opened[0].suit);
      setToast(
        auto
          ? `All 3 opened cards are ${view.trump}: ${SUIT_NAME[view.trump]} is trump automatically`
          : `Trump is ${view.trump} ${SUIT_NAME[view.trump]} (Path ${view.path})`,
      );
    }
    const botNow = view.seats.find(s => s.bot && !p.seats.find(q => q.seat === s.seat)?.bot);
    if (botNow) setToast(`${botNow.name} is now played by a bot`);
  }, [view]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!view) {
    return (
      <div className="lobby tg">
        <LoungeScene />
        <div className="tg-loading">{fixture ? `Unknown fixture "${fixture}"` : 'Connecting to the table…'}</div>
        {fixture && <FixturePicker current={fixture} />}
      </div>
    );
  }

  const me = view.seats[view.mySeat - 1];
  const chooser = view.seats[view.chooser - 1];
  const defending = view.choosingTeam === 'A' ? 'B' : 'A';
  const choosing = view.phase === 'choosingPath' || view.phase === 'choosingTrump';
  // trickEnd: the finished trick stays on the felt until trickHoldUntil; no input (server rejects plays).
  const held = view.phase === 'trickEnd';
  const tablePhase = view.phase === 'playing' || held;
  const winner = held && view.lastTrick ? view.seats[view.lastTrick.winner - 1] : null;
  const myTurn = view.phase === 'playing' && view.activeSeat === view.mySeat && !view.paused;
  // The server gates every action on activeSeat (path, trump and card play alike).
  const iChoose = view.chooser === view.mySeat && view.activeSeat === view.mySeat && !view.paused;
  const active = view.activeSeat ? view.seats[view.activeSeat - 1] : null;
  const hand = sortHand(view.myHand, view.trump);
  const isHost = !!session.roomData()?.players?.find(p => p.isHost && (p.seat === view.mySeat || p.name === me.name));
  const teamTarget = (t: 'A' | 'B') => (t === view.choosingTeam ? view.targets.choosing : view.targets.defending);

  const emit = (event: string, payload: object = {}) => {
    if (fixture) setToast(`(fixture) ${event} ${JSON.stringify(payload)}`);
    else socket.emit(event, { roomId: view.roomId, ...payload });
  };

  const leave = () => {
    if (confirm('Leave the match? A bot takes your seat after 60 seconds; you can come back with this browser tab until then.')) leaveTeamRoom(view.roomId);
  };

  // What the action strip above my hand says / offers.
  let prompt: ReactNode = null;
  if (view.paused) prompt = <span>Game paused</span>;
  else if (view.phase === 'choosingPath') {
    prompt = iChoose ? (
      <div className="tg-actions">
        <span className="tg-prompt-text">You choose trump this round. How?</span>
        <button type="button" className="tg-btn" onClick={() => emit('tcb:choosePath', { path: 'A' })}>
          Path A: pick from my hand
        </button>
        <button type="button" className="tg-btn tg-btn-outline" onClick={() => setConfirmB(true)}>
          Path B: open my last 3
        </button>
      </div>
    ) : (
      <span>
        {chooser.team === me.team ? 'Your teammate' : 'The other team'}: P{chooser.seat} {chooser.name} is choosing trump
      </span>
    );
  } else if (view.phase === 'choosingTrump') {
    prompt =
      iChoose && view.trumpOptions.length ? (
        <div className="tg-actions">
          <span className="tg-prompt-text">{view.path === 'A' ? 'Name trump: a suit in your 5 cards' : 'Name trump: a suit shown on the opened cards'}</span>
          {SUITS.map(s => {
            const ok = view.trumpOptions.includes(s);
            return (
              <button
                key={s}
                type="button"
                className={`tg-suit ${red(s) ? 'is-red' : ''}`}
                disabled={!ok}
                title={ok ? SUIT_NAME[s] : `${SUIT_NAME[s]}: not allowed`}
                onClick={() => emit('tcb:chooseTrump', { suit: s })}
              >
                <span>{s}</span>
                {SUIT_NAME[s]}
              </button>
            );
          })}
        </div>
      ) : (
        <span>
          P{chooser.seat} {chooser.name} chose Path {view.path} and is naming trump…
        </span>
      );
  } else if (held) {
    prompt = winner ? (
      <span>
        <b className="tg-won">
          P{winner.seat} {winner.name}
        </b>{' '}
        won the trick for Team {winner.team}
      </span>
    ) : null;
  } else if (view.phase === 'playing') {
    prompt = myTurn ? (
      <span className="tg-yourturn">Your turn: play a highlighted card</span>
    ) : (
      <span>{active ? `Waiting for P${active.seat} ${active.name}…` : ''}</span>
    );
  }


  return (
    <div className="lobby tg">
      <LoungeScene photo="/waiting-bg.jpg" />
      <TopBar
        name={me.name}
        avatar={me.avatar}
        showClass
        showWifi
        menu={[{ label: 'Leave match', onClick: leave }]}
        left={<RoomCode code={view.roomId} />}
      />

      {/* RULES §16 header */}
      <header className="tg-hud" aria-label="Match status">
        <div className="tg-hud-item">
          <small>Round</small>
          <b>{view.round}/5</b>
        </div>
        <div className="tg-hud-item">
          <small>Points</small>
          <b>
            <span className="t-a">A {view.match.points.A}</span> – <span className="t-b">{view.match.points.B} B</span>
          </b>
        </div>
        <div className="tg-hud-item">
          <small>Match tricks</small>
          <b>
            <span className="t-a">A {view.match.tricks.A}</span> – <span className="t-b">{view.match.tricks.B} B</span>
          </b>
        </div>
        <div className="tg-hud-item">
          <small>This round</small>
          <b>
            <span className="t-a">A {view.roundTricks.A}</span> – <span className="t-b">{view.roundTricks.B} B</span>
          </b>
        </div>
        <div className={`tg-trump ${view.trump && red(view.trump) ? 'is-red' : ''}`} aria-label={view.trump ? `Trump ${SUIT_NAME[view.trump]}` : 'Trump not chosen yet'}>
          <span className="tg-trump-glyph">{view.trump ?? '?'}</span>
          <span>
            <small>Trump</small>
            <b>{view.trump ? SUIT_NAME[view.trump] : 'Choosing…'}</b>
          </span>
        </div>
        <div className="tg-hud-roles">
          <div>
            Choosing: <span className={`team-chip team-${view.choosingTeam.toLowerCase()}`}>Team {view.choosingTeam}</span> (P{chooser.seat} {chooser.name}
            {view.path ? ` · Path ${view.path}` : ''}) · Defending: <span className={`team-chip team-${defending.toLowerCase()}`}>Team {defending}</span>
          </div>
          <div className="tg-targets">
            {(['A', 'B'] as const).map(t => (
              <span key={t}>
                Team {t}: {teamTarget(t).win}+ win, {teamTarget(t).draw} draw
              </span>
            ))}
          </div>
        </div>
      </header>

      <main className="tg-main">
        <section className="tg-table-area">
          <div className="wr-table tg-table">
            <TableDeco />
            <div className="wr-felt">
              {/* Path B: the 3 opened cards are public until trump is announced. */}
              {view.openedCards && (
                <div className="tg-opened">
                  <div className="tg-opened-label">P{chooser.seat}'s opened cards (Path B)</div>
                  <div className="tg-opened-row">
                    {view.openedCards.map(c => (
                      <CardFace key={key(c)} card={c} size="md" className="is-opened" />
                    ))}
                  </div>
                </div>
              )}

              {choosing && !view.openedCards && (
                <div className="tg-banner">
                  <Crown />
                  <div>
                    Round {view.round}: P{chooser.seat} {chooser.name} (Team {view.choosingTeam}) is choosing trump
                    <small>{view.path ? `Path ${view.path}` : 'Path A or Path B'} · no chat until trump is announced</small>
                  </div>
                </div>
              )}

              {tablePhase &&
                view.trick.cards.map(({ seat, card }) => (
                  <CardFace
                    key={key(card)}
                    card={card}
                    size="md"
                    className={`tg-trick-card ${winner ? (winner.seat === seat ? 'is-winner' : 'is-beaten') : ''}`}
                    style={trickPos(seat, view.mySeat)}
                    label={`P${seat} played ${card.rank}${card.suit}${winner?.seat === seat ? ', winning card' : ''}`}
                  />
                ))}
              {collect?.cards.map(({ seat, card }) => (
                <CardFace
                  key={`c${key(card)}`}
                  card={card}
                  size="md"
                  className={`tg-trick-card is-collecting ${collect.stage ? 'is-gone' : ''}`}
                  style={collect.stage ? collectPos(collect.winner, view.mySeat) : trickPos(seat, view.mySeat)}
                />
              ))}
              {winner && (
                <div className="tg-trick-note" role="status">
                  P{winner.seat} {winner.name} won the trick
                  {view.trickHoldUntil && !view.paused && <HoldBar key={view.trickHoldUntil} until={view.trickHoldUntil} />}
                </div>
              )}
            </div>

            {view.seats.map(s => {
              const Icon = CHARACTER_ICON[s.avatar];
              const isActive = view.activeSeat === s.seat && (view.phase === 'playing' || choosing);
              const won = winner?.seat === s.seat;
              return (
                <div
                  key={s.seat}
                  className={`wr-seat tg-seat team-${s.team.toLowerCase()} ${isActive ? 'is-active' : ''} ${won ? 'is-won' : ''} ${!s.connected ? 'is-away' : ''} ${s.seat === view.mySeat ? 'is-me' : ''}`}
                  style={seatPos(s.seat, view.mySeat)}
                >
                  {s.seat === view.chooser && (
                    <span className="wr-crown" title="Chooser this round">
                      <Crown />
                    </span>
                  )}
                  <div className="wr-avatar">
                    {Icon ? <Icon size={56} /> : <Spade size={34} />}
                    <span className="tw-seatno">P{s.seat}</span>
                    {s.bot && <span className="tg-badge">BOT</span>}
                    {!s.connected && !s.bot && <span className="tg-badge is-away">AWAY</span>}
                  </div>
                  <div className="wr-plate">
                    <div className="wr-plate-name">{s.seat === view.mySeat ? `${s.name} (you)` : s.name}</div>
                    <div className="tg-seat-stats">
                      <span className="tw-team-label">Team {s.team}</span>
                      <span title="Tricks this round">🏆 {s.tricks}</span>
                      <span title="Cards in hand">🂠 {s.cardCount}</span>
                    </div>
                  </div>
                </div>
              );
            })}
            {view.paused && <PauseOverlay view={view} />}
          </div>

          <div className="tg-hand-area">
            <div className="tg-prompt" aria-live="polite">
              {prompt}
            </div>
            <div className="tg-hand">
              {hand.map(c => {
                const legal = view.legalCards.some(l => same(l, c));
                return (
                  <CardFace
                    key={key(c)}
                    card={c}
                    size="lg"
                    className={myTurn ? (legal ? 'is-legal' : 'is-dim') : ''}
                    onClick={myTurn && legal ? () => emit('tcb:playCard', { card: c }) : undefined}
                    label={`${c.rank}${c.suit}${myTurn ? (legal ? ', playable' : ', not playable') : ''}`}
                  />
                );
              })}
              {Array.from({ length: view.myHiddenCount }, (_, i) => (
                <CardFace key={`h${i}`} card={null} size="lg" className="is-hidden" label="Hidden card" />
              ))}
            </div>
            {view.myHiddenCount > 0 && <div className="tg-hidden-note">🔒 {view.myHiddenCount} card{view.myHiddenCount > 1 ? 's' : ''} hidden until trump is chosen</div>}
          </div>
        </section>

        <RoomChat
          roomId={view.roomId}
          localName={me.name}
          className="tg-chat"
          disabledReason={choosing ? 'Chat is off while trump is chosen' : undefined}
        />
      </main>

      {view.phase === 'roundEnd' && <RoundResult view={view} />}
      {view.phase === 'matchEnd' && (
        <MatchResult
          view={view}
          isHost={isHost || !!fixture}
          onRematch={() => emit('tcb:rematch')}
          onHome={() => leaveTeamRoom(view.roomId)}
        />
      )}

      {confirmB && (
        <div className="tg-modal" role="dialog" aria-modal="true" aria-labelledby="pathb-title">
          <div className="tg-modal-card">
            <h2 id="pathb-title">Open your last 3 cards?</h2>
            <p>Everyone will see them, and you must name trump from their suits. This is final: you can't go back to Path A.</p>
            <div className="tg-modal-buttons">
              <button type="button" className="tg-btn tg-btn-outline" onClick={() => setConfirmB(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="tg-btn"
                onClick={() => {
                  setConfirmB(false);
                  emit('tcb:choosePath', { path: 'B' });
                }}
              >
                Open 3 cards
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="tw-toast" role="status">
          {toast}
        </div>
      )}
      {fixture && <FixturePicker current={fixture} />}
    </div>
  );
}

function FixturePicker({ current }: { current: string }) {
  return (
    <select className="tg-fixtures" value={current} onChange={e => navigate(`/team-game?fixture=${e.target.value}`)} aria-label="Fixture">
      {Object.keys(FIXTURE_VIEWS).map(k => (
        <option key={k}>{k}</option>
      ))}
    </select>
  );
}
