// Pieces of the lobby table shared by the 4p and 6p waiting rooms.

/** Fanned deck with a spade on the top card. */
export function Deck() {
  return (
    <svg className="wr-deck" width="190" height="140" viewBox="0 0 190 140" aria-hidden="true">
      {[-24, -16, -8, 0].map((deg, i) => (
        <g key={deg} transform={`rotate(${deg} 95 130)`}>
          <rect x={60 + i * 4} y="12" width="70" height="100" rx="7" fill="#15130f" stroke="#d9b56a" strokeWidth="1.6" />
          <rect x={65 + i * 4} y="17" width="60" height="90" rx="5" fill="none" stroke="#d9b56a" strokeWidth="0.6" opacity="0.6" />
        </g>
      ))}
      <g transform="rotate(10 95 130)">
        <rect x="80" y="10" width="72" height="102" rx="7" fill="#16140f" stroke="#e7c77f" strokeWidth="2" />
        <rect x="86" y="16" width="60" height="90" rx="5" fill="none" stroke="#d9b56a" strokeWidth="0.8" />
        <path
          d="M116 40c-6 8-16 13-16 21a8 8 0 0 0 13 6l-3 9h12l-3-9a8 8 0 0 0 13-6c0-8-10-13-16-21z"
          fill="none"
          stroke="#e7c77f"
          strokeWidth="2"
        />
      </g>
    </svg>
  );
}

/** Leather chair backs behind the far side and chip stacks beside the rim. */
export function TableDeco() {
  const chip = (x: number, y: number, n: number) =>
    Array.from({ length: n }, (_, k) => (
      <g key={`${x}-${k}`} transform={`translate(${x} ${y - k * 11})`}>
        <ellipse cy="7" rx="34" ry="12" fill="#07130c" />
        <rect x="-34" width="68" height="7" fill="#0d2418" />
        <ellipse rx="34" ry="12" fill="#123522" stroke="#d9b56a" strokeWidth="2.6" strokeDasharray="8 10" />
      </g>
    ));
  return (
    <svg className="wr-deco" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="wr-leather" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#21412f" />
          <stop offset="1" stopColor="#0b1a12" />
        </linearGradient>
      </defs>
      {[300, 520].map(x => (
        <g key={x}>
          <rect x={x} y="0" width="180" height="120" rx="50" fill="url(#wr-leather)" stroke="#08120c" strokeWidth="3" />
          {[0.25, 0.5, 0.75].map(f => (
            <circle key={f} cx={x + 180 * f} cy="30" r="3.5" fill="#08120c" />
          ))}
        </g>
      ))}
      {chip(45, 470, 5)}
      {chip(95, 500, 3)}
      {chip(955, 470, 4)}
      {chip(905, 505, 6)}
    </svg>
  );
}

/** Faint suit symbols printed on the felt. */
export function FeltSuits() {
  return (
    <>
      <span className="wr-suit" style={{ left: '17%', top: '36%' }}>♠</span>
      <span className="wr-suit" style={{ left: '17%', top: '52%' }}>♦</span>
      <span className="wr-suit" style={{ right: '17%', top: '36%' }}>♣</span>
      <span className="wr-suit" style={{ right: '17%', top: '52%' }}>♣</span>
    </>
  );
}
