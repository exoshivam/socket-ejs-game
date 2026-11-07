import { useEffect, useState } from 'react';
import type { View } from '../../../shared/teamCallBreak.types.ts';
import { SUIT_NAME } from '../team/store';

/** Seconds left until an epoch-ms deadline, ticking. */
function useCountdown(deadline: number | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!deadline) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [deadline]);
  return deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : 0;
}
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const Team = ({ t }: { t: 'A' | 'B' }) => <span className={`team-chip team-${t.toLowerCase()}`}>Team {t}</span>;

/** RULES §15: the game pauses while a player is disconnected; a bot takes over after the timeout. */
export function PauseOverlay({ view }: { view: View }) {
  const left = useCountdown(view.paused?.deadline ?? null);
  const names = view.paused!.seats.map(n => `P${n} ${view.seats[n - 1].name}`).join(', ');
  return (
    <div className="tg-pause" role="alert">
      <div className="tg-pause-card">
        <div className="tg-pause-title">Game paused</div>
        <div>
          Waiting for <b>{names}</b> to reconnect
        </div>
        <div className="tg-pause-time">{mmss(left)}</div>
        <small>{left > 0 ? 'Then a bot plays their seat. Their tricks still count for the team.' : 'A bot is taking over…'}</small>
      </div>
    </div>
  );
}

const resultLine = (result: 'A' | 'B' | 'draw', choosing: 'A' | 'B') =>
  result === 'draw'
    ? 'Draw: no points'
    : `Team ${result} (${result === choosing ? 'choosing' : 'defending'} team) wins the round · +1 point`;

/** RULES §10–§12: round result, auto-advances on the server timer. */
export function RoundResult({ view }: { view: View }) {
  const left = useCountdown(view.nextRoundAt);
  const r = view.match.rounds[view.match.rounds.length - 1];
  if (!r) return null;
  const chooser = view.seats[r.chooser - 1];
  return (
    <div className="tg-overlay" role="dialog" aria-modal="true" aria-labelledby="round-title">
      <div className="tg-result">
        <h2 id="round-title">Round {r.round} result</h2>
        <div className="tg-result-meta">
          <Team t={r.choosingTeam} /> chose trump (P{chooser.seat} {chooser.name}) · Path {r.path} · Trump <span className={r.trump === '♥' || r.trump === '♦' ? 'is-red' : ''}>{r.trump}</span> {SUIT_NAME[r.trump]}
        </div>
        <div className="tg-score-row">
          <div className="t-a">
            <small>Team A</small>
            <b>{r.tricks.A}</b>
          </div>
          <span>tricks</span>
          <div className="t-b">
            <small>Team B</small>
            <b>{r.tricks.B}</b>
          </div>
        </div>
        <div className={`tg-result-line ${r.result === 'draw' ? '' : `win-${r.result.toLowerCase()}`}`}>{resultLine(r.result, r.choosingTeam)}</div>
        <div className="tg-player-tricks">
          {view.seats.map(s => (
            <span key={s.seat} className={`t-${s.team.toLowerCase()}`}>
              P{s.seat} {s.name}: <b>{s.tricks}</b>
            </span>
          ))}
        </div>
        <div className="tg-totals">
          Match points <b className="t-a">A {view.match.points.A}</b> – <b className="t-b">{view.match.points.B} B</b> · Total tricks{' '}
          <b className="t-a">A {view.match.tricks.A}</b> – <b className="t-b">{view.match.tricks.B} B</b>
        </div>
        {view.nextRoundAt && <div className="tg-next">{r.round < 5 ? `Round ${r.round + 1} starts in ${left}s` : `Final result in ${left}s`}</div>}
      </div>
    </div>
  );
}

/** RULES §11: points, then total tricks, then draw. */
export function MatchResult({ view, isHost, onRematch, onHome }: { view: View; isHost: boolean; onRematch: () => void; onHome: () => void }) {
  const { points, tricks, rounds, winner, decidedBy } = view.match;
  const headline = winner === 'draw' || !winner ? 'Match drawn' : `Team ${winner} wins the match!`;
  const why =
    decidedBy === 'tricks'
      ? `Tied ${points.A}–${points.B} on points, Team ${winner} wins on tricks ${winner === 'A' ? `${tricks.A}–${tricks.B}` : `${tricks.B}–${tricks.A}`}`
      : decidedBy === 'draw'
        ? `Tied ${points.A}–${points.B} on points and ${tricks.A}–${tricks.B} on tricks`
        : `${points[winner as 'A' | 'B'] ?? 0}–${points[winner === 'A' ? 'B' : 'A']} on points`;
  const myTeam = view.seats[view.mySeat - 1].team;
  return (
    <div className="tg-overlay" role="dialog" aria-modal="true" aria-labelledby="match-title">
      <div className="tg-result tg-match">
        <div className="tg-trophy" aria-hidden="true">
          {winner === 'draw' ? '🤝' : '🏆'}
        </div>
        <h2 id="match-title" className={winner && winner !== 'draw' ? `win-${winner.toLowerCase()}` : ''}>
          {headline}
        </h2>
        {winner && winner !== 'draw' && <div className="tg-result-meta">{winner === myTeam ? 'Your team won!' : 'Your team lost this one.'}</div>}
        <div className="tg-score-row">
          <div className="t-a">
            <small>Team A points</small>
            <b>{points.A}</b>
            <small>{tricks.A} tricks</small>
          </div>
          <span>vs</span>
          <div className="t-b">
            <small>Team B points</small>
            <b>{points.B}</b>
            <small>{tricks.B} tricks</small>
          </div>
        </div>
        <div className="tg-result-line">{why}</div>
        <table className="tg-rounds">
          <thead>
            <tr>
              <th>Round</th>
              <th>Chose</th>
              <th>Path</th>
              <th>Trump</th>
              <th>Tricks A–B</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {rounds.map(r => (
              <tr key={r.round}>
                <td>{r.round}</td>
                <td className={`t-${r.choosingTeam.toLowerCase()}`}>
                  Team {r.choosingTeam} (P{r.chooser})
                </td>
                <td>{r.path}</td>
                <td className={r.trump === '♥' || r.trump === '♦' ? 'is-red' : ''}>{r.trump}</td>
                <td>
                  {r.tricks.A}–{r.tricks.B}
                </td>
                <td className={r.result === 'draw' ? '' : `t-${r.result.toLowerCase()}`}>{r.result === 'draw' ? 'Draw' : `Team ${r.result}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="tg-modal-buttons">
          <button type="button" className="tg-btn tg-btn-outline" onClick={onHome}>
            Home
          </button>
          {isHost ? (
            <button type="button" className="tg-btn" onClick={onRematch}>
              Rematch
            </button>
          ) : (
            <span className="tg-wait-host">Waiting for the host to start a rematch</span>
          )}
        </div>
      </div>
    </div>
  );
}
