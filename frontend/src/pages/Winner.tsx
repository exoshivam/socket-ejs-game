import { useState } from 'react';
import { AVATAR_EMOJI, session } from '../session';
import { navigate } from '../router';

const CONFETTI_COLORS = ['#ffd700', '#ff6b6b', '#4ecdc4', '#45b7d1', '#f093fb', '#4facfe'];
const PLACES = [
  { cls: 'winner-card', medal: '🥇', pos: '1st' },
  { cls: 'second-place', medal: '🥈', pos: '2nd' },
  { cls: 'third-place', medal: '🥉', pos: '3rd' },
];

export default function Winner({ roomId }: { roomId: string }) {
  // Rankings come from this browser's game (the EJS page read them from the server).
  const [results] = useState(() => {
    const r = session.finalResults();
    return r && r.roomId === roomId ? r : null;
  });
  const [confetti] = useState(() =>
    Array.from({ length: 50 }, () => ({
      left: Math.random() * 100 + '%',
      background: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      animationDelay: Math.random() * 3 + 's',
      animationDuration: Math.random() * 2 + 2 + 's',
    })),
  );

  const ranked = (results?.rankedPlayers ?? []).map(p => ({
    name: p.name,
    avatar: AVATAR_EMOJI[p.avatar ?? ''] || p.avatar || '👤',
    totalScore: p.totalScore || 0,
  }));
  const stats = results ? { gameTime: '~15 min', cardsPlayed: '260', yourWins: '0' } : { gameTime: 'N/A', cardsPlayed: 'N/A', yourWins: 'N/A' };

  const playAgain = () => {
    if (confirm('Start a new game with the same players?')) {
      navigate(roomId ? `/waiting-room?roomId=${roomId}&replay=true` : '/waiting-room');
    }
  };
  const leaveRoom = () => {
    if (confirm('Are you sure you want to leave this room?')) navigate('/');
  };

  const podium = (i: number, label: string, icon: string, base: string, sparkle = false) => (
    <div className="podium-step">
      <div className="text-center mb-2">
        <div className={sparkle ? 'sparkle' : ''} style={{ fontSize: '2rem', marginBottom: 6 }}>{icon}</div>
        <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#555' }}>{label}</div>
      </div>
      <div className={`podium-base ${base}`}>
        <div className="rank-avatar">{ranked[i].avatar}</div>
        <div className="rank-name">{ranked[i].name}</div>
        <div className="rank-score" style={i === 1 ? { color: '#333' } : undefined}>{ranked[i].totalScore.toFixed(1)}</div>
      </div>
    </div>
  );

  return (
    <div className="winner page-purple flex items-center justify-center p-4">
      <div>
        {confetti.map((style, i) => (
          <div key={i} className="confetti" style={style} />
        ))}
      </div>

      <div className="results-container rounded-3xl shadow-2xl w-full max-w-4xl p-6 sm:p-8 relative overflow-hidden">
        <div className="text-center mb-6">
          <div className="trophy-animation text-7xl sm:text-8xl mb-4">🏆</div>
          <h1 className="game-title text-4xl sm:text-5xl font-black mb-2">GAME COMPLETE!</h1>
          <p className="text-gray-600 text-lg">Final Rankings</p>
        </div>

        {ranked.length >= 3 && (
          <div className="podium">
            {podium(1, '2ND', '🥈', 'second-podium')}
            {podium(0, 'WINNER', '👑', 'first-podium', true)}
            {podium(2, '3RD', '🥉', 'third-podium')}
          </div>
        )}

        <div className="space-y-3 mb-8">
          {ranked.map((p, i) => {
            const place = PLACES[i] ?? { cls: 'fourth-place', medal: '', pos: `${i + 1}th` };
            return (
              <div key={i} className={`${place.cls} rounded-2xl p-4 sm:p-5`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="text-4xl sm:text-5xl">{p.avatar}</div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xl sm:text-2xl font-bold">{place.pos}</span>
                        <span className="text-lg">{place.medal}</span>
                      </div>
                      <div className="font-bold text-base sm:text-lg text-gray-800">{p.name}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl sm:text-4xl font-black text-purple-600">{p.totalScore.toFixed(1)}</div>
                    <div className="text-xs text-gray-600">points</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {[
            ['⏱️', stats.gameTime, 'Game Time'],
            ['🔄', '5', 'Total Rounds'],
            ['🎴', stats.cardsPlayed, 'Cards Played'],
            ['🎯', stats.yourWins, 'Your Wins'],
          ].map(([icon, value, label]) => (
            <div key={label} className="stat-card rounded-xl p-4 text-center">
              <div className="text-3xl mb-2">{icon}</div>
              <div className="text-2xl font-bold text-purple-600">{value}</div>
              <div className="text-xs text-gray-600">{label}</div>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <button className="replay-button action-button w-full py-4 rounded-xl font-bold text-lg shadow-lg" onClick={playAgain}>
            🔄 Play Again
          </button>
          <button className="leave-button action-button w-full py-3 rounded-xl font-semibold shadow-lg" onClick={leaveRoom}>
            🚪 Leave Room
          </button>
        </div>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            Room Code: <span className="font-mono font-bold text-purple-600">{roomId}</span>
          </p>
          <p className="text-xs text-gray-500 mt-2">Thanks for playing Lakadia! 🎮</p>
        </div>
      </div>
    </div>
  );
}
