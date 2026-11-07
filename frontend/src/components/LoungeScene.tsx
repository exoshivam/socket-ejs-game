import { useEffect, useState } from 'react';

/**
 * Casino-lounge backdrop drawn in SVG (wood walls, lamps, plants, chairs and,
 * when `table` is set, a felt table with cards and chips). If `photo` loads,
 * the photo is shown instead.
 */
export default function LoungeScene({ photo, table = false }: { photo?: string; table?: boolean }) {
  const [photoOk, setPhotoOk] = useState(false);
  useEffect(() => {
    if (!photo) return;
    const img = new Image();
    img.onload = () => setPhotoOk(true);
    img.src = photo;
  }, [photo]);

  return (
    <div className="lounge" aria-hidden="true">
      {photoOk ? (
        <div className="lounge-photo" style={{ backgroundImage: `url('${photo}')` }} />
      ) : (
        <svg className="lounge-svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
          <defs>
            <linearGradient id="ls-wall" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#1c120b" />
              <stop offset="0.55" stopColor="#24170d" />
              <stop offset="1" stopColor="#0d0805" />
            </linearGradient>
            <radialGradient id="ls-glow" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#ffc46e" stopOpacity="0.55" />
              <stop offset="0.4" stopColor="#ff9f40" stopOpacity="0.18" />
              <stop offset="1" stopColor="#ff9f40" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="ls-shade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#f7d9a0" />
              <stop offset="1" stopColor="#c98a3c" />
            </linearGradient>
            <linearGradient id="ls-leather" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#1d3a2a" />
              <stop offset="1" stopColor="#0b1a12" />
            </linearGradient>
            <radialGradient id="ls-felt" cx="0.5" cy="0.45" r="0.6">
              <stop offset="0" stopColor="#1f5c37" />
              <stop offset="0.6" stopColor="#164a2b" />
              <stop offset="1" stopColor="#0c311d" />
            </radialGradient>
            <linearGradient id="ls-wood" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#5e3417" />
              <stop offset="0.5" stopColor="#3b1f0c" />
              <stop offset="1" stopColor="#1d0f06" />
            </linearGradient>
            <linearGradient id="ls-gold" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#8a6422" />
              <stop offset="0.5" stopColor="#f2d38a" />
              <stop offset="1" stopColor="#8a6422" />
            </linearGradient>
            <g id="ls-card">
              <rect x="-62" y="-40" width="124" height="80" rx="7" fill="#0f2a1c" stroke="#c9a35a" strokeWidth="2.2" />
              <rect x="-54" y="-32" width="108" height="64" rx="4" fill="none" stroke="#c9a35a" strokeWidth="0.9" opacity="0.7" />
              <path d="M0-17c-5 7-14 11-14 18a7 7 0 0 0 11 5l-2 8h10l-2-8a7 7 0 0 0 11-5c0-7-9-11-14-18z" fill="#c9a35a" opacity="0.9" />
            </g>
            <g id="ls-chip">
              <ellipse cx="0" cy="6" rx="30" ry="10" fill="#07130c" />
              <rect x="-30" y="0" width="60" height="6" fill="#0d2418" />
              <ellipse cx="0" cy="0" rx="30" ry="10" fill="#123522" stroke="#d9b56a" strokeWidth="2.4" strokeDasharray="7 9" />
            </g>
            <g id="ls-leaf">
              <path d="M0 0C20-30 70-34 110-10 70 6 25 18 0 0z" />
            </g>
          </defs>

          {/* Walls with panelling */}
          <rect width="1600" height="1000" fill="url(#ls-wall)" />
          {[120, 330, 540, 1010, 1240, 1470].map(x => (
            <rect key={x} x={x} y="40" width="170" height="320" rx="6" fill="none" stroke="#3a2414" strokeWidth="3" opacity="0.7" />
          ))}
          <rect y="380" width="1600" height="8" fill="#2a190d" />

          {/* Plants */}
          <g fill="#16341f" stroke="#24502f" strokeWidth="1" opacity="0.9">
            {[[-10, 180, -20], [10, 260, 10], [-20, 340, -35], [30, 120, -60], [0, 420, 20]].map(([x, y, r], i) => (
              <use key={`l${i}`} href="#ls-leaf" transform={`translate(${x} ${y}) rotate(${r}) scale(1.6)`} />
            ))}
            {[[1600, 120, 200], [1610, 220, 160], [1590, 40, 230], [1560, 300, 190]].map(([x, y, r], i) => (
              <use key={`r${i}`} href="#ls-leaf" transform={`translate(${x} ${y}) rotate(${r}) scale(1.5)`} />
            ))}
          </g>

          {/* Lamp, top centre */}
          <circle cx="770" cy="190" r="340" fill="url(#ls-glow)" />
          <ellipse cx="770" cy="372" rx="110" ry="20" fill="#2a1a0d" />
          <rect x="680" y="372" width="180" height="40" fill="#1e1209" />
          <rect x="762" y="215" width="16" height="150" fill="#b8862f" />
          <ellipse cx="770" cy="365" rx="40" ry="9" fill="#8a6422" />
          <path d="M712 120h116l34 95H678z" fill="url(#ls-shade)" />
          <path d="M678 215h184" stroke="#fff3cf" strokeWidth="4" opacity="0.8" />

          {table && (
            <>
              {/* Chairs behind the far side */}
              {[[930, 150], [1150, 130], [1370, 160]].map(([x, y]) => (
                <g key={x}>
                  <rect x={x} y={y} width="190" height="210" rx="70" fill="url(#ls-leather)" stroke="#0a140e" strokeWidth="4" />
                  {[0.25, 0.5, 0.75].map(f => (
                    <line key={f} x1={x + 190 * f} y1={y + 30} x2={x + 190 * f} y2={y + 190} stroke="#0a170f" strokeWidth="3" />
                  ))}
                  {[0.2, 0.4, 0.6, 0.8].map(f => (
                    <circle key={f} cx={x + 190 * f} cy={y + 40} r="4" fill="#0a170f" />
                  ))}
                </g>
              ))}

              {/* Table: side apron, wood rim, gold line, felt */}
              <ellipse cx="1110" cy="630" rx="610" ry="330" fill="#140a04" />
              <ellipse cx="1110" cy="595" rx="610" ry="320" fill="url(#ls-wood)" />
              <ellipse cx="1110" cy="590" rx="560" ry="282" fill="none" stroke="url(#ls-gold)" strokeWidth="5" />
              <ellipse cx="1110" cy="590" rx="555" ry="278" fill="url(#ls-felt)" />
              <ellipse cx="1110" cy="600" rx="430" ry="200" fill="none" stroke="#2f7a4b" strokeWidth="2" opacity="0.55" />
              <path
                d="M1110 470c-30 42-90 66-90 112a46 46 0 0 0 74 33l-14 52h60l-14-52a46 46 0 0 0 74-33c0-46-60-70-90-112z"
                fill="#2d7a4a"
                opacity="0.3"
              />

              {/* Face-down cards */}
              {[[770, 440, 18], [905, 410, -14], [1500, 500, 16], [720, 640, -20], [1370, 720, 14], [1240, 400, 6]].map(([x, y, r], i) => (
                <use key={i} href="#ls-card" transform={`translate(${x} ${y}) rotate(${r})`} />
              ))}

              {/* Chip stacks */}
              {[[1330, 360, 6], [1400, 345, 8], [660, 520, 7], [610, 545, 4], [1530, 640, 6], [1560, 700, 5]].map(([x, y, n], i) => (
                <g key={i} transform={`translate(${x} ${y})`}>
                  {Array.from({ length: n }, (_, k) => (
                    <use key={k} href="#ls-chip" y={-k * 9} />
                  ))}
                </g>
              ))}
            </>
          )}

          {/* Candle and glass, bottom right */}
          <circle cx="1545" cy="900" r="220" fill="url(#ls-glow)" />
          <rect x="1505" y="840" width="70" height="120" rx="8" fill="#e8b46a" opacity="0.22" stroke="#f2d38a" strokeOpacity="0.4" />
          <path d="M1540 840c-8-14 0-26 6-34 4 10 10 18 2 34z" fill="#ffd27a" />
        </svg>
      )}
      <div className="lounge-vignette" />
    </div>
  );
}
